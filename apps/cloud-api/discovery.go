package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	discoveryRoutePrefix                                = "/api/v1/discovery/"
	discoverySearchPodcastsRoute                        = "/api/v1/discovery/search/podcasts"
	discoverySearchEpisodesRoute                        = "/api/v1/discovery/search/episodes"
	discoveryTopPodcastsRoute                           = "/api/v1/discovery/top-podcasts"
	discoveryTopEpisodesRoute                           = "/api/v1/discovery/top-episodes"
	discoveryFeedRoute                                  = "/api/v1/discovery/feed"
	discoveryPodcastIndexPodcastsBatchByGUIDRoute       = "/api/v1/discovery/podcast-index/podcasts-batch-byguid"
	discoveryPodcastIndexPodcastByItunesIDRoute         = "/api/v1/discovery/podcast-index/podcast-byitunesid"
	discoverySearchBaseURL                              = "https://itunes.apple.com/search"
	discoveryRSSBaseURL                                 = "https://rss.marketingtools.apple.com/api/v2"
	discoveryUserAgent                                  = "Readio/1.0 (Cloud Discovery; +https://www.readio.top)"
	discoveryBrowserUserAgent                           = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
	discoveryRequestTimeout                             = 15 * time.Second
	discoveryBodyLimit                            int64 = 30 << 20
	discoverySlowRequestThreshold                       = 5 * time.Second
	defaultDiscoveryCountry                             = "us"
	defaultDiscoveryPodcastSearchLimit                  = 20
	defaultDiscoveryEpisodeSearchLimit                  = 50
	defaultDiscoveryTopLimit                            = 25
	maxDiscoverySearchLimit                             = 200
	maxDiscoveryTopLimit                                = 100
	discoveryCacheMaxKeys                               = 256
	discoverySearchRateLimitBurst                       = 30
	discoverySearchRateLimitWindow                      = time.Minute
	discoverySearchRateLimitBurstEnv                    = "READIO_DISCOVERY_SEARCH_RATE_LIMIT_BURST"
	discoverySearchRateLimitWindowMsEnv                 = "READIO_DISCOVERY_SEARCH_RATE_LIMIT_WINDOW_MS"
	discoveryTopRateLimitBurst                          = 20
	discoveryTopRateLimitWindow                         = time.Minute
	discoveryTopRateLimitBurstEnv                       = "READIO_DISCOVERY_TOP_RATE_LIMIT_BURST"
	discoveryTopRateLimitWindowMsEnv                    = "READIO_DISCOVERY_TOP_RATE_LIMIT_WINDOW_MS"
	discoveryFeedRateLimitBurst                         = 20
	discoveryFeedRateLimitWindow                        = time.Minute
	discoveryFeedRateLimitBurstEnv                      = "READIO_DISCOVERY_FEED_RATE_LIMIT_BURST"
	discoveryFeedRateLimitWindowMsEnv                   = "READIO_DISCOVERY_FEED_RATE_LIMIT_WINDOW_MS"
	discoveryPodcastIndexRateLimitBurst                 = 20
	discoveryPodcastIndexRateLimitWindow                = time.Minute
	discoveryPodcastIndexRateLimitBurstEnv              = "READIO_DISCOVERY_PODCAST_INDEX_RATE_LIMIT_BURST"
	discoveryPodcastIndexRateLimitWindowMsEnv           = "READIO_DISCOVERY_PODCAST_INDEX_RATE_LIMIT_WINDOW_MS"
)

// Shared Discovery Response Types

type discoveryGenre struct {
	GenreID string `json:"genreId"`
	Name    string `json:"name"`
	URL     string `json:"url,omitempty"`
}

// PodcastIndex episode detail (episodeGuid as identity)
// PI Podcast response (canonical format for PI podcast-byitunesid and batch-byguid)
// Identity: podcastItunesId
type piPodcastResponse struct {
	Title           string   `json:"title"`
	Author          string   `json:"author"`
	Artwork         string   `json:"artwork"`
	Description     string   `json:"description"`
	FeedURL         string   `json:"feedUrl"`
	LastUpdateTime  *int64   `json:"lastUpdateTime,omitempty"`
	PodcastItunesID string   `json:"podcastItunesId"`
	EpisodeCount    *int64   `json:"episodeCount,omitempty"`
	Language        string   `json:"language,omitempty"`
	Genres          []string `json:"genres"`
	Dead            bool     `json:"dead"`
}

// Type alias for backwards compatibility with PodcastIndex episode handler
// Discovery cache policy.
//
// Cached routes (and cache key dimensions):
//
//   - top-podcasts   → country, limit           (24 hour TTL)
//   - top-episodes   → country, limit           (24 hour TTL)
//
// Error responses (upstream failures, param errors, timeouts) are NEVER cached.
// Feed responses are NOT cached (deferred).
// Search responses are NOT cached (high cardinality).
var discoveryCacheTTLTopPodcasts = 24 * time.Hour
var discoveryCacheTTLTopEpisodes = 24 * time.Hour
var discoveryCacheTTLLookup = 24 * time.Hour

type discoveryCacheEntry struct {
	data      any
	expiresAt time.Time
}

type discoveryCache struct {
	mu      sync.RWMutex
	entries map[string]discoveryCacheEntry
	maxKeys int
}

func newDiscoveryCache(maxKeys int) *discoveryCache {
	return &discoveryCache{
		entries: make(map[string]discoveryCacheEntry),
		maxKeys: maxKeys,
	}
}

func discoveryCacheGetWithStatus[T any](c *discoveryCache, key string) (T, string, bool) {
	var zero T
	c.mu.RLock()
	entry, ok := c.entries[key]
	c.mu.RUnlock()
	if !ok {
		return zero, "miss", false
	}
	data, ok := entry.data.(T)
	if !ok {
		return zero, "miss", false
	}
	if time.Now().Before(entry.expiresAt) {
		return data, "fresh", true
	}
	return data, "stale", true
}

func discoveryCacheSet[T any](c *discoveryCache, key string, data T, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.maxKeys {
		now := time.Now()
		evicted := false
		for k, v := range c.entries {
			if now.After(v.expiresAt) {
				delete(c.entries, k)
				evicted = true
				break
			}
		}
		if !evicted {
			var nearestKey string
			var nearestExpiry time.Time
			first := true
			for k, v := range c.entries {
				if first || v.expiresAt.Before(nearestExpiry) {
					nearestKey = k
					nearestExpiry = v.expiresAt
					first = false
				}
			}
			delete(c.entries, nearestKey)
		}
	}
	c.entries[key] = discoveryCacheEntry{
		data:      data,
		expiresAt: time.Now().Add(ttl),
	}
}

// getWithGracefulDegradation provides cache-ahead with stale-fallback semantics.
func getWithGracefulDegradation[T any](
	s *discoveryService,
	ctx context.Context,
	cacheKey string,
	ttl time.Duration,
	fetch func(context.Context) (T, error),
) (T, string, error) {
	var zero T
	data, status, ok := discoveryCacheGetWithStatus[T](s.cache, cacheKey)
	if ok && status == "fresh" {
		return data, CacheStatusFreshHit, nil
	}

	resultAny, err, _ := s.cacheOwner.Do(cacheKey, func() (any, error) {
		return fetch(ctx)
	})
	if err != nil {
		if ok && isGracefulDegradationUpstreamError(err) {
			return data, CacheStatusStaleFallback, nil
		}
		return zero, CacheStatusMissError, err
	}

	result, ok := resultAny.(T)
	if !ok {
		return zero, CacheStatusMissError, fmt.Errorf("discovery cache type mismatch for key %s", cacheKey)
	}

	discoveryCacheSet(s.cache, cacheKey, result, ttl)
	return result, CacheStatusRefreshed, nil
}

func isGracefulDegradationUpstreamError(err error) bool {
	var configErr *discoveryProviderConfigError
	if errors.As(err, &configErr) {
		return false
	}

	if errors.Is(err, errDiscoveryUpstreamError) ||
		errors.Is(err, errDiscoveryTimeout) ||
		errors.Is(err, errDiscoveryTooLarge) ||
		errors.Is(err, errDiscoveryChartInvalidPayload) ||
		errors.Is(err, errDiscoveryHostUnresolvable) ||
		errors.Is(err, &discoveryUpstreamStatusError{}) {
		return true
	}
	var piInvalidErr *podcastIndexInvalidResponseError
	if errors.As(err, &piInvalidErr) {
		return true
	}
	if err != nil {
		errStr := err.Error()
		return strings.Contains(errStr, "upstream returned status") ||
			strings.Contains(errStr, "discovery chart payload invalid")
	}
	return false
}

var (
	discoveryCountryPattern    = regexp.MustCompile(`^[a-z]{2}$`)
	discoveryTokenSplitPattern = regexp.MustCompile(`[\s,.!?;:'"()[\]{}]+`)
	errDiscoveryTimeout        = errors.New("discovery upstream timeout")
	errDiscoveryTooLarge       = errors.New("discovery upstream response too large")
	errDiscoveryDecode         = errors.New("discovery upstream response invalid")
	errDiscoveryXMLDecode      = errors.New("discovery upstream response invalid XML")

	errDiscoveryUpstreamError    = errors.New("discovery upstream error")
	errDiscoveryRateLimited      = errors.New("discovery request rate limited")
	errDiscoveryHostUnresolvable = errors.New("discovery host unresolvable")
	discoveryStopWords           = map[string]struct{}{
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
	CacheStatusFreshHit      = "fresh_hit"
	CacheStatusRefreshed     = "refreshed"
	CacheStatusStaleFallback = "stale_fallback"
	CacheStatusMissError     = "miss_error"
	CacheStatusUncached      = "uncached"
)

// Upstream kind constants for observability.
const (
	UpstreamKindAppleSearch  = "apple-search"
	UpstreamKindAppleFeed    = "apple-feed"
	UpstreamKindAppleLookup  = "apple-lookup"
	UpstreamKindFeed         = "feed"
	UpstreamKindPodcastIndex = "podcastindex"
)

type discoveryService struct {
	client              *http.Client
	timeout             time.Duration
	rssBaseURL          string
	searchBaseURL       string
	userAgent           string
	bodyLimit           int64
	lookupIP            func(context.Context, string) ([]net.IPAddr, error)
	dialContext         func(context.Context, string, string) (net.Conn, error)
	searchLimiter       *rateLimiter
	topLimiter          *rateLimiter
	feedLimiter         *rateLimiter
	podcastIndexLimiter *rateLimiter
	trustedProxies      trustedProxySet
	cache               *discoveryCache
	cacheOwner          singleflight.Group
	podcastIndexConfig  podcastIndexConfig
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
	discoveryErrMissingIdentifier = discoveryErrorSpec{
		code:    "MISSING_IDENTIFIER",
		message: "podcastItunesId query parameter is required",
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
	discoveryErrInvalidUpstreamXML = discoveryErrorSpec{
		code:    "INVALID_UPSTREAM_XML",
		message: "discovery upstream response was not valid XML",
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

func newDiscoveryService() *discoveryService {
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
	feedBurst := resolveDiscoveryFeedRateLimitBurst()
	if feedBurst <= 0 {
		slog.Warn(
			"application-layer rate limiting disabled for discovery feed routes",
			discoveryFeedRateLimitBurstEnv,
			feedBurst,
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

	return &discoveryService{
		client: &http.Client{
			Timeout: discoveryRequestTimeout,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		timeout:             discoveryRequestTimeout,
		searchBaseURL:       discoverySearchBaseURL,
		rssBaseURL:          discoveryRSSBaseURL,
		userAgent:           discoveryUserAgent,
		bodyLimit:           discoveryBodyLimit,
		lookupIP:            net.DefaultResolver.LookupIPAddr,
		searchLimiter:       newRateLimiter(burst, resolveDiscoverySearchRateLimitWindow(), time.Now),
		topLimiter:          newRateLimiter(topBurst, resolveDiscoveryTopRateLimitWindow(), time.Now),
		feedLimiter:         newRateLimiter(feedBurst, resolveDiscoveryFeedRateLimitWindow(), time.Now),
		podcastIndexLimiter: newRateLimiter(podcastIndexBurst, resolveDiscoveryPodcastIndexRateLimitWindow(), time.Now),
		trustedProxies:      loadTrustedProxySet(slog.Default()),
		cache:               newDiscoveryCache(discoveryCacheMaxKeys),
		podcastIndexConfig:  getPodcastIndexConfig(),
	}
}

func resolveDiscoverySearchRateLimitBurst() int {
	raw := strings.TrimSpace(os.Getenv(discoverySearchRateLimitBurstEnv))
	if raw == "" {
		return discoverySearchRateLimitBurst
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return discoverySearchRateLimitBurst
	}
	return value
}

func resolveDiscoverySearchRateLimitWindow() time.Duration {
	raw := strings.TrimSpace(os.Getenv(discoverySearchRateLimitWindowMsEnv))
	if raw == "" {
		return discoverySearchRateLimitWindow
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return discoverySearchRateLimitWindow
	}
	return time.Duration(value) * time.Millisecond
}

func resolveDiscoveryTopRateLimitBurst() int {
	raw := strings.TrimSpace(os.Getenv(discoveryTopRateLimitBurstEnv))
	if raw == "" {
		return discoveryTopRateLimitBurst
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return discoveryTopRateLimitBurst
	}
	return value
}

func resolveDiscoveryTopRateLimitWindow() time.Duration {
	raw := strings.TrimSpace(os.Getenv(discoveryTopRateLimitWindowMsEnv))
	if raw == "" {
		return discoveryTopRateLimitWindow
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return discoveryTopRateLimitWindow
	}
	return time.Duration(value) * time.Millisecond
}

func resolveDiscoveryFeedRateLimitBurst() int {
	raw := strings.TrimSpace(os.Getenv(discoveryFeedRateLimitBurstEnv))
	if raw == "" {
		return discoveryFeedRateLimitBurst
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return discoveryFeedRateLimitBurst
	}
	return value
}

func resolveDiscoveryFeedRateLimitWindow() time.Duration {
	raw := strings.TrimSpace(os.Getenv(discoveryFeedRateLimitWindowMsEnv))
	if raw == "" {
		return discoveryFeedRateLimitWindow
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return discoveryFeedRateLimitWindow
	}
	return time.Duration(value) * time.Millisecond
}

func resolveDiscoveryPodcastIndexRateLimitBurst() int {
	raw := strings.TrimSpace(os.Getenv(discoveryPodcastIndexRateLimitBurstEnv))
	if raw == "" {
		return discoveryPodcastIndexRateLimitBurst
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return discoveryPodcastIndexRateLimitBurst
	}
	return value
}

func resolveDiscoveryPodcastIndexRateLimitWindow() time.Duration {
	raw := strings.TrimSpace(os.Getenv(discoveryPodcastIndexRateLimitWindowMsEnv))
	if raw == "" {
		return discoveryPodcastIndexRateLimitWindow
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return discoveryPodcastIndexRateLimitWindow
	}
	return time.Duration(value) * time.Millisecond
}

func (s *discoveryService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	allowedMethod := r.Method == http.MethodGet || (r.Method == http.MethodPost && (path.Clean(r.URL.Path) == discoveryPodcastIndexPodcastsBatchByGUIDRoute))
	if !allowedMethod {
		w.Header().Set("Allow", strings.Join([]string{http.MethodGet, http.MethodPost}, ", "))
		writeDiscoveryErrorSpec(w, http.StatusMethodNotAllowed, discoveryErrMethodNotAllowed)
		return
	}

	switch path.Clean(r.URL.Path) {
	case discoverySearchPodcastsRoute:
		s.handleSearchPodcasts(w, r)
	case discoverySearchEpisodesRoute:
		s.handleSearchEpisodes(w, r)
	case discoveryTopPodcastsRoute:
		s.handleTopPodcasts(w, r)
	case discoveryTopEpisodesRoute:
		s.handleTopEpisodes(w, r)
	case discoveryFeedRoute:
		s.handleFeed(w, r)
	case discoveryPodcastIndexPodcastsBatchByGUIDRoute:
		s.handlePodcastIndexPodcastsBatchByGUID(w, r)
	case discoveryPodcastIndexPodcastByItunesIDRoute:
		s.handlePodcastIndexPodcastByItunesID(w, r)
	default:
		writeDiscoveryErrorSpec(w, http.StatusNotFound, discoveryErrNotFound)
	}
}

func logDiscoveryRequest(route, upstreamKind, upstreamHost string, elapsed time.Duration, err error, cacheStatus string) {
	// Extract hostname if a full URL was passed.
	if parsed, parseErr := url.Parse(upstreamHost); parseErr == nil && parsed.Host != "" {
		upstreamHost = parsed.Host
	}

	var upstreamStatus int
	var timedOut bool
	errorClass := classifyDiscoveryError(err)

	if err != nil {
		var statusErr *discoveryUpstreamStatusError
		if errors.As(err, &statusErr) {
			upstreamStatus = statusErr.status
		}
		if errors.Is(err, errDiscoveryTimeout) {
			timedOut = true
		}
	}

	attrs := []any{
		slog.String("route", route),
		slog.String("upstream_kind", upstreamKind),
		slog.String("upstream_host", upstreamHost),
		slog.Int64("elapsed_ms", elapsed.Milliseconds()),
		slog.String("error_class", errorClass),
		slog.Int("upstream_status", upstreamStatus),
		slog.Bool("timed_out", timedOut),
		slog.String("cache_status", cacheStatus),
	}

	if elapsed >= discoverySlowRequestThreshold || err != nil {
		slog.Warn("discovery request", attrs...)
	} else {
		slog.Info("discovery request", attrs...)
	}
}

func classifyDiscoveryError(err error) string {
	if err == nil {
		return "none"
	}

	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		return "param_error"
	}

	if errors.Is(err, errDiscoveryTimeout) {
		return "timeout"
	}

	var statusErr *discoveryUpstreamStatusError
	if errors.As(err, &statusErr) {
		return "upstream_status"
	}

	if errors.Is(err, errDiscoveryDecode) {
		return "decode"
	}

	if errors.Is(err, errDiscoveryXMLDecode) {
		return "xml_decode"
	}

	if errors.Is(err, errDiscoveryTooLarge) {
		return "too_large"
	}

	if errors.Is(err, errDiscoveryRateLimited) {
		return "rate_limit"
	}

	return "unknown"
}

func (s *discoveryService) allowSearchRequest(remoteAddr string) bool {
	if s == nil || s.searchLimiter == nil {
		return true
	}

	return s.searchLimiter.allow(remoteAddr)
}

func (s *discoveryService) allowTopRequest(remoteAddr string) bool {
	if s == nil || s.topLimiter == nil {
		return true
	}

	return s.topLimiter.allow(remoteAddr)
}

func (s *discoveryService) allowFeedRequest(remoteAddr string) bool {
	if s == nil || s.feedLimiter == nil {
		return true
	}

	return s.feedLimiter.allow(remoteAddr)
}

func (s *discoveryService) allowPodcastIndexRequest(remoteAddr string) bool {
	if s == nil || s.podcastIndexLimiter == nil {
		return true
	}

	return s.podcastIndexLimiter.allow(remoteAddr)
}

func parseDiscoveryCountry(values url.Values) (string, error) {
	country := strings.ToLower(strings.TrimSpace(values.Get("country")))
	if country == "" {
		return defaultDiscoveryCountry, nil
	}
	if !discoveryCountryPattern.MatchString(country) {
		return "", &discoveryParamError{
			code:    "INVALID_COUNTRY",
			message: "country must be a 2-letter lowercase code",
		}
	}
	return country, nil
}

func parseDiscoveryTerm(values url.Values) (string, error) {
	term := strings.ToLower(strings.TrimSpace(values.Get("term")))
	if term == "" {
		return "", &discoveryParamError{
			code:    "INVALID_TERM",
			message: "term must not be empty",
		}
	}
	return term, nil
}

func parseDiscoveryFeedURL(values url.Values) (string, error) {
	raw := strings.TrimSpace(values.Get("url"))
	if raw == "" {
		return "", &discoveryParamError{
			code:    "MISSING_URL",
			message: "url is required",
		}
	}
	return raw, nil
}

func parseDiscoveryLimit(values url.Values, key string, fallback, maxLimit int) (int, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > maxLimit {
		return 0, &discoveryParamError{
			code:    "INVALID_" + strings.ToUpper(key),
			message: fmt.Sprintf("%s must be between 1 and %d", key, maxLimit),
		}
	}
	return value, nil
}

func writeDiscoveryJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeDiscoveryError(w http.ResponseWriter, status int, code, message string) {
	requestID := generateRequestID()
	writeDiscoveryJSON(w, status, map[string]string{
		"code":       code,
		"message":    message,
		"request_id": requestID,
	})
	slog.Warn("discovery error response", "request_id", requestID, "code", code, "status", status)
}

func writeDiscoveryErrorSpec(w http.ResponseWriter, status int, spec discoveryErrorSpec) {
	writeDiscoveryError(w, status, spec.code, spec.message)
}

func writeDiscoveryMappedError(w http.ResponseWriter, err error) {
	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		writeDiscoveryError(w, http.StatusBadRequest, paramErr.code, paramErr.message)
		return
	}

	var statusErr *discoveryUpstreamStatusError
	if errors.As(err, &statusErr) {
		writeDiscoveryErrorSpec(w, http.StatusBadGateway, discoveryErrUpstreamInvalidResponseStatus)
		return
	}

	var piInvalidErr *podcastIndexInvalidResponseError
	if errors.As(err, &piInvalidErr) {
		writeDiscoveryErrorSpec(w, http.StatusBadGateway, discoveryErrUpstreamInvalidResponsePayload)
		return
	}

	switch {
	case errors.Is(err, errDiscoveryTimeout):
		writeDiscoveryErrorSpec(w, http.StatusGatewayTimeout, discoveryErrUpstreamTimeout)
	case errors.Is(err, errDiscoveryTooLarge):
		writeDiscoveryErrorSpec(w, http.StatusBadGateway, discoveryErrUpstreamTooLarge)
	case errors.Is(err, errDiscoveryXMLDecode):
		writeDiscoveryErrorSpec(w, http.StatusBadGateway, discoveryErrInvalidUpstreamXML)
	case errors.Is(err, errDiscoveryDecode):
		writeDiscoveryErrorSpec(w, http.StatusBadGateway, discoveryErrInvalidUpstreamPayload)
	default:
		if err != nil && strings.Contains(err.Error(), "podcastindex: too many GUIDs") {
			writeDiscoveryErrorSpec(w, http.StatusBadRequest, discoveryErrInvalidGuidBatchTooMany)
			return
		}
		if err != nil && strings.Contains(err.Error(), "podcastindex: request body too large") {
			writeDiscoveryErrorSpec(w, http.StatusBadRequest, discoveryErrInvalidGuidBatchTooLarge)
			return
		}
		writeDiscoveryErrorSpec(w, http.StatusBadGateway, discoveryErrUpstreamRequestFailed)
	}
}

func asStringID(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", typed))
	}
}

func asOptionalInt64(value any) *int64 {
	switch typed := value.(type) {
	case nil:
		return nil
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil {
			return nil
		}
		if parsed == 0 {
			return nil
		}
		return &parsed
	case float64:
		if typed == 0 {
			return nil
		}
		parsed := int64(typed)
		return &parsed
	case int64:
		if typed == 0 {
			return nil
		}
		return &typed
	case int:
		if typed == 0 {
			return nil
		}
		parsed := int64(typed)
		return &parsed
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		parsed, err := strconv.ParseInt(trimmed, 10, 64)
		if err != nil {
			return nil
		}
		if parsed == 0 {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func (s *discoveryService) fetchJSON(ctx context.Context, requestURL string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return fmt.Errorf("create discovery upstream request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", s.userAgent)

	return s.executeJSONRequest(req, dest)
}

func (s *discoveryService) executeJSONRequest(req *http.Request, dest any) error {
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json")
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", s.userAgent)
	}

	client := s.client
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Do(req)
	if err != nil {
		if req.Context().Err() != nil {
			return errDiscoveryTimeout
		}
		return fmt.Errorf("perform discovery upstream request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return &discoveryUpstreamStatusError{status: resp.StatusCode}
	}

	if err := decodeDiscoveryJSON(resp.Body, s.bodyLimit, dest); err != nil {
		return err
	}

	return nil
}

func decodeDiscoveryJSON(body io.Reader, limit int64, dest any) error {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return fmt.Errorf("read discovery upstream body: %w", err)
	}
	if int64(len(data)) > limit {
		return errDiscoveryTooLarge
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(dest); err != nil {
		return errDiscoveryDecode
	}

	return nil
}
