package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	discoveryRoutePrefix                      = "/api/v1/discovery/"
	discoverySearchPodcastsRoute              = "/api/v1/discovery/search/podcasts"
	discoverySearchEpisodesRoute              = "/api/v1/discovery/search/episodes"
	discoveryTopPodcastsRoute                 = "/api/v1/discovery/top-podcasts"
	discoveryTopEpisodesRoute                 = "/api/v1/discovery/top-episodes"
	discoveryFeedRoute                        = "/api/v1/discovery/feed"
	discoveryLookupPodcastRoute               = "/api/v1/discovery/lookup/podcast"
	discoveryLookupPodcastEpisodesRoute       = "/api/v1/discovery/lookup/podcast-episodes"
	discoveryLookupPodcastsRoute              = "/api/v1/discovery/lookup/podcasts"
	discoveryRSSBaseURL                       = "https://rss.marketingtools.apple.com/api/v2"
	discoverySearchBaseURL                    = "https://itunes.apple.com/search"
	discoveryLookupBaseURL                    = "https://itunes.apple.com/lookup"
	discoveryUserAgent                        = "Readio/1.0 (Cloud Discovery; +https://www.readio.top)"
	discoveryBrowserUserAgent                 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
	discoveryRequestTimeout                   = 15 * time.Second
	discoveryBodyLimit                  int64 = 30 << 20
	discoverySlowRequestThreshold             = 5 * time.Second
	defaultDiscoveryCountry                   = "us"
	defaultDiscoveryPodcastSearchLimit        = 20
	defaultDiscoveryEpisodeSearchLimit        = 50
	defaultDiscoveryTopLimit                  = 25
	defaultDiscoveryLookupEpisodesLimit       = 50
	maxDiscoverySearchLimit                   = 200
	maxDiscoveryTopLimit                      = 100
	maxDiscoveryLookupEpisodesLimit           = 300
	discoveryCacheMaxKeys                     = 256
)

// Discovery cache policy.
//
// Cached routes (and cache key dimensions):
//
//   - top-podcasts   → country, limit           (30 min TTL)
//   - top-episodes   → country, limit           (30 min TTL)
//   - lookup/podcast → id, country              (15 min TTL)
//   - lookup/podcast-episodes → id, country, limit (15 min TTL)
//
// Error responses (upstream failures, param errors, timeouts) are NEVER cached.
// Feed responses are NOT cached (deferred).
// Search responses are NOT cached (high cardinality).
var discoveryCacheTTLTopPodcasts = 24 * time.Hour
var discoveryCacheTTLTopEpisodes = 24 * time.Hour
var discoveryCacheTTLLookup = 24 * time.Hour

type discoveryCacheEntry struct {
	data        any
	expiresAt   time.Time
	cacheStatus string
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


func (c *discoveryCache) getWithStatus(key string) (any, string, bool) {
	c.mu.RLock()
	entry, ok := c.entries[key]
	c.mu.RUnlock()
	if !ok {
		return nil, "miss", false
	}
	if time.Now().Before(entry.expiresAt) {
		return entry.data, "fresh", true
	}
	return entry.data, "stale", true
}

func (c *discoveryCache) getStale(key string) (any, bool) {
	c.mu.RLock()
	entry, ok := c.entries[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return entry.data, true
}

func (c *discoveryCache) set(key string, data any, ttl time.Duration) {
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
		data:        data,
		expiresAt:   time.Now().Add(ttl),
		cacheStatus: "fresh",
	}
}


func (s *discoveryService) getWithGracefulDegradation(
	ctx context.Context,
	cacheKey string,
	ttl time.Duration,
	fetch func(context.Context) (any, error),
) (any, string, error) {
	data, status, ok := s.cache.getWithStatus(cacheKey)
	if ok && status == "fresh" {
		return data, CacheStatusFreshHit, nil
	}

	if !ok {
		result, err, _ := s.cacheOwner.Do(cacheKey, func() (any, error) {
			return fetch(ctx)
		})
		if err != nil {
			isUpstream := errors.Is(err, errDiscoveryUpstreamError) ||
				errors.Is(err, errDiscoveryTimeout) ||
				errors.Is(err, errDiscoveryTooLarge) ||
				errors.Is(err, &discoveryUpstreamStatusError{})
			if isUpstream {
				if staleData, staleOk := s.cache.getStale(cacheKey); staleOk {
					return staleData, CacheStatusStaleFallback, nil
				}
			}
			return nil, CacheStatusMissError, err
		}
		s.cache.set(cacheKey, result, ttl)
		return result, CacheStatusRefreshed, nil
	}

	result, err, _ := s.cacheOwner.Do(cacheKey, func() (any, error) {
		return fetch(ctx)
	})
	if err != nil {
		isUpstream := errors.Is(err, errDiscoveryUpstreamError) ||
			errors.Is(err, errDiscoveryTimeout) ||
			errors.Is(err, errDiscoveryTooLarge) ||
			errors.Is(err, &discoveryUpstreamStatusError{})
		if isUpstream {
			if staleData, staleOk := s.cache.getStale(cacheKey); staleOk {
				return staleData, CacheStatusStaleFallback, nil
			}
		}
		return nil, CacheStatusMissError, err
	}
	s.cache.set(cacheKey, result, ttl)
	return result, CacheStatusRefreshed, nil
}

var (
	discoveryCountryPattern    = regexp.MustCompile(`^[a-z]{2}$`)
	discoveryIDPattern         = regexp.MustCompile(`^[1-9][0-9]*$`)
	discoveryTokenSplitPattern = regexp.MustCompile(`[\s,.!?;:'"()[\]{}]+`)
	errDiscoveryTimeout        = errors.New("discovery upstream timeout")
	errDiscoveryTooLarge       = errors.New("discovery upstream response too large")
	errDiscoveryDecode         = errors.New("discovery upstream response invalid")
	errDiscoveryXMLDecode      = errors.New("discovery upstream response invalid XML")

	errDiscoveryUpstreamError = errors.New("discovery upstream error")
	discoveryStopWords        = map[string]struct{}{
		"the": {}, "a": {}, "an": {}, "and": {}, "or": {}, "of": {}, "in": {}, "on": {},
		"at": {}, "to": {}, "for": {}, "with": {}, "by": {}, "is": {}, "it": {}, "that": {},
		"this": {}, "podcast": {}, "audio": {}, "episode": {}, "episodes": {},
	}
)

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
	UpstreamKindAppleSearch = "apple-search"
	UpstreamKindAppleFeed   = "apple-feed"
	UpstreamKindAppleLookup = "apple-lookup"
	UpstreamKindFeed        = "feed"
)

type discoveryService struct {
	client        *http.Client
	timeout       time.Duration
	rssBaseURL    string
	searchBaseURL string
	lookupBaseURL string
	userAgent     string
	bodyLimit     int64
	lookupIP      func(context.Context, string) ([]net.IPAddr, error)
	dialContext   func(context.Context, string, string) (net.Conn, error)
	cache         *discoveryCache
	cacheOwner    singleflight.Group
}

type discoveryParamError struct {
	code    string
	message string
}

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
	return &discoveryService{
		client: &http.Client{
			Timeout: discoveryRequestTimeout,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		timeout:       discoveryRequestTimeout,
		rssBaseURL:    discoveryRSSBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		lookupIP:      net.DefaultResolver.LookupIPAddr,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}
}

func (s *discoveryService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeDiscoveryError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "only GET is allowed")
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
	case discoveryLookupPodcastRoute:
		s.handleLookupPodcast(w, r)
	case discoveryLookupPodcastEpisodesRoute:
		s.handleLookupPodcastEpisodes(w, r)
	case discoveryLookupPodcastsRoute:
		s.handleLookupPodcasts(w, r)
	default:
		writeDiscoveryError(w, http.StatusNotFound, "NOT_FOUND", "unknown discovery endpoint")
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

	return "unknown"
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

func parseDiscoveryID(values url.Values, key string) (string, error) {
	value := strings.TrimSpace(values.Get(key))
	if value == "" {
		return "", &discoveryParamError{
			code:    "MISSING_" + strings.ToUpper(key),
			message: key + " is required",
		}
	}
	if !discoveryIDPattern.MatchString(value) {
		return "", &discoveryParamError{
			code:    "INVALID_" + strings.ToUpper(key),
			message: key + " must be a positive integer",
		}
	}
	return value, nil
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

func parseDiscoveryIDs(values url.Values, key string) ([]string, error) {
	raw := strings.TrimSpace(strings.Join(values[key], ","))
	if raw == "" {
		return []string{}, nil
	}

	parts := strings.Split(raw, ",")
	ids := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		if !discoveryIDPattern.MatchString(value) {
			return nil, &discoveryParamError{
				code:    "INVALID_" + strings.ToUpper(key),
				message: key + " must be a comma-separated list of positive integers",
			}
		}
		ids = append(ids, value)
	}

	return ids, nil
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

func writeDiscoveryMappedError(w http.ResponseWriter, err error) {
	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		writeDiscoveryError(w, http.StatusBadRequest, paramErr.code, paramErr.message)
		return
	}

	var statusErr *discoveryUpstreamStatusError
	if errors.As(err, &statusErr) {
		writeDiscoveryError(w, http.StatusBadGateway, "UPSTREAM_INVALID_RESPONSE", "discovery upstream returned a non-success status")
		return
	}

	switch {
	case errors.Is(err, errDiscoveryTimeout):
		writeDiscoveryError(w, http.StatusGatewayTimeout, "UPSTREAM_TIMEOUT", "discovery upstream request timed out")
	case errors.Is(err, errDiscoveryTooLarge):
		writeDiscoveryError(w, http.StatusBadGateway, "UPSTREAM_TOO_LARGE", "discovery upstream response exceeded the allowed size")
	case errors.Is(err, errDiscoveryXMLDecode):
		writeDiscoveryError(w, http.StatusBadGateway, "INVALID_UPSTREAM_XML", "discovery upstream response was not valid XML")
	case errors.Is(err, errDiscoveryDecode):
		writeDiscoveryError(w, http.StatusBadGateway, "INVALID_UPSTREAM_PAYLOAD", "discovery upstream response was not valid JSON")
	default:
		writeDiscoveryError(w, http.StatusBadGateway, "UPSTREAM_REQUEST_FAILED", "discovery upstream request failed")
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
		return &parsed
	case float64:
		parsed := int64(typed)
		return &parsed
	case int64:
		return &typed
	case int:
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
