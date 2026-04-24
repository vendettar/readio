package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNormalizeDiscoveryFeedCacheKey(t *testing.T) {
	key, err := normalizeDiscoveryFeedCacheKey("HTTP://EXAMPLE.COM:80/path/feed.xml?x=1#ignored")
	if err != nil {
		t.Fatalf("normalizeDiscoveryFeedCacheKey error = %v", err)
	}

	if key != "http://example.com/path/feed.xml?x=1" {
		t.Fatalf("key = %q, want %q", key, "http://example.com/path/feed.xml?x=1")
	}
}

func TestResolveDiscoveryFeedCacheConfig(t *testing.T) {
	t.Run("uses defaults on invalid values", func(t *testing.T) {
		t.Setenv(discoveryFeedCacheTTLmsEnv, "abc")
		t.Setenv(discoveryFeedCacheMaxEntriesEnv, "bad")
		t.Setenv(discoveryFeedCacheMaxEpisodesEnv, "oops")
		t.Setenv(discoveryFeedCacheMaxBytesEnv, "NaN")

		config := resolveDiscoveryFeedCacheConfig()

		if config.ttl != discoveryFeedCacheTTL {
			t.Fatalf("ttl = %v, want %v", config.ttl, discoveryFeedCacheTTL)
		}
		if config.maxEntries != discoveryFeedCacheMaxEntries {
			t.Fatalf("maxEntries = %d, want %d", config.maxEntries, discoveryFeedCacheMaxEntries)
		}
		if config.maxEpisodes != discoveryFeedCacheMaxEpisodes {
			t.Fatalf("maxEpisodes = %d, want %d", config.maxEpisodes, discoveryFeedCacheMaxEpisodes)
		}
		if config.maxBytes != discoveryFeedCacheMaxBytes {
			t.Fatalf("maxBytes = %d, want %d", config.maxBytes, discoveryFeedCacheMaxBytes)
		}
		if !config.enabled {
			t.Fatal("enabled = false, want true")
		}
	})

	t.Run("disables cache when ttl or entries are non-positive", func(t *testing.T) {
		t.Setenv(discoveryFeedCacheTTLmsEnv, "0")
		t.Setenv(discoveryFeedCacheMaxEntriesEnv, "12")

		config := resolveDiscoveryFeedCacheConfig()
		if config.enabled {
			t.Fatal("enabled = true, want false")
		}

		t.Setenv(discoveryFeedCacheTTLmsEnv, "300000")
		t.Setenv(discoveryFeedCacheMaxEntriesEnv, "0")

		config = resolveDiscoveryFeedCacheConfig()
		if config.enabled {
			t.Fatal("enabled = true, want false")
		}
	})

	t.Run("non-positive episode and byte limits prevent admission instead of changing defaults", func(t *testing.T) {
		t.Setenv(discoveryFeedCacheTTLmsEnv, "300000")
		t.Setenv(discoveryFeedCacheMaxEntriesEnv, "12")
		t.Setenv(discoveryFeedCacheMaxEpisodesEnv, "0")
		t.Setenv(discoveryFeedCacheMaxBytesEnv, "-1")

		config := resolveDiscoveryFeedCacheConfig()
		if !config.enabled {
			t.Fatal("enabled = false, want true")
		}
		if config.maxEpisodes != 0 {
			t.Fatalf("maxEpisodes = %d, want 0", config.maxEpisodes)
		}
		if config.maxBytes != -1 {
			t.Fatalf("maxBytes = %d, want -1", config.maxBytes)
		}
	})
}

func TestDiscoveryServiceFeedRoutePaginationSlicesWithoutChangingCacheKey(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0
	feedXML := buildDiscoveryFeedXMLWithMetadata(
		25,
		"Paged Show",
		"Paged Desc",
		"https://example.com/artwork.jpg",
	)

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, feedXML)
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	first := httptest.NewRecorder()
	firstReq := httptest.NewRequest(
		http.MethodGet,
		discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com:80/feed.xml#ignored")+"&limit=20&offset=0",
		nil,
	)
	service.ServeHTTP(first, firstReq)
	if first.Code != http.StatusOK {
		t.Fatalf("first status = %d, want %d", first.Code, http.StatusOK)
	}

	var firstPayload parsedFeedResponse
	decodeResponseJSON(t, first.Body, &firstPayload)
	if len(firstPayload.Episodes) != 20 {
		t.Fatalf("first episodes length = %d, want 20", len(firstPayload.Episodes))
	}
	if firstPayload.PageInfo == nil || !firstPayload.PageInfo.HasMore {
		t.Fatalf("first pageInfo = %+v, want hasMore=true", firstPayload.PageInfo)
	}
	if firstPayload.Title != "Paged Show" {
		t.Fatalf("first title = %q, want %q", firstPayload.Title, "Paged Show")
	}
	if firstPayload.Description != "Paged Desc" {
		t.Fatalf("first description = %q, want %q", firstPayload.Description, "Paged Desc")
	}
	if firstPayload.ArtworkURL != "https://example.com/artwork.jpg" {
		t.Fatalf("first artworkUrl = %q, want %q", firstPayload.ArtworkURL, "https://example.com/artwork.jpg")
	}

	second := httptest.NewRecorder()
	secondReq := httptest.NewRequest(
		http.MethodGet,
		discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml")+"&limit=20&offset=20",
		nil,
	)
	service.ServeHTTP(second, secondReq)
	if second.Code != http.StatusOK {
		t.Fatalf("second status = %d, want %d", second.Code, http.StatusOK)
	}

	var secondPayload parsedFeedResponse
	decodeResponseJSON(t, second.Body, &secondPayload)
	if len(secondPayload.Episodes) != 5 {
		t.Fatalf("second episodes length = %d, want 5", len(secondPayload.Episodes))
	}
	if secondPayload.PageInfo == nil || secondPayload.PageInfo.HasMore {
		t.Fatalf("second pageInfo = %+v, want hasMore=false", secondPayload.PageInfo)
	}
	if secondPayload.Title != "Paged Show" {
		t.Fatalf("second title = %q, want %q", secondPayload.Title, "Paged Show")
	}
	if secondPayload.Description != "Paged Desc" {
		t.Fatalf("second description = %q, want %q", secondPayload.Description, "Paged Desc")
	}
	if secondPayload.ArtworkURL != "https://example.com/artwork.jpg" {
		t.Fatalf("second artworkUrl = %q, want %q", secondPayload.ArtworkURL, "https://example.com/artwork.jpg")
	}
	if secondPayload.Episodes[0].EpisodeGUID != "ep-21" {
		t.Fatalf("second first episodeGuid = %q, want %q", secondPayload.Episodes[0].EpisodeGUID, "ep-21")
	}

	third := httptest.NewRecorder()
	thirdReq := httptest.NewRequest(
		http.MethodGet,
		discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml")+"&limit=20&offset=40",
		nil,
	)
	service.ServeHTTP(third, thirdReq)
	if third.Code != http.StatusOK {
		t.Fatalf("third status = %d, want %d", third.Code, http.StatusOK)
	}

	var thirdPayload parsedFeedResponse
	decodeResponseJSON(t, third.Body, &thirdPayload)
	if len(thirdPayload.Episodes) != 0 {
		t.Fatalf("third episodes length = %d, want 0", len(thirdPayload.Episodes))
	}
	if thirdPayload.PageInfo == nil || thirdPayload.PageInfo.HasMore {
		t.Fatalf("third pageInfo = %+v, want hasMore=false", thirdPayload.PageInfo)
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedRouteOmittedLimitReturnsFullFeed(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(25))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodGet,
		discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml"),
		nil,
	)
	service.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload parsedFeedResponse
	decodeResponseJSON(t, rr.Body, &payload)
	if len(payload.Episodes) != 25 {
		t.Fatalf("episodes length = %d, want 25", len(payload.Episodes))
	}
	if payload.PageInfo != nil {
		t.Fatalf("pageInfo = %+v, want nil for full-feed response", payload.PageInfo)
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedRouteExactMultipleSecondPageHasMoreFalse(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(40))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodGet,
		discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml")+"&limit=20&offset=20",
		nil,
	)
	service.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload parsedFeedResponse
	decodeResponseJSON(t, rr.Body, &payload)
	if len(payload.Episodes) != 20 {
		t.Fatalf("episodes length = %d, want 20", len(payload.Episodes))
	}
	if payload.PageInfo == nil {
		t.Fatal("pageInfo = nil, want non-nil")
	}
	if payload.PageInfo.HasMore {
		t.Fatalf("pageInfo.hasMore = %v, want false", payload.PageInfo.HasMore)
	}
	if payload.PageInfo.Returned != 20 {
		t.Fatalf("pageInfo.returned = %d, want 20", payload.PageInfo.Returned)
	}
	if payload.PageInfo.Offset != 20 {
		t.Fatalf("pageInfo.offset = %d, want 20", payload.PageInfo.Offset)
	}
	if payload.PageInfo.Limit != 20 {
		t.Fatalf("pageInfo.limit = %d, want 20", payload.PageInfo.Limit)
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheMissAfterExpiryDoesNotServeStale(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			defer mu.Unlock()
			upstreamCalls++
			if upstreamCalls == 1 {
				w.Header().Set("Content-Type", "application/xml")
				_, _ = io.WriteString(w, buildDiscoveryFeedXML(2))
				return
			}
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, "boom")
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         20 * time.Millisecond,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	first := httptest.NewRecorder()
	firstReq := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml"), nil)
	service.ServeHTTP(first, firstReq)
	if first.Code != http.StatusOK {
		t.Fatalf("first status = %d, want %d", first.Code, http.StatusOK)
	}

	time.Sleep(40 * time.Millisecond)

	second := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml"), nil)
	service.ServeHTTP(second, secondReq)
	if second.Code != http.StatusBadGateway {
		t.Fatalf("second status = %d, want %d", second.Code, http.StatusBadGateway)
	}

	var payload map[string]string
	decodeResponseJSON(t, second.Body, &payload)
	if payload["code"] != "UPSTREAM_INVALID_RESPONSE" {
		t.Fatalf("code = %q, want UPSTREAM_INVALID_RESPONSE", payload["code"])
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 2 {
		t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheAdmissionRejectsOversizedFeeds(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(3))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 2,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	for i := 0; i < 2; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml"), nil)
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want %d", i+1, rr.Code, http.StatusOK)
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 2 {
		t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheAdmissionRejectsByByteSize(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(1))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    32,
		enabled:     true,
	}, time.Now)

	for i := 0; i < 2; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml"), nil)
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want %d", i+1, rr.Code, http.StatusOK)
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 2 {
		t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheDisabledStillServesFreshFetches(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(2))
		},
	)

	for i := 0; i < 2; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml")+"&limit=1", nil)
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want %d", i+1, rr.Code, http.StatusOK)
		}

		var payload parsedFeedResponse
		decodeResponseJSON(t, rr.Body, &payload)
		if len(payload.Episodes) != 1 {
			t.Fatalf("request %d: episodes length = %d, want 1", i+1, len(payload.Episodes))
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 2 {
		t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheEvictsOldestEntry(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := map[string]int{}

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			upstreamCalls[r.URL.Path]++
			mu.Unlock()

			w.Header().Set("Content-Type", "application/xml")
			switch r.URL.Path {
			case "/feed-a.xml":
				_, _ = io.WriteString(w, buildDiscoveryFeedXML(1))
			case "/feed-b.xml":
				_, _ = io.WriteString(w, buildDiscoveryFeedXML(2))
			default:
				t.Fatalf("unexpected path = %q", r.URL.Path)
			}
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  1,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	requests := []string{
		"http://example.com/feed-a.xml",
		"http://example.com/feed-b.xml",
		"http://example.com/feed-a.xml",
	}

	for i, rawURL := range requests {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape(rawURL), nil)
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, want %d", i+1, rr.Code, http.StatusOK)
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls["/feed-a.xml"] != 2 {
		t.Fatalf("feed-a upstream calls = %d, want 2", upstreamCalls["/feed-a.xml"])
	}
	if upstreamCalls["/feed-b.xml"] != 1 {
		t.Fatalf("feed-b upstream calls = %d, want 1", upstreamCalls["/feed-b.xml"])
	}
}

func TestDiscoveryServiceFeedCacheSingleflightDedupesConcurrentMisses(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			time.Sleep(50 * time.Millisecond)
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(3))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(limit int) {
			defer wg.Done()
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(
				http.MethodGet,
				discoveryFeedRoute+"?url="+url.QueryEscape("http://example.com/feed.xml")+"&limit="+fmt.Sprintf("%d", limit),
				nil,
			)
			service.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Errorf("status = %d, want %d", rr.Code, http.StatusOK)
			}
		}(i + 1)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheSingleflightUsesBackendOwnedFetchContext(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0
	requestStarted := make(chan struct{}, 1)
	releaseRequest := make(chan struct{})

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			requestStarted <- struct{}{}
			<-releaseRequest
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(3))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	requestURL := "http://example.com/feed.xml"
	leaderCtx, leaderCancel := context.WithCancel(context.Background())
	defer leaderCancel()

	type fetchResult struct {
		payload parsedFeedResponse
		status  string
		err     error
	}

	leaderDone := make(chan fetchResult, 1)
	go func() {
		payload, status, err := service.fetchFeedCached(leaderCtx, requestURL)
		leaderDone <- fetchResult{payload: payload, status: status, err: err}
	}()

	<-requestStarted
	leaderCancel()

	followerDone := make(chan fetchResult, 1)
	go func() {
		payload, status, err := service.fetchFeedCached(context.Background(), requestURL)
		followerDone <- fetchResult{payload: payload, status: status, err: err}
	}()

	close(releaseRequest)

	leaderResult := <-leaderDone
	followerResult := <-followerDone

	if !errors.Is(leaderResult.err, context.Canceled) {
		t.Fatalf("leader error = %v, want context.Canceled", leaderResult.err)
	}
	if followerResult.err != nil {
		t.Fatalf("follower error = %v, want nil", followerResult.err)
	}
	if len(followerResult.payload.Episodes) != 3 {
		t.Fatalf("follower episodes length = %d, want 3", len(followerResult.payload.Episodes))
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}

func TestDiscoveryServiceFeedCacheCanceledFollowerStopsWaitingWithoutCancelingSharedFetch(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0
	requestStarted := make(chan struct{}, 1)
	releaseRequest := make(chan struct{})

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			requestStarted <- struct{}{}
			<-releaseRequest
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(2))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	requestURL := "http://example.com/feed.xml"

	type fetchResult struct {
		payload parsedFeedResponse
		status  string
		err     error
	}

	leaderDone := make(chan fetchResult, 1)
	go func() {
		payload, status, err := service.fetchFeedCached(context.Background(), requestURL)
		leaderDone <- fetchResult{payload: payload, status: status, err: err}
	}()

	<-requestStarted

	followerCtx, followerCancel := context.WithCancel(context.Background())
	followerDone := make(chan fetchResult, 1)
	go func() {
		payload, status, err := service.fetchFeedCached(followerCtx, requestURL)
		followerDone <- fetchResult{payload: payload, status: status, err: err}
	}()

	time.Sleep(10 * time.Millisecond)
	followerCancel()

	select {
	case followerResult := <-followerDone:
		if !errors.Is(followerResult.err, context.Canceled) {
			t.Fatalf("follower error = %v, want context.Canceled", followerResult.err)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("follower did not stop waiting after cancellation")
	}

	close(releaseRequest)

	leaderResult := <-leaderDone
	if leaderResult.err != nil {
		t.Fatalf("leader error = %v, want nil", leaderResult.err)
	}
	if len(leaderResult.payload.Episodes) != 2 {
		t.Fatalf("leader episodes length = %d, want 2", len(leaderResult.payload.Episodes))
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}

func buildDiscoveryFeedXML(episodeCount int) string {
	return buildDiscoveryFeedXMLWithMetadata(
		episodeCount,
		"Cache Show",
		"Cache Desc",
		"",
	)
}

func buildDiscoveryFeedXMLWithMetadata(
	episodeCount int,
	title string,
	description string,
	artworkURL string,
) string {
	var builder strings.Builder
	builder.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	builder.WriteString(`<rss version="2.0"><channel>`)
	fmt.Fprintf(&builder, `<title>%s</title><description>%s</description>`, title, description)
	if artworkURL != "" {
		fmt.Fprintf(&builder, `<image><url>%s</url></image>`, artworkURL)
	}
	for i := 0; i < episodeCount; i++ {
		fmt.Fprintf(&builder,
			`<item><title>Episode %d</title><description>Body %d</description><guid>ep-%d</guid><pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate><enclosure url="http://example.com/audio-%d.mp3" length="123"/></item>`,
			i+1,
			i+1,
			i+1,
			i+1,
		)
	}
	builder.WriteString(`</channel></rss>`)
	return builder.String()
}

func TestDiscoveryFeedCacheFreshOnlyGet(t *testing.T) {
	cache := newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         25 * time.Millisecond,
		maxEntries:  2,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	key := "http://example.com/feed.xml"
	payload := parsedFeedResponse{Title: "Show", Episodes: []parsedFeedEpisodeResult{{EpisodeGUID: "ep-1", Title: "Episode 1", AudioURL: "https://example.com/1.mp3", PubDate: "Fri, 30 Jan 2026 12:00:00 GMT"}}}
	if admitted := cache.set(key, payload); !admitted {
		t.Fatal("set returned false, want true")
	}

	if got, ok := cache.get(key); !ok || got.Title != "Show" {
		t.Fatalf("initial get = (%+v, %v), want payload and true", got, ok)
	}

	time.Sleep(40 * time.Millisecond)

	if _, ok := cache.get(key); ok {
		t.Fatal("stale get = true, want false")
	}
}

func TestDiscoveryServiceFetchFeedReturnsCallerCancellationBeforeStartingFetch(t *testing.T) {
	var mu sync.Mutex
	upstreamCalls := 0

	service, _ := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			upstreamCalls++
			mu.Unlock()
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, buildDiscoveryFeedXML(1))
		},
	)
	service.feedCache = newDiscoveryFeedCache(discoveryFeedCacheConfig{
		ttl:         time.Minute,
		maxEntries:  12,
		maxEpisodes: 300,
		maxBytes:    1 << 20,
		enabled:     true,
	}, time.Now)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	payload, cacheStatus, err := service.fetchFeedCached(ctx, "http://example.com/feed.xml")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("fetchFeedCached error = %v, want context.Canceled", err)
	}
	if cacheStatus != CacheStatusUncached {
		t.Fatalf("cacheStatus = %q, want %q", cacheStatus, CacheStatusUncached)
	}
	if len(payload.Episodes) != 0 {
		t.Fatalf("episodes length = %d, want 0", len(payload.Episodes))
	}

	cachedPayload, cacheStatus, err := service.fetchFeedCached(context.Background(), "http://example.com/feed.xml")
	if err != nil {
		t.Fatalf("cached fetchFeedCached error = %v, want nil", err)
	}
	if cacheStatus != CacheStatusRefreshed {
		t.Fatalf("cached cacheStatus = %q, want %q", cacheStatus, CacheStatusRefreshed)
	}
	if len(cachedPayload.Episodes) != 1 {
		t.Fatalf("cached episodes length = %d, want 1", len(cachedPayload.Episodes))
	}

	secondCachedPayload, cacheStatus, err := service.fetchFeedCached(context.Background(), "http://example.com/feed.xml")
	if err != nil {
		t.Fatalf("second cached fetchFeedCached error = %v, want nil", err)
	}
	if cacheStatus != CacheStatusFreshHit {
		t.Fatalf("second cached cacheStatus = %q, want %q", cacheStatus, CacheStatusFreshHit)
	}
	if len(secondCachedPayload.Episodes) != 1 {
		t.Fatalf("second cached episodes length = %d, want 1", len(secondCachedPayload.Episodes))
	}

	mu.Lock()
	defer mu.Unlock()
	if upstreamCalls != 1 {
		t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
	}
}
