package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

type discoveryRoundTripper func(*http.Request) (*http.Response, error)

func (fn discoveryRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

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
				if req.URL.String() != discoveryAppleChartsBaseURL+"/us/podcasts/top/25/podcasts.json" {
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		topLimiter:         newRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		trustedProxies:     trustedProxySet{},
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		topLimiter:         newRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		trustedProxies:     trustedProxySet{},
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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

	req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil))
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

	firstReq := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader("[]"))
	service.ServeHTTP(httptest.NewRecorder(), firstReq)

	rr := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader("[]"))
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
				if req.URL.String() != discoveryAppleChartsBaseURL+"/jp/podcasts/top/10/podcast-episodes.json" {
					t.Fatalf("upstream url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artistName": "The New York Times",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": [{"name": "Technology"}, {"name": "Podcast"}]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
	if payload[0].Author != "The New York Times" {
		t.Fatalf("author = %q, want The New York Times", payload[0].Author)
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
	}
}

func TestDiscoveryServiceTopEpisodesDropsRowsWithInvalidArtwork100URL(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"feed": {
						"results": [
							{
								"name": "Top Episode",
								"artistName": "JP Host",
								"artworkUrl100": "ftp://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": [{"name": "Technology"}]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
								"artistName": "The New York Times",
								"name": "Top Episode",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/jp/podcast/top-episode/id333?i=1000762374046",
								"genres": []
							}
						]
					}
				}`), nil
			}),
		},
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
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
					return jsonResponse(http.StatusOK, `{"status":"true","feed":{"title":"Show 123","url":"https://example.com/feed.xml","lastUpdateTime":1613394044,"author":"Test Author","artwork":"https://example.com/artwork.jpg","description":"A test podcast","itunesId":123,"language":"en","episodeCount":50,"dead":0,"categories":{"1":"Technology"}}}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["lastUpdateTime"] != float64(1613394044) {
			t.Fatalf("lastUpdateTime = %v, want 1613394044", payload["lastUpdateTime"])
		}
		if _, ok := payload["dead"]; ok {
			t.Fatalf("dead should be omitted, payload = %+v", payload)
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
	})
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
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,

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

func TestDiscoveryServiceSearchPodcastsDropsRowsWithoutReleaseDate(t *testing.T) {
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

	if len(payload) != 0 {
		t.Fatalf("payload length = %d, want 0", len(payload))
	}
}

func TestDiscoveryServiceSearchPodcastsDropsRowsWithInvalidArtwork600URL(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"collectionId": 123,
							"collectionName": "Tech Show",
							"artistName": "Host",
							"artworkUrl600": "javascript:alert(1)",
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

	if len(payload) != 0 {
		t.Fatalf("payload length = %d, want 0", len(payload))
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
	if payload[0]["audioUrl"] != "https://example.com/history.mp3" {
		t.Fatalf("audioUrl = %q, want https://example.com/history.mp3", payload[0]["audioUrl"])
	}
	if payload[0]["podcastItunesId"] != "123" {
		t.Fatalf("podcastItunesId = %q, want 123", payload[0]["podcastItunesId"])
	}
	if payload[0]["guid"] != "abc123-def456" {
		t.Fatalf("guid = %q, want abc123-def456", payload[0]["guid"])
	}
	if _, ok := payload[0]["episodeUrl"]; ok {
		t.Fatalf("episodeUrl should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["episodeGuid"]; ok {
		t.Fatalf("episodeGuid should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["feedUrl"]; ok {
		t.Fatalf("feedUrl should be absent, payload = %+v", payload[0])
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

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutShortDescription(t *testing.T) {
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
								"shortDescription": "   "
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

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutReleaseDate(t *testing.T) {
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

	if len(payload) != 0 {
		t.Fatalf("payload length = %d, want 0", len(payload))
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

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutValidAudioURL(t *testing.T) {
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
							"episodeUrl": "ftp://example.com/history.mp3",
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

func TestDiscoveryServiceSearchEpisodesDropsRowsWithInvalidArtwork600URL(t *testing.T) {
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
							"artworkUrl600": "javascript:alert(1)",
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
							"releaseDate": "2026-03-27T00:00:00Z",
							"shortDescription": "A history episode",
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
	if payload[0]["audioUrl"] != "https://example.com/history.mp3" {
		t.Fatalf("audioUrl = %q, want https://example.com/history.mp3", payload[0]["audioUrl"])
	}
	if payload[0]["guid"] != "abc123-def456" {
		t.Fatalf("guid = %q, want abc123-def456", payload[0]["guid"])
	}
	if _, ok := payload[0]["episodeUrl"]; ok {
		t.Fatalf("episodeUrl should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["episodeGuid"]; ok {
		t.Fatalf("episodeGuid should be absent, payload = %+v", payload[0])
	}
}

func TestPodcastIndexPayloadValidation(t *testing.T) {
	t.Run("podcast byitunesid rejects upstream status=false as failed upstream", func(t *testing.T) {
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
							"dead":0,
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_REQUEST_FAILED" {
			t.Fatalf("code = %q, want UPSTREAM_REQUEST_FAILED", payload["code"])
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
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

	t.Run("podcast byitunesid returns null for dead feed", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"feed":{
							"title":"Dead Show",
							"url":"https://example.com/dead.xml",
							"author":"Author",
							"artwork":"https://example.com/dead.jpg",
							"description":"Description",
							"itunesId":123,
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if strings.TrimSpace(rr.Body.String()) != "null" {
			t.Fatalf("body = %q, want null", rr.Body.String())
		}
	})

	t.Run("batch byguid rejects upstream status=false as failed upstream", func(t *testing.T) {
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
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader(`["guid1"]`))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_REQUEST_FAILED" {
			t.Fatalf("code = %q, want UPSTREAM_REQUEST_FAILED", payload["code"])
		}
	})

	t.Run("batch byguid filters dead feeds", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"feeds":[
						{"podcastGuid":"guid1","itunesId":123,"title":"Dead Show","author":"Author","description":"Description","url":"https://example.com/dead.xml","artwork":"https://example.com/dead.jpg","lastUpdateTime":1700000000,"episodeCount":12,"dead":1,"categories":{"1":"Technology"}},
						{"podcastGuid":"guid2","itunesId":456,"title":"Live Show","author":"Author","description":"Description","url":"https://example.com/live.xml","artwork":"https://example.com/live.jpg","lastUpdateTime":1700000001,"episodeCount":34,"dead":0,"categories":{"1":"Technology"}}
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
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader(`["guid1","guid2"]`))
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp []map[string]any
		decodeResponseJSON(t, rr.Body, &resp)
		if len(resp) != 1 {
			t.Fatalf("response length = %d, want 1: %+v", len(resp), resp)
		}
		if resp[0]["podcastItunesId"] != "456" {
			t.Fatalf("podcastItunesId = %v, want 456", resp[0]["podcastItunesId"])
		}
		if _, ok := resp[0]["dead"]; ok {
			t.Fatalf("dead should be omitted, payload = %+v", resp[0])
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
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader(string(body)))
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
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader(`["guid-a","guid-b","guid-a","guid-b"]`))
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
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader(`["guid1","guid1","guid2"]`))
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
		req := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader(`["guidC","guidA","guidB"]`))
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
	t.Run("podcast byitunesid preserves zero episodeCount when PI provides it", func(t *testing.T) {
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
							"lastUpdateTime":1710000000,
							"episodeCount":0,
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)

		if resp.EpisodeCount != 0 {
			t.Fatalf("episodeCount = %d, want 0", resp.EpisodeCount)
		}
	})

	t.Run("podcast byitunesid drops rows when required PI numerics are missing", func(t *testing.T) {
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var resp map[string]any
		decodeResponseJSON(t, rr.Body, &resp)
		if len(resp) != 0 {
			t.Fatalf("response = %+v, want null payload", resp)
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
							"lastUpdateTime":1700000000,
							"episodeCount":10,
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
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
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
			timeout:            20 * time.Millisecond,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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

func TestDiscoveryFetchJSONMapsNonSuccessStatus(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusBadGateway, `{"error":"bad"}`), nil
			}),
		},
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,

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

func TestDiscoveryFetchJSONMapsTransportTimeoutToDiscoveryTimeout(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return nil, &url.Error{Op: "Get", URL: "https://example.com", Err: timeoutErr{}}
			}),
		},
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
	}

	err := service.fetchJSON(context.Background(), "https://example.com", &map[string]any{})
	if !errors.Is(err, errDiscoveryTimeout) {
		t.Fatalf("error = %v, want errDiscoveryTimeout", err)
	}
	if got := classifyDiscoveryError(err); got != "timeout" {
		t.Fatalf("error class = %q, want timeout", got)
	}
	if !os.IsTimeout(err) && !errors.Is(err, errDiscoveryTimeout) {
		t.Fatalf("error should be recognized as timeout, got %v", err)
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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/42", nil)

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(256),
			searchLimiter:      newRateLimiter(10, time.Second, time.Now),
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
			PodcastItunesID: "42",
			Genres:          []string{"Tech"},
		}, 10*time.Millisecond)

		time.Sleep(20 * time.Millisecond)

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/42", nil)
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
								"lastUpdateTime":1700000000,
								"episodeCount":10,
								"categories":{"1":"Tech"}
							}
						}`), nil
					}
					return nil, errors.New("podcastindex upstream failed")
				}),
			},
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(256),
			searchLimiter:      newRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		origTTL := discoveryCacheTTLLookup
		discoveryCacheTTLLookup = 50 * time.Millisecond
		defer func() { discoveryCacheTTLLookup = origTTL }()

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/42", nil)

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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
			timeout:            time.Second,
			appleChartsBaseURL: discoveryAppleChartsBaseURL,

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

func TestDiscoveryServiceRegressionSearchPodcastsSpaceStrippedMatch(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"collectionId": 1423306695,
								"collectionName": "Bear Brook",
								"artistName": "NHPR",
								"artworkUrl600": "https://example.com/bear-600.jpg",
								"releaseDate": "2026-03-27T00:00:00Z",
								"trackCount": 10,
								"genres": [{"name": "Crime"}]
							}
						]
					}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, time.Now),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	// Querying "bearbrook" (no space) should match "Bear Brook" (with space)
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=bearbrook&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []discoverySearchPodcastResponseItem
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("expected 1 result for 'bearbrook', got %d", len(payload))
	}
	if payload[0].Title != "Bear Brook" {
		t.Fatalf("title = %q, want 'Bear Brook'", payload[0].Title)
	}
}

func TestDiscoveryServiceRegressionSearchPodcastsDeduplication(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"collectionId": 123,
								"collectionName": "Show A",
								"artistName": "Artist A",
								"artworkUrl600": "https://example.com/a.jpg",
								"releaseDate": "2026-03-27T00:00:00Z",
								"trackCount": 5,
								"genres": []
							},
							{
								"collectionId": 123,
								"collectionName": "Show A",
								"artistName": "Artist A",
								"artworkUrl600": "https://example.com/a.jpg",
								"releaseDate": "2026-03-27T00:00:00Z",
								"trackCount": 5,
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
		searchLimiter: newRateLimiter(100, time.Minute, time.Now),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=show&country=us", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []discoverySearchPodcastResponseItem
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("expected 1 deduplicated result, got %d", len(payload))
	}
}

func TestDiscoveryServiceRegressionSearchEpisodesDeduplication(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"collectionId": 123,
								"collectionName": "Show A",
								"trackName": "Episode 1",
								"artworkUrl600": "https://example.com/art.jpg",
								"episodeUrl": "https://example.com/audio.mp3",
								"releaseDate": "2026-03-27T00:00:00Z",
								"shortDescription": "Episode summary",
								"episodeGuid": "guid-1"
							},
							{
								"collectionId": 123,
								"collectionName": "Show A",
								"trackName": "Episode 1",
								"artworkUrl600": "https://example.com/art.jpg",
								"episodeUrl": "https://example.com/audio-duplicate.mp3",
								"releaseDate": "2026-03-27T00:00:00Z",
								"shortDescription": "Episode summary",
								"episodeGuid": "guid-1"
							}
						]
					}`), nil
			}),
		},
		timeout:       time.Second,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		searchLimiter: newRateLimiter(100, time.Minute, time.Now),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=episode&country=us", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []discoverySearchEpisodeResponseItem
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("expected 1 deduplicated episode, got %d", len(payload))
	}
	if payload[0].AudioURL != "https://example.com/audio.mp3" {
		t.Fatalf("audioUrl = %q, want https://example.com/audio.mp3", payload[0].AudioURL)
	}
}
