package discovery

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"readio-cloud/internal/clientip"
	"readio-cloud/internal/httputil"
	"readio-cloud/internal/observability"
	"readio-cloud/internal/podcastindex"
)

const RoutePrefix = "/api/v1/discovery/"

const (
	discoveryRoutePrefix                                     = RoutePrefix
	discoverySearchPodcastsRoute                             = "/api/v1/discovery/search/podcasts"
	discoverySearchEpisodesRoute                             = "/api/v1/discovery/search/episodes"
	discoverySearchCacheRoute                                = "/api/v1/discovery/search/cache"
	discoveryTopPodcastsRoute                                = "/api/v1/discovery/top-podcasts"
	discoveryTopEpisodesRoute                                = "/api/v1/discovery/top-episodes"
	discoveryPodcastsRoute                                   = "/api/v1/discovery/podcasts"
	discoveryPodcastsBatchRoute                              = "/api/v1/discovery/podcasts/batch"
	discoveryPodcastByItunesIDRoutePattern                   = "/api/v1/discovery/podcasts/:itunesId"
	discoveryPodcastEpisodesByItunesIDRoutePattern           = "/api/v1/discovery/podcasts/:itunesId/episodes"
	discoverySearchBaseURL                                   = "https://itunes.apple.com/search"
	discoveryAppleChartsBaseURL                              = "https://rss.marketingtools.apple.com/api/v2"
	discoveryUserAgent                                       = "Readio/1.0 (Cloud Discovery; +https://www.readio.top)"
	discoveryBrowserUserAgent                                = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
	discoveryRequestTimeout                                  = 15 * time.Second
	discoveryBodyLimit                                 int64 = 30 << 20
	discoverySlowRequestThreshold                            = 5 * time.Second
	defaultDiscoveryCountry                                  = "us"
	defaultDiscoveryPodcastSearchLimit                       = 20
	defaultDiscoveryEpisodeSearchLimit                       = 50
	defaultDiscoveryTopLimit                                 = 25
	maxDiscoverySearchLimit                                  = 200
	defaultDiscoveryCacheSearchLimit                         = 5
	maxDiscoveryCacheSearchLimit                             = 10
	discoveryCacheSearchTimeout                              = 2 * time.Second
	maxDiscoveryTopLimit                                     = 100
	discoveryCacheMaxKeys                                    = 256
	discoverySearchRateLimitBurst                            = 30
	discoverySearchRateLimitWindow                           = time.Minute
	discoverySearchRateLimitBurstEnv                         = "READIO_DISCOVERY_SEARCH_RATE_LIMIT_BURST"
	discoverySearchRateLimitWindowMsEnv                      = "READIO_DISCOVERY_SEARCH_RATE_LIMIT_WINDOW_MS"
	discoveryTopRateLimitBurst                               = 20
	discoveryTopRateLimitWindow                              = time.Minute
	discoveryTopRateLimitBurstEnv                            = "READIO_DISCOVERY_TOP_RATE_LIMIT_BURST"
	discoveryTopRateLimitWindowMsEnv                         = "READIO_DISCOVERY_TOP_RATE_LIMIT_WINDOW_MS"
	discoveryPodcastIndexRateLimitBurst                      = 20
	discoveryPodcastIndexRateLimitWindow                     = time.Minute
	discoveryPodcastIndexRateLimitBurstEnv                   = "READIO_DISCOVERY_PODCAST_INDEX_RATE_LIMIT_BURST"
	discoveryPodcastIndexRateLimitWindowMsEnv                = "READIO_DISCOVERY_PODCAST_INDEX_RATE_LIMIT_WINDOW_MS"
	discoveryPodcastIndexLocalReadRateLimitBurst             = 120
	discoveryPodcastIndexLocalReadRateLimitWindow            = time.Minute
	discoveryPodcastIndexLocalReadRateLimitBurstEnv          = "READIO_DISCOVERY_PODCAST_INDEX_LOCAL_READ_RATE_LIMIT_BURST"
	discoveryPodcastIndexLocalReadRateLimitWindowMsEnv       = "READIO_DISCOVERY_PODCAST_INDEX_LOCAL_READ_RATE_LIMIT_WINDOW_MS"
	discoveryAllowedOriginsEnv                               = "READIO_DISCOVERY_ALLOWED_ORIGINS"
)

// Shared Discovery Response Types

// PodcastIndex episode detail (guid as identity)
// PI Podcast response (canonical format for PI podcast-byitunesid and batch-byguid)
// Identity: podcastItunesId
type piPodcastResponse struct {
	Title           string   `json:"title"`
	Author          string   `json:"author"`
	Artwork         string   `json:"artwork"`
	Description     string   `json:"description"`
	LastUpdateTime  int64    `json:"lastUpdateTime"`
	PodcastItunesID string   `json:"podcastItunesId"`
	EpisodeCount    int64    `json:"episodeCount"`
	Language        string   `json:"language,omitempty"`
	Genres          []string `json:"genres"`
}

// Discovery cache policy.
//
// Cached routes (and cache key dimensions):
//
//   - top-podcasts   → country, limit           (24 hour TTL)
//   - top-episodes   → country, limit           (24 hour TTL)
//   - PI lookups     → route-specific keys      (24 hour TTL)
//
// Error responses (upstream failures, param errors, timeouts) are NEVER cached.
// Search responses are NOT cached (high cardinality).

var (
	discoveryCountryPattern    = regexp.MustCompile(`^[a-z]{2}$`)
	discoveryTokenSplitPattern = regexp.MustCompile(`[\s,.!?;:'"()[\]{}]+`)
	errDiscoveryTimeout        = errors.New("discovery upstream timeout")
	errDiscoveryTooLarge       = errors.New("discovery upstream response too large")
	errDiscoveryDecode         = errors.New("discovery upstream response invalid")

	errDiscoveryUpstreamError               = errors.New("discovery upstream error")
	errDiscoveryRateLimited                 = errors.New("discovery request rate limited")
	errDiscoveryHostUnresolvable            = errors.New("discovery host unresolvable")
	errDiscoveryMethodNotAllowedError       = errors.New("method not allowed")
	errDiscoveryCacheSearchUnavailableError = errors.New("cache search unavailable")
	discoveryStopWords                      = map[string]struct{}{
		"the": {}, "a": {}, "an": {}, "and": {}, "or": {}, "of": {}, "in": {}, "on": {},
		"at": {}, "to": {}, "for": {}, "with": {}, "by": {}, "is": {}, "it": {}, "that": {},
		"this": {}, "podcast": {}, "audio": {}, "episode": {}, "episodes": {},
	}
)

func tokenizeDiscoveryQuery(query string) []string {
	rawTokens := discoveryTokenSplitPattern.Split(strings.ToLower(query), -1)
	tokens := make([]string, 0, len(rawTokens))
	for _, token := range rawTokens {
		token = strings.TrimSpace(token)
		if len(token) <= 1 {
			continue
		}
		if _, blocked := discoveryStopWords[token]; blocked {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

// Cache status constants for observability (low cardinality).
const (
	CacheStatusFreshHit            = "fresh_hit"
	CacheStatusRefreshed           = "refreshed"
	CacheStatusPersistenceFallback = "persistence_fallback"
	CacheStatusStaleFallback       = "stale_fallback"
	CacheStatusMissError           = "miss_error"
	CacheStatusUncached            = "uncached"
)

// Upstream kind constants for observability.
const (
	UpstreamKindAppleSearch  = "apple-search"
	UpstreamKindAppleCharts  = "apple-charts"
	UpstreamKindPodcastIndex = "podcastindex"
)

type discoveryService struct {
	client                       *http.Client
	timeout                      time.Duration
	appleChartsBaseURL           string
	searchBaseURL                string
	userAgent                    string
	bodyLimit                    int64
	lookupIP                     func(context.Context, string) ([]net.IPAddr, error)
	searchLimiter                *httputil.RateLimiter
	topLimiter                   *httputil.RateLimiter
	podcastIndexLimiter          *httputil.RateLimiter
	podcastIndexLocalReadLimiter *httputil.RateLimiter
	trustedProxies               clientip.TrustedProxySet
	cache                        *discoveryCache
	cacheOwner                   singleflight.Group
	piEpisodeCacheStore          *podcastindex.PIEpisodeCacheStore
	piEpisodeReadPathMu          sync.Mutex
	piEpisodeReadPath            *podcastindex.PIEpisodeReadPathService
	podcastIndexConfig           podcastIndexConfig
	allowedOrigins               []string
}

type discoveryParamError struct {
	code    string
	message string
}

type discoveryErrorSpec struct {
	code    string
	message string
}

var (
	discoveryErrMethodNotAllowed = discoveryErrorSpec{
		code:    "METHOD_NOT_ALLOWED",
		message: "only GET and certain POSTs are allowed",
	}
	discoveryErrSimpleMethodNotAllowed = discoveryErrorSpec{
		code:    "METHOD_NOT_ALLOWED",
		message: "method not allowed",
	}
	discoveryErrNotFound = discoveryErrorSpec{
		code:    "NOT_FOUND",
		message: "unknown discovery endpoint",
	}
	discoveryErrRateLimited = discoveryErrorSpec{
		code:    "RATE_LIMITED",
		message: "rate limit exceeded",
	}

	discoveryErrBodyTooLarge = discoveryErrorSpec{
		code:    "BODY_TOO_LARGE",
		message: "request body exceeds maximum allowed size",
	}
	discoveryErrInvalidGuidBatch = discoveryErrorSpec{
		code:    "INVALID_GUID_BATCH",
		message: "request body must be a JSON array of podcast GUIDs",
	}
	discoveryErrInvalidGuidBatchTooMany = discoveryErrorSpec{
		code:    "INVALID_GUID_BATCH",
		message: "too many GUIDs (max 100)",
	}
	discoveryErrInvalidGuidBatchTooLarge = discoveryErrorSpec{
		code:    "INVALID_GUID_BATCH",
		message: "request body too large",
	}
	discoveryErrUpstreamInvalidResponseStatus = discoveryErrorSpec{
		code:    "UPSTREAM_INVALID_RESPONSE",
		message: "discovery upstream returned a non-success status",
	}
	discoveryErrUpstreamInvalidResponsePayload = discoveryErrorSpec{
		code:    "UPSTREAM_INVALID_RESPONSE",
		message: "discovery upstream returned an invalid response",
	}
	discoveryErrUpstreamTimeout = discoveryErrorSpec{
		code:    "UPSTREAM_TIMEOUT",
		message: "discovery upstream request timed out",
	}
	discoveryErrUpstreamTooLarge = discoveryErrorSpec{
		code:    "UPSTREAM_TOO_LARGE",
		message: "discovery upstream response exceeded the allowed size",
	}
	discoveryErrInvalidUpstreamPayload = discoveryErrorSpec{
		code:    "INVALID_UPSTREAM_PAYLOAD",
		message: "discovery upstream response was not valid JSON",
	}
	discoveryErrUpstreamRequestFailed = discoveryErrorSpec{
		code:    "UPSTREAM_REQUEST_FAILED",
		message: "discovery upstream request failed",
	}
	discoveryErrProviderNotConfigured = discoveryErrorSpec{
		code:    "DISCOVERY_PROVIDER_NOT_CONFIGURED",
		message: "podcastindex provider is not configured",
	}
	discoveryErrCacheSearchUnavailable = discoveryErrorSpec{
		code:    "CACHE_SEARCH_UNAVAILABLE",
		message: "cache search is unavailable",
	}
)

func (e *discoveryParamError) Error() string {
	return e.message
}

type discoveryUpstreamStatusError struct {
	status int
}

func (e *discoveryUpstreamStatusError) Error() string {
	return fmt.Sprintf("discovery upstream returned status %d", e.status)
}

func NewDiscoveryService(piEpisodeCacheStores ...*podcastindex.PIEpisodeCacheStore) http.Handler {
	burst := resolveDiscoverySearchRateLimitBurst()
	if burst <= 0 {
		slog.Warn(
			"application-layer rate limiting disabled for discovery search",
			discoverySearchRateLimitBurstEnv,
			burst,
		)
	}
	topBurst := resolveDiscoveryTopRateLimitBurst()
	if topBurst <= 0 {
		slog.Warn(
			"application-layer rate limiting disabled for discovery top routes",
			discoveryTopRateLimitBurstEnv,
			topBurst,
		)
	}
	podcastIndexBurst := resolveDiscoveryPodcastIndexRateLimitBurst()
	if podcastIndexBurst <= 0 {
		slog.Warn(
			"application-layer rate limiting disabled for discovery podcastindex routes",
			discoveryPodcastIndexRateLimitBurstEnv,
			podcastIndexBurst,
		)
	}
	podcastIndexLocalReadBurst := resolveDiscoveryPodcastIndexLocalReadRateLimitBurst()
	if podcastIndexLocalReadBurst <= 0 {
		slog.Warn(
			"application-layer rate limiting disabled for discovery podcastindex local-read routes",
			discoveryPodcastIndexLocalReadRateLimitBurstEnv,
			podcastIndexLocalReadBurst,
		)
	}
	var piEpisodeCacheStore *podcastindex.PIEpisodeCacheStore
	if len(piEpisodeCacheStores) > 0 {
		piEpisodeCacheStore = piEpisodeCacheStores[0]
	}
	return &discoveryService{
		// PodcastIndex and Apple iTunes Search/Charts both flow through this
		// client. Both are tightly controlled upstreams with bounded URL
		// shapes, so the transport is wrapped with the project's instrumented
		// transport to produce local outbound spans. Trace propagation is
		// disabled so traceparent is never sent to these third-party hosts.
		client: &http.Client{
			Timeout: discoveryRequestTimeout,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
			Transport: observability.NewInstrumentedTransport(http.DefaultTransport),
		},
		timeout:                      discoveryRequestTimeout,
		searchBaseURL:                discoverySearchBaseURL,
		appleChartsBaseURL:           discoveryAppleChartsBaseURL,
		userAgent:                    discoveryUserAgent,
		bodyLimit:                    discoveryBodyLimit,
		lookupIP:                     net.DefaultResolver.LookupIPAddr,
		searchLimiter:                httputil.NewRateLimiter(burst, resolveDiscoverySearchRateLimitWindow(), time.Now),
		topLimiter:                   httputil.NewRateLimiter(topBurst, resolveDiscoveryTopRateLimitWindow(), time.Now),
		podcastIndexLimiter:          httputil.NewRateLimiter(podcastIndexBurst, resolveDiscoveryPodcastIndexRateLimitWindow(), time.Now),
		podcastIndexLocalReadLimiter: httputil.NewRateLimiter(podcastIndexLocalReadBurst, resolveDiscoveryPodcastIndexLocalReadRateLimitWindow(), time.Now),
		trustedProxies:               clientip.LoadTrustedProxySet(slog.Default()),
		cache:                        newDiscoveryCache(discoveryCacheMaxKeys),
		piEpisodeCacheStore:          piEpisodeCacheStore,
		podcastIndexConfig:           getPodcastIndexConfig(),
		allowedOrigins:               resolveDiscoveryAllowedOrigins(),
	}
}

func (s *discoveryService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	// CORS Authorization
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	var isAllowedOrigin bool
	if origin != "" {
		if match, ok := httputil.MatchOrigin(s.allowedOrigins, origin); ok {
			isAllowedOrigin = true
			w.Header().Set("Access-Control-Allow-Origin", match)
			w.Header().Set("Vary", "Origin")
		}
	}

	if r.Method == http.MethodOptions {
		if isAllowedOrigin {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, traceparent")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	cleanedPath := path.Clean(r.URL.Path)

	_, isPodcastEpisodesByItunesIDRoute := discoveryPodcastEpisodesByItunesIDFromPath(cleanedPath)
	_, isPodcastByItunesIDRoute := discoveryPodcastByItunesIDFromPath(cleanedPath)
	allowedMethod := r.Method == http.MethodGet || (r.Method == http.MethodPost && cleanedPath == discoveryPodcastsBatchRoute)
	if !allowedMethod {
		w.Header().Set("Allow", strings.Join([]string{http.MethodGet, http.MethodPost}, ", "))
		writeDiscoveryErrorSpec(r, w, http.StatusMethodNotAllowed, discoveryErrMethodNotAllowed)
		observability.RecordHTTPMetric(r.Context(), cleanedPath, http.StatusMethodNotAllowed, "invalid_method", time.Since(start))
		return
	}

	switch cleanedPath {
	case discoverySearchPodcastsRoute:
		s.handleSearchPodcasts(w, r)
	case discoverySearchEpisodesRoute:
		s.handleSearchEpisodes(w, r)
	case discoverySearchCacheRoute:
		s.handleSearchCache(w, r)
	case discoveryTopPodcastsRoute:
		s.handleTopPodcasts(w, r)
	case discoveryTopEpisodesRoute:
		s.handleTopEpisodes(w, r)
	case discoveryPodcastsBatchRoute:
		s.handlePodcastIndexPodcastsBatchByGUID(w, r)
	default:
		if isPodcastEpisodesByItunesIDRoute {
			s.handlePodcastIndexPodcastEpisodesByItunesID(w, r)
			return
		}
		if isPodcastByItunesIDRoute {
			s.handlePodcastIndexPodcastByItunesID(w, r)
			return
		}
		writeDiscoveryErrorSpec(r, w, http.StatusNotFound, discoveryErrNotFound)
		observability.RecordHTTPMetric(r.Context(), cleanedPath, http.StatusNotFound, "unknown", time.Since(start))
	}
}
