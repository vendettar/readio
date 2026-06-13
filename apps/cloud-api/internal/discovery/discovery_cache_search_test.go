package discovery

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"readio-cloud/internal/httputil"
)

func TestDiscoverySearchCacheRouteReturnsPerKindCachedResults(t *testing.T) {
	upstreamCalls := 0
	service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
		upstreamCalls++
		t.Fatal("cache search must not call PodcastIndex upstream")
		return nil, nil
	})
	service.searchLimiter = httputil.NewRateLimiter(100, time.Minute, time.Now)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-cache"})
	snapshot.Podcast.Title = "Cache Show"
	snapshot.Podcast.Author = "Cache Author"
	snapshot.Podcast.Description = "Cache show description"
	snapshot.Episodes[0].Title = "Cache Episode"
	snapshot.Episodes[0].Description = "Cache episode description"
	snapshot.Episodes[0].Image = ""
	require.NoError(t, store.ReplacePodcastSnapshotTx(t.Context(), snapshot))

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=cache&limit=1", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var payload cachedSearchResponse
	decodeResponseJSON(t, rr.Body, &payload)
	require.Equal(t, 1, payload.Limit)
	require.Len(t, payload.Podcasts, 1)
	require.Len(t, payload.Episodes, 1)
	require.Equal(t, "cache", payload.Podcasts[0].ResultSource)
	require.Equal(t, "cache", payload.Episodes[0].ResultSource)
	require.Equal(t, "123", payload.Podcasts[0].PodcastItunesID)
	require.Equal(t, "ep-cache", payload.Episodes[0].EpisodeGUID)
	require.Equal(t, "https://example.com/show.jpg", payload.Episodes[0].Image)
	require.Equal(t, 0, upstreamCalls)
}

func TestDiscoverySearchCacheRouteValidationAndEmptyResponses(t *testing.T) {
	service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
		t.Fatal("cache search validation and miss paths must not call PodcastIndex upstream")
		return nil, nil
	})
	service.searchLimiter = httputil.NewRateLimiter(100, time.Minute, time.Now)

	t.Run("missing or short term returns empty arrays", func(t *testing.T) {
		for _, target := range []string{
			discoverySearchCacheRoute,
			discoverySearchCacheRoute + "?term=a",
		} {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, target, nil)
			service.ServeHTTP(rr, req)
			require.Equal(t, http.StatusOK, rr.Code)
			require.Contains(t, rr.Body.String(), `"podcasts":[]`)
			require.Contains(t, rr.Body.String(), `"episodes":[]`)
		}
	})

	t.Run("fts miss returns empty arrays", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=nohit", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)
		require.Contains(t, rr.Body.String(), `"podcasts":[]`)
		require.Contains(t, rr.Body.String(), `"episodes":[]`)
	})

	t.Run("term over byte limit is rejected without echoing term", func(t *testing.T) {
		term := strings.Repeat("x", 257)
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term="+term, nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.Contains(t, rr.Body.String(), "INVALID_TERM")
		require.NotContains(t, rr.Body.String(), term)
	})

	t.Run("raw term byte limit is checked before trimming", func(t *testing.T) {
		term := strings.Repeat(" ", 257)
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term="+url.QueryEscape(term), nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.Contains(t, rr.Body.String(), "INVALID_TERM")
	})

	t.Run("invalid limit is rejected", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=cache&limit=11", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.Contains(t, rr.Body.String(), "INVALID_LIMIT")
	})
}

func TestDiscoverySearchCacheRouteUsesSearchLimiter(t *testing.T) {
	service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
		t.Fatal("rate-limited cache search must not call PodcastIndex upstream")
		return nil, nil
	})
	service.searchLimiter = httputil.NewRateLimiter(1, time.Hour, time.Now)

	firstRR := httptest.NewRecorder()
	firstReq := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=a", nil)
	firstReq.RemoteAddr = "203.0.113.10:12345"
	service.ServeHTTP(firstRR, firstReq)
	require.Equal(t, http.StatusOK, firstRR.Code)

	secondRR := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=a", nil)
	secondReq.RemoteAddr = "203.0.113.10:12346"
	service.ServeHTTP(secondRR, secondReq)
	require.Equal(t, http.StatusTooManyRequests, secondRR.Code)
}

func TestDiscoverySearchCacheRouteUnavailableWithoutStore(t *testing.T) {
	service := newDiscoveryService()
	service.searchLimiter = httputil.NewRateLimiter(100, time.Minute, time.Now)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=cache", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusServiceUnavailable, rr.Code)
	require.Contains(t, rr.Body.String(), "CACHE_SEARCH_UNAVAILABLE")
}

func TestDiscoverySearchCacheErrorClassification(t *testing.T) {
	require.Equal(t, http.StatusServiceUnavailable, discoveryMetricStatus(errDiscoveryCacheSearchUnavailableError))
	require.Equal(t, "service_unavailable", classifyDiscoveryError(errDiscoveryCacheSearchUnavailableError))

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchCacheRoute+"?term=cache", nil)
	writeDiscoveryMappedError(req, rr, context.DeadlineExceeded)
	require.Equal(t, http.StatusGatewayTimeout, rr.Code)
	require.Contains(t, rr.Body.String(), "UPSTREAM_TIMEOUT")
}
