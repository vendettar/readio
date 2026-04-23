package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

type discoveryRoundTripper func(*http.Request) (*http.Response, error)

func (fn discoveryRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func newDiscoveryFeedFixtureService(
	t *testing.T,
	host string,
	resolvedIP string,
	timeout time.Duration,
	handler http.HandlerFunc,
) (*discoveryService, *string) {
	t.Helper()

	upstream := httptest.NewServer(handler)
	t.Cleanup(upstream.Close)

	targetAddr := upstream.Listener.Addr().String()
	dialedAddress := ""

	service := &discoveryService{
		timeout:   timeout,
		userAgent: discoveryUserAgent,
		bodyLimit: discoveryBodyLimit,
		cache:     newDiscoveryCache(discoveryCacheMaxKeys),
		lookupIP: func(_ context.Context, lookupHost string) ([]net.IPAddr, error) {
			if lookupHost != host {
				t.Fatalf("lookup host = %q, want %q", lookupHost, host)
			}
			return []net.IPAddr{{IP: net.ParseIP(resolvedIP)}}, nil
		},
		dialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			dialedAddress = address
			var d net.Dialer
			return d.DialContext(ctx, network, targetAddr)
		},
	}

	return service, &dialedAddress
}

func assertDiscoveryErrorPayload(t *testing.T, body interface{ String() string }, wantCode string) {
	t.Helper()

	var payload map[string]string
	decodeResponseJSON(t, body, &payload)

	if payload["code"] != wantCode {
		t.Fatalf("code = %q, want %q", payload["code"], wantCode)
	}
	if strings.TrimSpace(payload["message"]) == "" {
		t.Fatal("message is empty")
	}
	if strings.TrimSpace(payload["request_id"]) == "" {
		t.Fatal("request_id is empty")
	}
}

func TestDiscoveryServiceTopPodcastsNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if req.URL.String() != discoveryRSSBaseURL+"/us/podcasts/top/25/podcasts.json" {
					t.Fatalf("upstream url = %q", req.URL.String())
				}
				if got := req.Header.Get("Accept"); got != "application/json" {
					t.Fatalf("accept = %q, want application/json", got)
				}
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"id": "100",
								"name": "Top Show",
								"artistName": "Host",
								"artworkUrl100": "https://example.com/art-100.jpg",
								"genres": [
									{"name": "Arts"}
								]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,

		userAgent: discoveryUserAgent,
		bodyLimit: discoveryBodyLimit,
		cache:     newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []topPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].PodcastItunesID != "100" || payload[0].Title != "Top Show" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
	if len(payload[0].Genres) != 1 || payload[0].Genres[0] != "Arts" {
		t.Fatalf("genres = %+v", payload[0].Genres)
	}
	if payload[0].Artwork != "https://example.com/art-100.jpg" {
		t.Fatalf("artwork = %q, want https://example.com/art-100.jpg", payload[0].Artwork)
	}
}

func TestDiscoveryServiceTopPodcastsRateLimited(t *testing.T) {
	service := &discoveryService{
		timeout:        time.Second,
		rssBaseURL:     discoveryRSSBaseURL,
		userAgent:      discoveryUserAgent,
		bodyLimit:      discoveryBodyLimit,
		topLimiter:     newRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		trustedProxies: trustedProxySet{},
		cache:          newDiscoveryCache(discoveryCacheMaxKeys),
	}

	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us", nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusTooManyRequests)
	}

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServiceTopEpisodesRateLimited(t *testing.T) {
	service := &discoveryService{
		timeout:        time.Second,
		rssBaseURL:     discoveryRSSBaseURL,
		userAgent:      discoveryUserAgent,
		bodyLimit:      discoveryBodyLimit,
		topLimiter:     newRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		trustedProxies: trustedProxySet{},
		cache:          newDiscoveryCache(discoveryCacheMaxKeys),
	}

	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=us", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=us", nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusTooManyRequests)
	}

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServiceFeedRateLimited(t *testing.T) {
	service, _ := newDiscoveryFeedFixtureService(
		t,
		"feeds.example.com",
		"203.0.113.10",
		time.Second,
		func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = io.WriteString(w, `<rss><channel><title>Show</title><description>Desc</description></channel></rss>`)
		},
	)
	service.feedLimiter = newRateLimiter(1, time.Minute, func() time.Time { return time.Now() })

	req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("https://feeds.example.com/feed.xml"), nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url="+url.QueryEscape("https://feeds.example.com/feed.xml"), nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusTooManyRequests)
	}

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServicePodcastIndexByItunesRateLimited(t *testing.T) {
	t.Setenv(podcastIndexAPIKeyEnv, "test-key")
	t.Setenv(podcastIndexAPISecretEnv, "test-secret")
	t.Setenv(podcastIndexUserAgentEnv, "readio-test")

	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"title": "Show",
						"url": "https://example.com/feed.xml",
						"description": "Desc",
						"author": "Host",
						"artwork": "https://example.com/art.jpg",
						"itunesId": 123,
						"categories": {}
					}
				}`), nil
			}),
		},
		timeout:             time.Second,
		userAgent:           discoveryUserAgent,
		bodyLimit:           discoveryBodyLimit,
		cache:               newDiscoveryCache(discoveryCacheMaxKeys),
		podcastIndexLimiter: newRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		podcastIndexConfig:  podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "readio-test"},
	}

	req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusTooManyRequests)
	}

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServicePodcastIndexBatchRateLimited(t *testing.T) {
	service := &discoveryService{
		timeout:             time.Second,
		userAgent:           discoveryUserAgent,
		bodyLimit:           discoveryBodyLimit,
		cache:               newDiscoveryCache(discoveryCacheMaxKeys),
		podcastIndexLimiter: newRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
	}

	firstReq := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader("[]"))
	service.ServeHTTP(httptest.NewRecorder(), firstReq)

	rr := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader("[]"))
	service.ServeHTTP(rr, secondReq)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusTooManyRequests)
	}

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServiceNotFoundReturnsStandardErrorPayload(t *testing.T) {
	service := newDiscoveryService()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/unknown", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}

	assertDiscoveryErrorPayload(t, rr.Body, "NOT_FOUND")
}

func TestDiscoveryServiceTopPodcastsDropsRowsWithoutArtwork100(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"id": "100",
								"name": "Top Show",
								"artistName": "Host",
								"genres": [
									{"name": "Arts"}
								]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
}

func TestDiscoveryServiceTopPodcastsDropsRowsWithoutArtistName(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"id": "100",
								"name": "Top Show",
								"artworkUrl100": "https://example.com/art-100.jpg",
								"genres": [
									{"name": "Arts"}
								]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
}

func TestDiscoveryServiceTopPodcastsAllowsEmptyGenres(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"id": "100",
								"name": "Top Show",
								"artistName": "Host",
								"artworkUrl100": "https://example.com/art-100.jpg",
								"genres": []
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []topPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].PodcastItunesID != "100" || payload[0].Title != "Top Show" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
	if len(payload[0].Genres) != 0 {
		t.Fatalf("genres = %+v, want empty", payload[0].Genres)
	}
}

func TestDiscoveryServiceTopPodcastsDoesNotDependOnRemovedRawFields(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"id": "100",
								"name": "Top Show",
								"artistName": "Host",
								"artworkUrl100": "https://example.com/art-100.jpg",
								"genres": [
									{"name": "Arts"}
								]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []topPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].PodcastItunesID != "100" || payload[0].Title != "Top Show" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
}

func TestDiscoveryServiceTopEpisodesNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if req.URL.String() != discoveryRSSBaseURL+"/jp/podcasts/top/10/podcast-episodes.json" {
					t.Fatalf("upstream url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artistName": "JP Host",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": [{"name": "Technology"}, {"name": "Podcast"}]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,

		userAgent: discoveryUserAgent,
		bodyLimit: discoveryBodyLimit,
		cache:     newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []topEpisodeResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].PodcastItunesID != "333" {
		t.Fatalf("podcastItunesId = %q, want 333", payload[0].PodcastItunesID)
	}
	if len(payload[0].Genres) != 2 || payload[0].Genres[0] != "Technology" || payload[0].Genres[1] != "Podcast" {
		t.Fatalf("genres = %+v, want [Technology Podcast]", payload[0].Genres)
	}
	if payload[0].Artwork != "https://example.com/episode-100.jpg" {
		t.Fatalf("artwork = %q, want https://example.com/episode-100.jpg", payload[0].Artwork)
	}
}

func TestDiscoveryServiceTopEpisodesDropsRowsWithoutArtwork100(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artistName": "JP Host",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": [{"name": "Technology"}]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
}

func TestDiscoveryServiceTopEpisodesDropsRowsWithoutArtistName(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": [{"name": "Technology"}]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
}

func TestDiscoveryServiceTopEpisodesAllowsEmptyGenres(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artistName": "JP Host",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": []
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []topEpisodeResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].PodcastItunesID != "333" || payload[0].Title != "Top Episode" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
	if len(payload[0].Genres) != 0 {
		t.Fatalf("genres = %+v, want empty", payload[0].Genres)
	}
}

func TestDiscoveryServiceTopEpisodesDropsRowsWhenURLDoesNotContainPodcastID(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artistName": "JP Host",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode?i=1000762374046",
								"genres": [{"name": "Technology"}]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,
		userAgent:  discoveryUserAgent,
		bodyLimit:  discoveryBodyLimit,
		cache:      newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
}

func TestDiscoveryServiceLookupPodcastNormalizesPayloadAndNullMiss(t *testing.T) {
	t.Run("returns normalized podcast payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					if !strings.Contains(req.URL.String(), "id=123") {
						t.Fatalf("unexpected lookup url = %q", req.URL.String())
					}
					return jsonResponse(http.StatusOK, `{"status":"true","feed":{"title":"Show 123","url":"https://example.com/feed.xml","lastUpdateTime":1613394044,"author":"Test Author","artwork":"https://example.com/artwork.jpg","description":"A test podcast","itunesId":123,"language":"en","episodeCount":50,"dead":1,"categories":{"1":"Technology"}}}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["lastUpdateTime"] != float64(1613394044) {
			t.Fatalf("lastUpdateTime = %v, want 1613394044", payload["lastUpdateTime"])
		}
		if payload["dead"] != true {
			t.Fatalf("dead = %v, want true", payload["dead"])
		}
	})

	t.Run("returns null when upstream has no matching podcast", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"status":"true","feed":{"id":0,"title":"","url":""}}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
	})
}

func TestDiscoveryServiceFeedUsesValidatedDialTargets(t *testing.T) {
	rawBody := strings.TrimSpace(`
		<?xml version="1.0" encoding="UTF-8"?>
		<rss version="2.0">
			<channel>
				<title>Validated Feed</title>
				<description>validated client path</description>
				<item>
					<title>Episode One</title>
					<description>ok</description>
					<guid>episode-1</guid>
					<pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
					<enclosure url="http://feeds.example.com/audio.mp3" length="123456" />
				</item>
			</channel>
		</rss>
	`)
	service, dialedAddress := newDiscoveryFeedFixtureService(
		t,
		"feeds.example.com",
		"203.0.113.10",
		100*time.Millisecond,
		func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Accept"); !strings.Contains(got, "application/rss+xml") {
				t.Fatalf("accept = %q", got)
			}
			if r.URL.Path != "/feed.xml" {
				t.Fatalf("path = %q, want %q", r.URL.Path, "/feed.xml")
			}
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, rawBody)
		},
	)

	unrestrictedClientUsed := false
	service.client = &http.Client{
		Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
			unrestrictedClientUsed = true
			return textResponse(http.StatusOK, `<rss><channel><title>wrong</title></channel></rss>`, "application/xml"), nil
		}),
	}

	payload, err := service.fetchFeed(context.Background(), "http://feeds.example.com/feed.xml")
	if err != nil {
		t.Fatalf("fetchFeed error = %v", err)
	}

	if unrestrictedClientUsed {
		t.Fatalf("expected validated-address client, but unrestricted client transport was used")
	}
	if *dialedAddress != "203.0.113.10:80" {
		t.Fatalf("dialed address = %q, want %q", *dialedAddress, "203.0.113.10:80")
	}
	if payload.Title != "Validated Feed" {
		t.Fatalf("title = %q, want %q", payload.Title, "Validated Feed")
	}
	if len(payload.Episodes) != 1 || payload.Episodes[0].Title != "Episode One" {
		t.Fatalf("unexpected episodes payload: %+v", payload.Episodes)
	}
}

func TestDiscoveryServiceFeedNormalizesParsedPayload(t *testing.T) {
	service, dialedAddress := newDiscoveryFeedFixtureService(
		t,
		"example.com",
		"93.184.216.34",
		time.Second,
		func(w http.ResponseWriter, r *http.Request) {
			if r.URL.String() != "/feed.xml" {
				t.Fatalf("unexpected feed url = %q", r.URL.String())
			}
			if got := r.Header.Get("Accept"); !strings.Contains(got, "application/rss+xml") {
				t.Fatalf("accept = %q", got)
			}
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, strings.TrimSpace(`
					<?xml version="1.0" encoding="UTF-8"?>
					<rss version="2.0"
						xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
						xmlns:content="http://purl.org/rss/1.0/modules/content/"
						xmlns:podcast="https://podcastindex.org/namespace/1.0">
						<channel>
							<title>Cloud Feed</title>
							<description>Feed description</description>
							<itunes:image href="https://example.com/artwork_600.jpg?cache=1"/>
							<item>
								<title>Episode One</title>
								<description><![CDATA[<p>Episode body</p>]]></description>
								<content:encoded><![CDATA[<p>Encoded body</p>]]></content:encoded>
								<guid>episode-1</guid>
								<pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
								<link>https://example.com/episodes/1</link>
								<enclosure url="https://example.com/audio-1.mp3" length="123456" type="audio/mpeg"/>
								<itunes:duration>01:02:03</itunes:duration>
								<itunes:season>2</itunes:season>
								<itunes:episode>7</itunes:episode>
								<itunes:episodeType>bonus</itunes:episodeType>
								<itunes:explicit>yes</itunes:explicit>
								<itunes:image href="https://example.com/episode-art.jpg"/>
								<podcast:transcript url="https://example.com/transcript.vtt"/>
								<podcast:chapters url="https://example.com/chapters.json"/>
							</item>
						</channel>
					</rss>
				`))
		},
	)
	service.client = &http.Client{
		Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
			return nil, errors.New("unexpected unrestricted client usage")
		}),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url=http://example.com/feed.xml", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if *dialedAddress != "93.184.216.34:80" {
		t.Fatalf("dialed address = %q, want %q", *dialedAddress, "93.184.216.34:80")
	}

	var payload parsedFeedResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if payload.Title != "Cloud Feed" || payload.Description != "Feed description" {
		t.Fatalf("unexpected feed payload: %+v", payload)
	}
	if payload.ArtworkURL != "https://example.com/artwork_600.jpg?cache=1" {
		t.Fatalf("artworkUrl = %q", payload.ArtworkURL)
	}
	if len(payload.Episodes) != 1 {
		t.Fatalf("episode length = %d, want 1", len(payload.Episodes))
	}
	if payload.Episodes[0].Description != "<p>Encoded body</p>" {
		t.Fatalf("unexpected description = %q", payload.Episodes[0].Description)
	}
	if payload.Episodes[0].DescriptionHTML != "<p>Encoded body</p>" {
		t.Fatalf("unexpected descriptionHtml = %q", payload.Episodes[0].DescriptionHTML)
	}
	if payload.Episodes[0].Duration == nil || *payload.Episodes[0].Duration != 3723 {
		t.Fatalf("duration = %+v, want 3723", payload.Episodes[0].Duration)
	}
	if payload.Episodes[0].SeasonNumber == nil || *payload.Episodes[0].SeasonNumber != 2 {
		t.Fatalf("seasonNumber = %+v, want 2", payload.Episodes[0].SeasonNumber)
	}
	if payload.Episodes[0].EpisodeNumber == nil || *payload.Episodes[0].EpisodeNumber != 7 {
		t.Fatalf("episodeNumber = %+v, want 7", payload.Episodes[0].EpisodeNumber)
	}
	if payload.Episodes[0].EpisodeType != "bonus" {
		t.Fatalf("episodeType = %q, want bonus", payload.Episodes[0].EpisodeType)
	}
	if payload.Episodes[0].Explicit == nil || !*payload.Episodes[0].Explicit {
		t.Fatalf("explicit = %+v, want true", payload.Episodes[0].Explicit)
	}
	if payload.Episodes[0].TranscriptURL != "https://example.com/transcript.vtt" {
		t.Fatalf("transcriptUrl = %q", payload.Episodes[0].TranscriptURL)
	}
}

func TestDiscoveryServiceSearchPodcastsNormalizesPayload(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panic during test: %v", r)
		}
	}()
	var capturedURL string
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				capturedURL = req.URL.String()
				t.Logf("Mock transport received URL: %s", capturedURL)
				if !strings.Contains(capturedURL, "term=tech") || !strings.Contains(capturedURL, "limit=20") {
					t.Fatalf("unexpected search url = %q", capturedURL)
				}
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"collectionId": 123,
								"collectionName": "Tech Show",
								"artistName": "Tech Host",
								"artworkUrl600": "https://example.com/tech-600.jpg",
								"releaseDate": "2026-03-27T00:00:00Z",
								"trackCount": 321,
								"genres": [{"name": "Technology"}]
							}
						]
					}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=tech%20show&country=us&limit=20", nil)
	t.Logf("Request URL: %s", req.URL.String())
	service.ServeHTTP(rr, req)
	t.Logf("Response status: %d, body: %s", rr.Code, rr.Body.String())

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0]["title"] != "Tech Show" {
		t.Fatalf("title = %q, want Tech Show", payload[0]["title"])
	}
	if payload[0]["releaseDate"] != "2026-03-27T00:00:00Z" {
		t.Fatalf("releaseDate = %v, want 2026-03-27T00:00:00Z", payload[0]["releaseDate"])
	}
	if payload[0]["episodeCount"] != float64(321) {
		t.Fatalf("episodeCount = %v, want 321", payload[0]["episodeCount"])
	}
	if _, ok := payload[0]["feedUrl"]; ok {
		t.Fatalf("feedUrl should be absent, payload = %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchPodcastsFiltersIrrelevantFallbackResults(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panic during test: %v", r)
		}
	}()
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"collectionId": 1,
								"collectionName": "Fan Controlled TV",
								"artistName": "Irrelevant Host",
								"artworkUrl600": "https://example.com/fan-600.jpg",
								"releaseDate": "2026-01-01T00:00:00Z",
								"trackCount": 25,
								"genres": [{"name": "Sports"}]
							},
							{
								"collectionId": 2,
								"collectionName": "The Kevin Spacey Trial",
								"artistName": "Relevant Host",
								"artworkUrl600": "https://example.com/kevin-600.jpg",
								"releaseDate": "2026-02-01T00:00:00Z",
								"trackCount": 12,
							"genres": [{"name": "News"}]
						}
					]
				}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,

		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodGet,
		discoverySearchPodcastsRoute+"?term=the%20kevin%20spacey%20trial&country=us&limit=20",
		nil,
	)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0]["title"] != "The Kevin Spacey Trial" {
		t.Fatalf("title = %q, want The Kevin Spacey Trial", payload[0]["title"])
	}
}

func TestDiscoveryServiceSearchPodcastsDropsRowsWithoutCollectionName(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"collectionId": 123,
							"collectionName": "   ",
							"artistName": "Host",
							"artworkUrl600": "https://example.com/show-600.jpg",
							"trackCount": 42,
							"genres": [{"name": "Technology"}]
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=show&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 0 {
		t.Fatalf("payload length = %d, want 0", len(payload))
	}
}

func TestDiscoveryServiceSearchPodcastsOmitsReleaseDateWhenMissing(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"collectionId": 123,
							"collectionName": "Tech Show",
							"artistName": "Host",
							"artworkUrl600": "https://example.com/show-600.jpg",
							"trackCount": 42,
							"genres": []
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=tech&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if _, ok := payload[0]["releaseDate"]; ok {
		t.Fatalf("releaseDate should be absent, payload = %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchEpisodesNormalizesPayload(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panic during test: %v", r)
		}
	}()
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "term=history") || !strings.Contains(req.URL.String(), "entity=podcastEpisode") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"trackId": 999,
								"trackName": "History Episode",
								"collectionName": "History Show",
								"collectionId": 123,
								"artworkUrl600": "https://example.com/history-600.jpg",
								"episodeUrl": "https://example.com/history.mp3",
								"episodeGuid": "abc123-def456",
								"releaseDate": "2026-03-27T00:00:00Z",
								"trackTimeMillis": 1800000,
								"shortDescription": "A history episode"
							}
						]
					}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=History&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if _, ok := payload[0]["id"]; ok {
		t.Fatalf("id should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["author"]; ok {
		t.Fatalf("author should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["image"]; ok {
		t.Fatalf("image should be absent, payload = %+v", payload[0])
	}
	if payload[0]["title"] != "History Episode" {
		t.Fatalf("title = %q, want History Episode", payload[0]["title"])
	}
	if payload[0]["showTitle"] != "History Show" {
		t.Fatalf("showTitle = %q, want History Show", payload[0]["showTitle"])
	}
	if payload[0]["artwork"] != "https://example.com/history-600.jpg" {
		t.Fatalf("artwork = %q, want https://example.com/history-600.jpg", payload[0]["artwork"])
	}
	if payload[0]["podcastItunesId"] != "123" {
		t.Fatalf("podcastItunesId = %q, want 123", payload[0]["podcastItunesId"])
	}
	if _, ok := payload[0]["feedUrl"]; ok {
		t.Fatalf("feedUrl should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["providerEpisodeId"]; ok {
		t.Fatalf("providerEpisodeId should be absent, payload = %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutTrackName(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "term=history") || !strings.Contains(req.URL.String(), "entity=podcastEpisode") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"trackId": 999,
								"collectionName": "History Show",
								"artworkUrl600": "https://example.com/history-600.jpg",
								"episodeUrl": "https://example.com/history.mp3",
								"releaseDate": "2026-03-27T00:00:00Z",
								"trackTimeMillis": 1800000,
								"shortDescription": "A history episode",
								"collectionId": 123
							}
						]
					}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history%20episode&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 0 {
		t.Fatalf("payload length = %d, want 0", len(payload))
	}
}

func TestDiscoveryServiceSearchEpisodesAllowsMissingReleaseDateDescriptionAndDuration(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "term=history") || !strings.Contains(req.URL.String(), "entity=podcastEpisode") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"trackId": 999,
							"trackName": "History Episode",
							"collectionName": "History Show",
							"collectionId": 123,
							"artworkUrl600": "https://example.com/history-600.jpg",
							"episodeUrl": "https://example.com/history.mp3",
							"episodeGuid": "abc123-def456"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if _, ok := payload[0]["releaseDate"]; ok {
		t.Fatalf("releaseDate should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["shortDescription"]; ok {
		t.Fatalf("shortDescription should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["trackTimeMillis"]; ok {
		t.Fatalf("trackTimeMillis should be absent, payload = %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutArtwork600(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "term=history") || !strings.Contains(req.URL.String(), "entity=podcastEpisode") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"trackName": "History Episode",
							"collectionName": "History Show",
							"collectionId": 123,
							"episodeUrl": "https://example.com/history.mp3",
							"episodeGuid": "abc123-def456"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 0 {
		t.Fatalf("payload length = %d, want 0", len(payload))
	}
}

func TestDiscoveryServiceSearchEpisodesDoesNotDependOnRemovedRawFields(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "term=history") || !strings.Contains(req.URL.String(), "entity=podcastEpisode") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"trackName": "History Episode",
							"collectionName": "History Show",
							"collectionId": 123,
							"artworkUrl600": "https://example.com/history-600.jpg",
							"episodeUrl": "https://example.com/history.mp3",
							"episodeGuid": "abc123-def456"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0]["title"] != "History Episode" {
		t.Fatalf("title = %q, want History Episode", payload[0]["title"])
	}
	if payload[0]["showTitle"] != "History Show" {
		t.Fatalf("showTitle = %q, want History Show", payload[0]["showTitle"])
	}
}

func TestPodcastIndexPayloadValidation(t *testing.T) {
	t.Run("podcast byitunesid ignores upstream status field and trusts feed payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"status":"false",
						"feed":{
							"title":"Test",
							"url":"https://example.com/feed.xml",
							"author":"Author",
							"artwork":"https://example.com/artwork.jpg",
							"description":"Description",
							"itunesId":123,
							"lastUpdateTime":1700000000,
							"language":"en",
							"episodeCount":10,
							"dead":1,
							"categories":{"1":"Technology"}
						}
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload piPodcastResponse
		decodeResponseJSON(t, rr.Body, &payload)
		if payload.PodcastItunesID != "123" || payload.Title != "Test" {
			t.Fatalf("unexpected payload: %+v", payload)
		}
		if !payload.Dead {
			t.Fatalf("dead = false, want true")
		}
	})

	t.Run("podcast byitunesid rejects zero-value feed payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"feed":{"title":"","url":""}}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		if rr.Body.String() != "null" && rr.Body.String() != "null\n" {
			var resp piPodcastResponse
			decodeResponseJSON(t, rr.Body, &resp)
			if resp.Title != "" && resp.PodcastItunesID != "" {
				t.Fatalf("zero-value feed should not be returned as valid podcast, got: %+v", resp)
			}
		}
	})

	t.Run("batch byguid ignores upstream status field and trusts feeds payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"status":"false","feeds":[]}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader(`["guid1"]`))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp []piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		if len(resp) != 0 {
			t.Fatalf("response length = %d, want 0", len(resp))
		}
	})
}

func TestPodcastIndexBatchLimits(t *testing.T) {
	t.Run("rejects oversized batch", func(t *testing.T) {
		service := newDiscoveryService()

		guids := make([]string, 101)
		for i := range guids {
			guids[i] = fmt.Sprintf("guid-%d", i)
		}

		rr := httptest.NewRecorder()
		body, _ := json.Marshal(guids)
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader(string(body)))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d (max 100 GUIDs)", rr.Code, http.StatusBadRequest)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "INVALID_GUID_BATCH" {
			t.Fatalf("code = %q, want INVALID_GUID_BATCH", payload["code"])
		}
	})

	t.Run("deduplicates duplicate GUIDs", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					if !strings.Contains(req.URL.Path, "/podcasts/batch/byguid") {
						t.Fatalf("unexpected url: %s", req.URL.Path)
					}
					var body []string
					if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
						t.Fatalf("decode body: %v", err)
					}
					if len(body) != 2 {
						t.Fatalf("upstream should receive 2 unique GUIDs, got %d: %v", len(body), body)
					}
					return jsonResponse(http.StatusOK, `{"feeds":[]}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader(`["guid-a","guid-b","guid-a","guid-b"]`))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
	})

	t.Run("normalizes duplicate GUIDs before upstream call", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		var receivedGUIDs []string
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					if err := json.NewDecoder(req.Body).Decode(&receivedGUIDs); err != nil {
						return jsonResponse(http.StatusOK, `{"feeds":[]}`), nil
					}
					return jsonResponse(http.StatusOK, `{"feeds":[
						{"id":1,"podcastGuid":"guid1","itunesId":123456789,"title":"Show 1","author":"Author 1","description":"Description 1","url":"https://example.com/1.xml","artwork":"https://example.com/1.jpg","episodeCount":10,"language":"en","lastUpdateTime":1700000000,"categories":{"1":"Technology"}},
						{"id":2,"podcastGuid":"guid2","itunesId":987654321,"title":"Show 2","author":"Author 2","description":"Description 2","url":"https://example.com/2.xml","artwork":"https://example.com/2.jpg","episodeCount":20,"language":"en","lastUpdateTime":1700000000,"categories":{"2":"Comedy"}}
					]}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader(`["guid1","guid1","guid2"]`))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		unique := make(map[string]bool)
		for _, g := range receivedGUIDs {
			unique[g] = true
		}
		if len(unique) != len(receivedGUIDs) {
			t.Fatalf("upstream received %d GUIDs with duplicates: %v", len(receivedGUIDs), receivedGUIDs)
		}

		var resp []piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		if len(resp) != 2 {
			t.Fatalf("response length = %d, want 2", len(resp))
		}
	})

	t.Run("preserves input ordering in response", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"feeds":[
						{"id":1,"podcastGuid":"guidC","itunesId":111,"title":"Show C","author":"Author C","description":"Description C","url":"https://example.com/c.xml","artwork":"https://example.com/c.jpg","episodeCount":30,"language":"en","lastUpdateTime":1700000000,"categories":{"1":"Technology"}},
						{"id":2,"podcastGuid":"guidA","itunesId":222,"title":"Show A","author":"Author A","description":"Description A","url":"https://example.com/a.xml","artwork":"https://example.com/a.jpg","episodeCount":10,"language":"en","lastUpdateTime":1700000000,"categories":{"2":"Comedy"}},
						{"id":3,"podcastGuid":"guidB","itunesId":333,"title":"Show B","author":"Author B","description":"Description B","url":"https://example.com/b.xml","artwork":"https://example.com/b.jpg","episodeCount":20,"language":"en","lastUpdateTime":1700000000,"categories":{"3":"News"}}
					]}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastIndexPodcastsBatchByGUIDRoute, strings.NewReader(`["guidC","guidA","guidB"]`))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp []piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		if len(resp) != 3 {
			t.Fatalf("response length = %d, want 3", len(resp))
		}
		if resp[0].Title == "" || resp[0].PodcastItunesID == "" {
			t.Fatalf("resp[0] missing title or podcastItunesId: %+v", resp[0])
		}
		if resp[1].Title == "" || resp[1].PodcastItunesID == "" {
			t.Fatalf("resp[1] missing title or podcastItunesId: %+v", resp[1])
		}
		if resp[2].Title == "" || resp[2].PodcastItunesID == "" {
			t.Fatalf("resp[2] missing title or podcastItunesId: %+v", resp[2])
		}
	})
}

func TestPodcastIndexOptionalNumericFields(t *testing.T) {
	t.Run("podcast byitunesid does not emit zero for episodeCount", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"feed":{"title":"Test","url":"https://example.com/feed.xml","episodeCount":0}
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)

		if resp.EpisodeCount != nil && *resp.EpisodeCount == 0 {
			t.Fatalf("episodeCount should be nil when zero, got: %v", resp.EpisodeCount)
		}
	})

	t.Run("podcast byitunesid accepts missing optional metadata", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"feed":{
							"title":"Test",
							"url":"https://example.com/feed.xml",
							"author":"Author",
							"artwork":"https://example.com/artwork.jpg",
							"description":"Description",
							"itunesId":123,
							"dead":0,
							"categories":{}
						}
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp map[string]any
		decodeResponseJSON(t, rr.Body, &resp)
		if resp["podcastItunesId"] != "123" {
			t.Fatalf("podcastItunesId = %v, want 123", resp["podcastItunesId"])
		}
		if _, ok := resp["lastUpdateTime"]; ok {
			t.Fatalf("lastUpdateTime should be omitted, payload = %+v", resp)
		}
		if _, ok := resp["episodeCount"]; ok {
			t.Fatalf("episodeCount should be omitted, payload = %+v", resp)
		}
		if _, ok := resp["language"]; ok {
			t.Fatalf("language should be omitted, payload = %+v", resp)
		}
		if genres, ok := resp["genres"].([]any); !ok || len(genres) != 0 {
			t.Fatalf("genres = %v, want empty array", resp["genres"])
		}
	})

	t.Run("podcast byitunesid uses requested itunes id as canonical identity", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"feed":{
							"title":"Test",
							"url":"https://example.com/feed.xml",
							"author":"Author",
							"artwork":"https://example.com/artwork.jpg",
							"description":"Description",
							"dead":0,
							"categories":{}
						}
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(discoveryCacheMaxKeys),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		if resp.PodcastItunesID != "123" {
			t.Fatalf("podcastItunesId = %q, want 123", resp.PodcastItunesID)
		}
	})

}

func TestDiscoveryServiceRejectsInvalidParamsAndMapsUpstreamErrors(t *testing.T) {
	t.Run("rejects invalid country", func(t *testing.T) {
		service := newDiscoveryService()

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=USA", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "INVALID_COUNTRY" {
			t.Fatalf("code = %q, want INVALID_COUNTRY", payload["code"])
		}
	})

	t.Run("maps upstream timeout to gateway timeout json", func(t *testing.T) {
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					<-req.Context().Done()
					return nil, req.Context().Err()
				}),
			},
			timeout:    20 * time.Millisecond,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(discoveryCacheMaxKeys),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusGatewayTimeout {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusGatewayTimeout)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_TIMEOUT" {
			t.Fatalf("code = %q, want UPSTREAM_TIMEOUT", payload["code"])
		}
	})

	t.Run("rejects empty search term", func(t *testing.T) {
		service := newDiscoveryService()

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=%20%20&country=us", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "INVALID_TERM" {
			t.Fatalf("code = %q, want INVALID_TERM", payload["code"])
		}
	})

	t.Run("rejects invalid feed url", func(t *testing.T) {
		service := newDiscoveryService()

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url=notaurl", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "INVALID_URL" {
			t.Fatalf("code = %q, want INVALID_URL", payload["code"])
		}
	})

	t.Run("maps feed timeout to gateway timeout json", func(t *testing.T) {
		service := &discoveryService{
			timeout:   20 * time.Millisecond,
			userAgent: discoveryUserAgent,
			bodyLimit: discoveryBodyLimit,
			cache:     newDiscoveryCache(discoveryCacheMaxKeys),
			lookupIP: func(context.Context, string) ([]net.IPAddr, error) {
				return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
			},
			dialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				<-ctx.Done()
				return nil, ctx.Err()
			},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url=http://example.com/feed.xml", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusGatewayTimeout {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusGatewayTimeout)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_TIMEOUT" {
			t.Fatalf("code = %q, want UPSTREAM_TIMEOUT", payload["code"])
		}
	})

	t.Run("maps feed upstream failure to bad gateway json", func(t *testing.T) {
		service, dialedAddress := newDiscoveryFeedFixtureService(
			t,
			"example.com",
			"93.184.216.34",
			time.Second,
			func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "text/plain")
				w.WriteHeader(http.StatusBadGateway)
				_, _ = io.WriteString(w, "boom")
			},
		)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url=http://example.com/feed.xml", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}
		if *dialedAddress != "93.184.216.34:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "93.184.216.34:80")
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_INVALID_RESPONSE" {
			t.Fatalf("code = %q, want UPSTREAM_INVALID_RESPONSE", payload["code"])
		}
	})

	t.Run("maps malformed feed xml to xml-specific bad gateway json", func(t *testing.T) {
		service, dialedAddress := newDiscoveryFeedFixtureService(
			t,
			"example.com",
			"93.184.216.34",
			time.Second,
			func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/feed.xml" {
					t.Fatalf("path = %q, want /feed.xml", r.URL.Path)
				}
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = io.WriteString(w, `<rss><channel><title>Broken`)
			},
		)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryFeedRoute+"?url=http://example.com/feed.xml", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}
		if *dialedAddress != "93.184.216.34:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "93.184.216.34:80")
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "INVALID_UPSTREAM_XML" {
			t.Fatalf("code = %q, want INVALID_UPSTREAM_XML", payload["code"])
		}
		if payload["message"] != "discovery upstream response was not valid XML" {
			t.Fatalf("message = %q, want discovery upstream response was not valid XML", payload["message"])
		}
	})
}

func TestDiscoveryServiceUsesJSONErrorForUnknownEndpoints(t *testing.T) {
	service := newDiscoveryService()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryRoutePrefix+"missing", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}
	if got := rr.Header().Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("content-type = %q, want application/json", got)
	}
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
		Body:    io.NopCloser(strings.NewReader(body)),
		Request: httptest.NewRequest(http.MethodGet, "https://example.com", nil),
	}
}

func textResponse(status int, body string, contentType string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header: http.Header{
			"Content-Type": []string{contentType},
		},
		Body:    io.NopCloser(strings.NewReader(body)),
		Request: httptest.NewRequest(http.MethodGet, "https://example.com", nil),
	}
}

func decodeResponseJSON(t *testing.T, body interface{ String() string }, dest any) {
	t.Helper()
	if err := json.Unmarshal([]byte(body.String()), dest); err != nil {
		t.Fatalf("decode body %q: %v", body.String(), err)
	}
}

func TestDecodeDiscoveryJSONRejectsOversizedBodies(t *testing.T) {
	var payload map[string]any
	err := decodeDiscoveryJSON(strings.NewReader(`{"a":"`+strings.Repeat("x", 32)+`"}`), 8, &payload)
	if !errors.Is(err, errDiscoveryTooLarge) {
		t.Fatalf("error = %v, want errDiscoveryTooLarge", err)
	}
}

func TestDecodeDiscoveryFeedSanitizesXML(t *testing.T) {
	t.Run("bare ampersand in content", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Smith & Jones Show</title>
    <description>Fun times</description>
    <item>
      <title>Ep 1: Smith & Jones intro</title>
      <description>Smith &amp; Jones talk about things</description>
      <guid>ep-1</guid>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/audio.mp3" length="1000" />
    </item>
  </channel>
</rss>`)
		result, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}
		if !strings.Contains(result.Title, "Smith") {
			t.Fatalf("title = %q, want to contain Smith", result.Title)
		}
		if len(result.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(result.Episodes))
		}
	})

	t.Run("bare ampersand in URL attribute", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ampersand Feed</title>
    <description>test</description>
    <item>
      <title>Ep 1</title>
      <description>ok</description>
      <guid>ep-1</guid>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/audio.mp3?id=1&format=mp3" length="1000" />
    </item>
  </channel>
</rss>`)
		result, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}
		if len(result.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(result.Episodes))
		}
		if !strings.Contains(result.Episodes[0].AudioURL, "format=mp3") {
			t.Fatalf("audioUrl = %q, want to contain format=mp3", result.Episodes[0].AudioURL)
		}
	})

	t.Run("control characters in text", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Clean` + "\x01\x0B\x7F" + `Feed</title>
    <description>desc</description>
    <item>
      <title>Ep` + "\x01" + ` 1</title>
      <description>ok</description>
      <guid>ep-1</guid>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/audio.mp3" length="1000" />
    </item>
  </channel>
</rss>`)
		result, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}
		if result.Title == "" {
			t.Fatalf("title is empty after sanitization")
		}
		if len(result.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(result.Episodes))
		}
	})

	t.Run("CDATA with ampersands", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CDATA Feed</title>
    <description>test</description>
    <item>
      <title>Ep 1</title>
      <description><![CDATA[<p>Tom & Jerry are friends</p>]]></description>
      <guid>ep-1</guid>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/audio.mp3" length="1000" />
    </item>
  </channel>
</rss>`)
		result, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}
		if len(result.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(result.Episodes))
		}
	})

	t.Run("empty feed no items", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <description>no items</description>
  </channel>
</rss>`)
		result, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}
		if result.Title != "Empty Feed" {
			t.Fatalf("title = %q, want Empty Feed", result.Title)
		}
		if len(result.Episodes) != 0 {
			t.Fatalf("episodes length = %d, want 0", len(result.Episodes))
		}
	})

	t.Run("enclosure missing URL", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Missing URL Feed</title>
    <description>test</description>
    <item>
      <title>No Audio Episode</title>
      <description>has no enclosure url</description>
      <guid>ep-1</guid>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure length="0" />
    </item>
  </channel>
</rss>`)
		_, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err == nil {
			t.Fatalf("decodeDiscoveryFeedXML should reject feed when every item is invalid")
		}
		if !errors.Is(err, errDiscoveryXMLDecode) {
			t.Fatalf("error = %v, want errDiscoveryXMLDecode", err)
		}
	})

	t.Run("item missing guid rejects feed when no valid episodes remain", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Missing GUID Feed</title>
    <description>test</description>
    <item>
      <title>No GUID Episode</title>
      <description>has audio but no guid</description>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/audio.mp3" length="1000" />
    </item>
  </channel>
</rss>`)
		_, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err == nil {
			t.Fatalf("decodeDiscoveryFeedXML should reject feed when every item is invalid")
		}
		if !errors.Is(err, errDiscoveryXMLDecode) {
			t.Fatalf("error = %v, want errDiscoveryXMLDecode", err)
		}
	})

	t.Run("keeps valid items when invalid items are mixed in", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Mixed Feed</title>
    <description>test</description>
    <item>
      <title>Invalid Episode</title>
      <description>missing guid</description>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/invalid.mp3" length="1000" />
    </item>
    <item>
      <title>Valid Episode</title>
      <description>kept</description>
      <guid>ep-valid</guid>
      <pubDate>Sat, 31 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/valid.mp3" length="2000" />
    </item>
  </channel>
</rss>`)
		result, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}
		if len(result.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(result.Episodes))
		}
		if result.Episodes[0].EpisodeGUID != "ep-valid" {
			t.Fatalf("episodeGuid = %q, want ep-valid", result.Episodes[0].EpisodeGUID)
		}
		if result.Episodes[0].AudioURL != "http://example.com/valid.mp3" {
			t.Fatalf("audioUrl = %q, want valid episode audio", result.Episodes[0].AudioURL)
		}
	})

	t.Run("whitespace-only title", func(t *testing.T) {
		body := strings.NewReader(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>   </title>
    <description>no real title</description>
    <item>
      <title>Ep 1</title>
      <description>ok</description>
      <guid>ep-1</guid>
      <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
      <enclosure url="http://example.com/audio.mp3" length="1000" />
    </item>
  </channel>
</rss>`)
		_, err := decodeDiscoveryFeedXML(body, discoveryBodyLimit)
		if err == nil {
			t.Fatalf("decodeDiscoveryFeedXML should return error for whitespace-only title")
		}
	})
}

func TestDiscoveryFetchJSONMapsNonSuccessStatus(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusBadGateway, `{"error":"bad"}`), nil
			}),
		},
		timeout:    time.Second,
		rssBaseURL: discoveryRSSBaseURL,

		userAgent: discoveryUserAgent,
		bodyLimit: discoveryBodyLimit,
		cache:     newDiscoveryCache(discoveryCacheMaxKeys),
	}

	err := service.fetchJSON(context.Background(), "https://example.com", &map[string]any{})
	var statusErr *discoveryUpstreamStatusError
	if !errors.As(err, &statusErr) || statusErr.status != http.StatusBadGateway {
		t.Fatalf("error = %v, want discoveryUpstreamStatusError(502)", err)
	}
}

func TestDiscoveryCacheBehavior(t *testing.T) {
	t.Run("cache hit returns cached data without upstream call", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					return jsonResponse(http.StatusOK, `{
						"feed": {
							"results": [
								{"id": "100", "name": "Cached Show", "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/show", "genres": [{"name": "Tech"}]}
							]
						}
					}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d, want %d", rr1.Code, http.StatusOK)
		}

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusOK {
			t.Fatalf("second request: status = %d, want %d", rr2.Code, http.StatusOK)
		}

		if upstreamCalls != 1 {
			t.Fatalf("upstreamCalls = %d, want 1 (cache hit should skip upstream)", upstreamCalls)
		}
		if rr1.Body.String() != rr2.Body.String() {
			t.Fatalf("cached response differs from first response")
		}
	})

	t.Run("cache miss triggers upstream fetch", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					return jsonResponse(http.StatusOK, `{
						"feed": {
							"results": [
								{"id": "1", "name": "Show", "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
							]
						}
					}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if upstreamCalls != 1 {
			t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
		}
	})

	t.Run("error responses are NOT cached", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					return jsonResponse(http.StatusBadGateway, `{"error":"bad"}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusBadGateway {
			t.Fatalf("first request: status = %d, want %d", rr1.Code, http.StatusBadGateway)
		}

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusBadGateway {
			t.Fatalf("second request: status = %d, want %d", rr2.Code, http.StatusBadGateway)
		}

		if upstreamCalls != 2 {
			t.Fatalf("upstreamCalls = %d, want 2 (error must not be cached)", upstreamCalls)
		}
	})

	t.Run("expired entries are not returned", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					name := fmt.Sprintf("Show-%d", upstreamCalls)
					return jsonResponse(http.StatusOK, fmt.Sprintf(`{
						"feed": {
							"results": [
								{"id": "1", "name": %q, "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
							]
						}
					}`, name)), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLTopPodcasts
		discoveryCacheTTLTopPodcasts = 50 * time.Millisecond
		defer func() { discoveryCacheTTLTopPodcasts = origTTL }()

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d", rr1.Code)
		}

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusOK {
			t.Fatalf("second request: status = %d", rr2.Code)
		}

		if upstreamCalls != 2 {
			t.Fatalf("upstreamCalls = %d, want 2 (expired entry should trigger refetch)", upstreamCalls)
		}

		var first, second []topPodcastResponse
		decodeResponseJSON(t, rr1.Body, &first)
		decodeResponseJSON(t, rr2.Body, &second)
		if len(first) != 1 || len(second) != 1 {
			t.Fatalf("unexpected payload lengths: %d, %d", len(first), len(second))
		}
		if first[0].Title == second[0].Title {
			t.Fatalf("expected different names after TTL expiry, got %q both times", first[0].Title)
		}
	})

	t.Run("lookup podcast is cached", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"feed":{"id":42,"title":"Cached Lookup","url":"https://example.com/feed.xml"}
					}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=42", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d", rr1.Code)
		}

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusOK {
			t.Fatalf("second request: status = %d", rr2.Code)
		}

		if upstreamCalls != 1 {
			t.Fatalf("upstreamCalls = %d, want 1 (lookup podcast should be cached)", upstreamCalls)
		}
	})
}

func TestDiscoveryCacheGracefulDegradation(t *testing.T) {
	t.Run("fresh cache returns fresh status", func(t *testing.T) {
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"feed": {
							"results": [
								{"id": "1", "name": "Show", "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
							]
						}
					}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr := httptest.NewRecorder()
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var items []topPodcastResponse
		decodeResponseJSON(t, rr.Body, &items)
		if len(items) != 1 || items[0].Title != "Show" {
			t.Fatalf("unexpected response body")
		}
	})

	t.Run("stale cache returns stale data when refresh fails", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					if upstreamCalls == 1 {
						return jsonResponse(http.StatusOK, `{
							"feed": {
								"results": [
									{"id": "1", "name": "Stale Show", "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
								]
							}
						}`), nil
					}
					return nil, errors.New("upstream failed")
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLTopPodcasts
		discoveryCacheTTLTopPodcasts = 50 * time.Millisecond
		defer func() { discoveryCacheTTLTopPodcasts = origTTL }()

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d", rr1.Code)
		}

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusOK {
			t.Fatalf("second request: status = %d, want %d (should return stale data)", rr2.Code, http.StatusOK)
		}

		if upstreamCalls != 2 {
			t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
		}

		var items []topPodcastResponse
		decodeResponseJSON(t, rr2.Body, &items)
		if len(items) != 1 || items[0].Title != "Stale Show" {
			t.Fatalf("expected stale data to be returned, got %v", items)
		}
	})

	t.Run("stale cache refreshes successfully", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					name := fmt.Sprintf("Show-%d", upstreamCalls)
					return jsonResponse(http.StatusOK, fmt.Sprintf(`{
						"feed": {
							"results": [
								{"id": "1", "name": %q, "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
							]
						}
					}`, name)), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLTopPodcasts
		discoveryCacheTTLTopPodcasts = 50 * time.Millisecond
		defer func() { discoveryCacheTTLTopPodcasts = origTTL }()

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d", rr1.Code)
		}

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusOK {
			t.Fatalf("second request: status = %d", rr2.Code)
		}

		if upstreamCalls != 2 {
			t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
		}

		var first, second []topPodcastResponse
		decodeResponseJSON(t, rr1.Body, &first)
		decodeResponseJSON(t, rr2.Body, &second)
		if first[0].Title == second[0].Title {
			t.Fatalf("expected fresh data after refresh, got same data")
		}
	})

	t.Run("lookup podcast stale cache is not served when provider is not configured", func(t *testing.T) {
		service := &discoveryService{
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLLookup
		discoveryCacheTTLLookup = 50 * time.Millisecond
		defer func() { discoveryCacheTTLLookup = origTTL }()

		discoveryCacheSet(service.cache, "podcastindex-podcast-itunes:42", &piPodcastResponse{
			Title:           "Stale Lookup",
			Author:          "Host",
			Artwork:         "https://example.com/art.jpg",
			Description:     "desc",
			FeedURL:         "https://example.com/feed.xml",
			PodcastItunesID: "42",
			Genres:          []string{"Tech"},
		}, 10*time.Millisecond)

		time.Sleep(20 * time.Millisecond)

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=42", nil)
		rr := httptest.NewRecorder()
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusServiceUnavailable)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "DISCOVERY_PROVIDER_NOT_CONFIGURED" {
			t.Fatalf("code = %q, want DISCOVERY_PROVIDER_NOT_CONFIGURED", payload["code"])
		}
	})

	t.Run("lookup podcast stale cache is served on upstream failure", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					if upstreamCalls == 1 {
						return jsonResponse(http.StatusOK, `{
							"status":"true",
							"feed":{
								"id":42,
								"title":"Fresh Lookup",
								"url":"https://example.com/feed.xml",
								"description":"desc",
								"author":"Host",
								"artwork":"https://example.com/art.jpg",
								"itunesId":42,
								"categories":{"1":"Tech"}
							}
						}`), nil
					}
					return nil, errors.New("podcastindex upstream failed")
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLLookup
		discoveryCacheTTLLookup = 50 * time.Millisecond
		defer func() { discoveryCacheTTLLookup = origTTL }()

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastIndexPodcastByItunesIDRoute+"?podcastItunesId=42", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d, want %d", rr1.Code, http.StatusOK)
		}

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		if rr2.Code != http.StatusOK {
			t.Fatalf("second request: status = %d, want %d", rr2.Code, http.StatusOK)
		}

		if upstreamCalls != 2 {
			t.Fatalf("upstreamCalls = %d, want 2", upstreamCalls)
		}

		var payload piPodcastResponse
		decodeResponseJSON(t, rr2.Body, &payload)
		if payload.Title != "Fresh Lookup" {
			t.Fatalf("expected stale lookup payload, got %+v", payload)
		}
	})

	t.Run("cache miss triggers upstream fetch", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					return jsonResponse(http.StatusOK, `{
						"feed": {
							"results": [
								{"id": "1", "name": "New Show", "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
							]
						}
					}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr := httptest.NewRecorder()
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if upstreamCalls != 1 {
			t.Fatalf("upstreamCalls = %d, want 1", upstreamCalls)
		}
	})

	t.Run("singleflight prevents concurrent refresh", func(t *testing.T) {
		concurrentCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					concurrentCalls++
					time.Sleep(50 * time.Millisecond)
					return jsonResponse(http.StatusOK, `{
						"feed": {
							"results": [
								{"id": "1", "name": "Show", "artistName": "Host", "artworkUrl100": "https://example.com/show.jpg", "url": "https://example.com/1", "genres": [{"name": "Tech"}]}
							]
						}
					}`), nil
				}),
			},
			timeout:    time.Second,
			rssBaseURL: discoveryRSSBaseURL,

			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
			searchLimiter: newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLTopPodcasts
		discoveryCacheTTLTopPodcasts = 50 * time.Millisecond
		defer func() { discoveryCacheTTLTopPodcasts = origTTL }()

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		if rr1.Code != http.StatusOK {
			t.Fatalf("first request: status = %d", rr1.Code)
		}

		time.Sleep(100 * time.Millisecond)

		var wg sync.WaitGroup
		for i := 0; i < 3; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				rr := httptest.NewRecorder()
				service.ServeHTTP(rr, req)
			}()
		}
		wg.Wait()

		if concurrentCalls != 2 {
			t.Fatalf("concurrentCalls = %d, want 2 (initial + one refresh due to singleflight)", concurrentCalls)
		}
	})
}
