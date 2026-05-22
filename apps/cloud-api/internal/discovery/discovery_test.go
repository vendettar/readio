package discovery

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

	"github.com/stretchr/testify/require"
	"readio-cloud/internal/clientip"
	"readio-cloud/internal/httputil"
	"readio-cloud/internal/podcastindex"
)

type discoveryRoundTripper func(*http.Request) (*http.Response, error)

func (fn discoveryRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

func newDiscoveryService(piEpisodeCacheStores ...*podcastindex.PIEpisodeCacheStore) *discoveryService {
	return NewDiscoveryService(piEpisodeCacheStores...).(*discoveryService)
}

func assertDiscoveryErrorPayload(t *testing.T, body interface{ String() string }, wantCode string) {
	t.Helper()

	var payload map[string]string
	decodeResponseJSON(t, body, &payload)

	require.Equal(t, wantCode, payload["code"])
	require.NotEqual(t, "", strings.TrimSpace(payload["message"]))
	require.NotEqual(t, "", strings.TrimSpace(payload["request_id"]))
}

func TestDiscoveryServiceTopPodcastsNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Equal(t, discoveryAppleChartsBaseURL+"/us/podcasts/top/25/podcasts.json", req.URL.String())
				got := req.Header.Get("Accept")
				require.Equal(t, "application/json", got)
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

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []topPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "100", payload[0].PodcastItunesID)
	require.Equal(t, "Top Show", payload[0].Title)
	require.Len(t, payload[0].Genres, 1)
	require.Equal(t, "Arts", payload[0].Genres[0])
	require.Equal(t, "https://example.com/art-100.jpg", payload[0].Artwork)
}

func TestDiscoveryServiceTopPodcastsRateLimited(t *testing.T) {
	service := &discoveryService{
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		topLimiter:         httputil.NewRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		trustedProxies:     clientip.TrustedProxySet{},
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
	}

	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us", nil))
	require.Equal(t, http.StatusTooManyRequests, rr.Code)

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServiceTopEpisodesRateLimited(t *testing.T) {
	service := &discoveryService{
		timeout:            time.Second,
		appleChartsBaseURL: discoveryAppleChartsBaseURL,
		userAgent:          discoveryUserAgent,
		bodyLimit:          discoveryBodyLimit,
		topLimiter:         httputil.NewRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
		trustedProxies:     clientip.TrustedProxySet{},
		cache:              newDiscoveryCache(discoveryCacheMaxKeys),
	}

	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=us", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=us", nil))
	require.Equal(t, http.StatusTooManyRequests, rr.Code)

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServicePodcastIndexByItunesRateLimited(t *testing.T) {
	t.Setenv(podcastIndexAPIKeyEnv, "test-key")
	t.Setenv(podcastIndexAPISecretEnv, "test-secret")
	t.Setenv(podcastIndexUserAgentEnv, "readio-test")

	service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON(req.URL.Query().Get("id"))), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1")), nil
		default:
			t.Fatalf("unexpected upstream path %q", req.URL.Path)
			return nil, nil
		}
	})
	service.podcastIndexLimiter = httputil.NewRateLimiter(1, time.Minute, func() time.Time { return time.Now() })

	req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
	service.ServeHTTP(httptest.NewRecorder(), req)

	rr := httptest.NewRecorder()
	service.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/456", nil))
	require.Equal(t, http.StatusTooManyRequests, rr.Code)

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServicePodcastIndexBatchRateLimited(t *testing.T) {
	service := &discoveryService{
		timeout:             time.Second,
		userAgent:           discoveryUserAgent,
		bodyLimit:           discoveryBodyLimit,
		cache:               newDiscoveryCache(discoveryCacheMaxKeys),
		podcastIndexLimiter: httputil.NewRateLimiter(1, time.Minute, func() time.Time { return time.Now() }),
	}

	firstReq := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader("[]"))
	service.ServeHTTP(httptest.NewRecorder(), firstReq)

	rr := httptest.NewRecorder()
	secondReq := httptest.NewRequest(http.MethodPost, discoveryPodcastsBatchRoute, strings.NewReader("[]"))
	service.ServeHTTP(rr, secondReq)
	require.Equal(t, http.StatusTooManyRequests, rr.Code)

	assertDiscoveryErrorPayload(t, rr.Body, "RATE_LIMITED")
}

func TestDiscoveryServiceNotFoundReturnsStandardErrorPayload(t *testing.T) {
	service := newDiscoveryService()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/unknown", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusNotFound, rr.Code)

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

	require.Equal(t, http.StatusBadGateway, rr.Code)
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

	require.Equal(t, http.StatusBadGateway, rr.Code)
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

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []topPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "100", payload[0].PodcastItunesID)
	require.Equal(t, "Top Show", payload[0].Title)
	require.Len(t, payload[0].Genres, 0)
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

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []topPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "100", payload[0].PodcastItunesID)
	require.Equal(t, "Top Show", payload[0].Title)
}

func TestDiscoveryServiceTopEpisodesNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Equal(t, discoveryAppleChartsBaseURL+"/jp/podcasts/top/10/podcast-episodes.json", req.URL.String())
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

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []topEpisodeResponse
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "333", payload[0].PodcastItunesID)
	require.Len(t, payload[0].Genres, 2)
	require.Equal(t, "Technology", payload[0].Genres[0])
	require.Equal(t, "Podcast", payload[0].Genres[1])
	require.Equal(t, "https://example.com/episode-100.jpg", payload[0].Artwork)
	require.Equal(t, "The New York Times", payload[0].Author)
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

	require.Equal(t, http.StatusBadGateway, rr.Code)
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

	require.Equal(t, http.StatusBadGateway, rr.Code)
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

	require.Equal(t, http.StatusBadGateway, rr.Code)
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

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []topEpisodeResponse
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "333", payload[0].PodcastItunesID)
	require.Equal(t, "Top Episode", payload[0].Title)
	require.Len(t, payload[0].Genres, 0)
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

	require.Equal(t, http.StatusBadGateway, rr.Code)
}

func TestDiscoveryServiceLookupPodcastNormalizesPayloadAndNullMiss(t *testing.T) {
	t.Run("returns normalized podcast payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			require.Contains(t, req.URL.String(), "id=123")
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, `{"status":"true","feed":{"title":"Show 123","url":"https://example.com/feed.xml","lastUpdateTime":1613394044,"author":"Test Author","artwork":"https://example.com/artwork.jpg","description":"A test podcast","itunesId":123,"language":"en","episodeCount":50,"dead":0,"categories":{"1":"Technology"}}}`), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1")), nil
			default:
				t.Fatalf("unexpected lookup path = %q", req.URL.Path)
				return nil, nil
			}
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		require.NotEqual(t, float64(0), payload["lastUpdateTime"])
		if _, ok := payload["dead"]; ok {
			t.Fatalf("dead should be omitted, payload = %+v", payload)
		}
	})

	t.Run("returns null when upstream has no matching podcast", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(_ *http.Request) (*http.Response, error) {
			return jsonResponse(http.StatusOK, `{"status":"true","feed":{"id":0,"title":"","url":""}}`), nil
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadGateway, rr.Code)
	})
}

func TestDiscoveryServiceSearchPodcastsNormalizesPayload(t *testing.T) {
	defer func() {
		r := recover()
		require.Nil(t, r)
	}()
	var capturedURL string
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				capturedURL = req.URL.String()
				t.Logf("Mock transport received URL: %s", capturedURL)
				require.Contains(t, capturedURL, "term=tech")
				require.Contains(t, capturedURL, "limit=20")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=tech%20show&country=us&limit=20", nil)
	t.Logf("Request URL: %s", req.URL.String())
	service.ServeHTTP(rr, req)
	t.Logf("Response status: %d, body: %s", rr.Code, rr.Body.String())

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "Tech Show", payload[0]["title"])
	require.Equal(t, "2026-03-27T00:00:00Z", payload[0]["releaseDate"])
	require.Equal(t, float64(321), payload[0]["episodeCount"])
	if _, ok := payload[0]["feedUrl"]; ok {
		t.Fatalf("feedUrl should be absent, payload = %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchPodcastsFiltersIrrelevantFallbackResults(t *testing.T) {
	defer func() {
		r := recover()
		require.Nil(t, r)
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodGet,
		discoverySearchPodcastsRoute+"?term=the%20kevin%20spacey%20trial&country=us&limit=20",
		nil,
	)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "The Kevin Spacey Trial", payload[0]["title"])
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=show&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=tech&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=tech&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesNormalizesPayload(t *testing.T) {
	defer func() {
		r := recover()
		require.Nil(t, r)
	}()
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=History&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	if _, ok := payload[0]["id"]; ok {
		t.Fatalf("id should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["author"]; ok {
		t.Fatalf("author should be absent, payload = %+v", payload[0])
	}
	if _, ok := payload[0]["image"]; ok {
		t.Fatalf("image should be absent, payload = %+v", payload[0])
	}
	require.Equal(t, "History Episode", payload[0]["title"])
	require.Equal(t, "History Show", payload[0]["showTitle"])
	require.Equal(t, "https://example.com/history-600.jpg", payload[0]["artwork"])
	require.Equal(t, "https://example.com/history.mp3", payload[0]["audioUrl"])
	require.Equal(t, "123", payload[0]["podcastItunesId"])
	require.Equal(t, "abc123-def456", payload[0]["guid"])
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
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history%20episode&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutShortDescription(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history%20episode&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutReleaseDate(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutArtwork600(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithoutValidAudioURL(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesDropsRowsWithInvalidArtwork600URL(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 0)
}

func TestDiscoveryServiceSearchEpisodesDoesNotDependOnRemovedRawFields(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				require.Contains(t, req.URL.String(), "term=history")
				require.Contains(t, req.URL.String(), "entity=podcastEpisode")
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, func() time.Time { return time.Now() }),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=history&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []map[string]any
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "History Episode", payload[0]["title"])
	require.Equal(t, "History Show", payload[0]["showTitle"])
	require.Equal(t, "https://example.com/history.mp3", payload[0]["audioUrl"])
	require.Equal(t, "abc123-def456", payload[0]["guid"])
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

		require.Equal(t, http.StatusBadGateway, rr.Code)

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "UPSTREAM_REQUEST_FAILED", payload["code"])
	})

	t.Run("podcast byitunesid rejects zero-value feed payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			return jsonResponse(http.StatusOK, `{"status":"true","feed":{"title":"","url":""}}`), nil
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadGateway, rr.Code)
	})

	t.Run("podcast byitunesid returns null for dead feed", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			return jsonResponse(http.StatusOK, `{
				"status":"true",
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
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadGateway, rr.Code)
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

		require.Equal(t, http.StatusBadGateway, rr.Code)

		var payload map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "UPSTREAM_REQUEST_FAILED", payload["code"])
	})

	t.Run("batch byguid filters dead feeds", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"status":"true","feeds":[
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

		require.Equal(t, http.StatusOK, rr.Code)

		var resp []map[string]any
		decodeResponseJSON(t, rr.Body, &resp)
		require.Len(t, resp, 1)
		require.Equal(t, "456", resp[0]["podcastItunesId"])
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

		require.Equal(t, http.StatusBadRequest, rr.Code)

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "INVALID_GUID_BATCH", payload["code"])
	})

	t.Run("deduplicates duplicate GUIDs", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					require.Contains(t, req.URL.Path, "/podcasts/batch/byguid")
					var body []string
					err := json.NewDecoder(req.Body).Decode(&body)
					require.NoError(t, err)
					require.Len(t, body, 2)
					return jsonResponse(http.StatusOK, `{"status":"true","feeds":[]}`), nil
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

		require.Equal(t, http.StatusOK, rr.Code)
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
						return jsonResponse(http.StatusOK, `{"status":"true","feeds":[]}`), nil
					}
					return jsonResponse(http.StatusOK, `{"status":"true","feeds":[
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

		require.Equal(t, http.StatusOK, rr.Code)

		unique := make(map[string]bool)
		for _, g := range receivedGUIDs {
			unique[g] = true
		}
		require.Len(t, unique, len(receivedGUIDs))

		var resp []piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		require.Len(t, resp, 2)
	})

	t.Run("preserves input ordering in response", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"status":"true","feeds":[
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

		require.Equal(t, http.StatusOK, rr.Code)

		var resp []piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		require.Len(t, resp, 3)
		require.Equal(t, "Show C", resp[0].Title)
		require.Equal(t, "111", resp[0].PodcastItunesID)
		require.Equal(t, "Show A", resp[1].Title)
		require.Equal(t, "222", resp[1].PodcastItunesID)
		require.Equal(t, "Show B", resp[2].Title)
		require.Equal(t, "333", resp[2].PodcastItunesID)
	})
}

func TestPodcastIndexOptionalNumericFields(t *testing.T) {
	t.Run("podcast byitunesid preserves zero episodeCount when PI provides it", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, `{
					"status":"true",
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
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)

		var resp piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)

		require.Equal(t, int64(0), resp.EpisodeCount)
	})

	t.Run("podcast byitunesid rejects rows when required PI identity is missing", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			if req.URL.Path == "/api/1.0/episodes/byitunesid" {
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1")), nil
			}
			require.Equal(t, "/api/1.0/podcasts/byitunesid", req.URL.Path)
			return jsonResponse(http.StatusOK, `{
				"status":"true",
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
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadGateway, rr.Code)
	})

	t.Run("podcast byitunesid uses requested itunes id as canonical identity", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, `{
					"status":"true",
					"feed":{
						"title":"Test",
						"url":"https://example.com/feed.xml",
						"author":"Author",
						"artwork":"https://example.com/artwork.jpg",
						"description":"Description",
						"itunesId":123,
						"lastUpdateTime":1700000000,
						"episodeCount":10,
						"dead":0,
						"categories":{}
					}
				}`), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)

		var resp piPodcastResponse
		decodeResponseJSON(t, rr.Body, &resp)
		require.Equal(t, "123", resp.PodcastItunesID)
	})

}

func TestDiscoveryServiceRejectsInvalidParamsAndMapsUpstreamErrors(t *testing.T) {
	t.Run("rejects invalid country", func(t *testing.T) {
		service := newDiscoveryService()

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=USA", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadRequest, rr.Code)

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "INVALID_COUNTRY", payload["code"])
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusGatewayTimeout, rr.Code)

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "UPSTREAM_TIMEOUT", payload["code"])
	})

	t.Run("rejects empty search term", func(t *testing.T) {
		service := newDiscoveryService()

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=%20%20&country=us", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadRequest, rr.Code)

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "INVALID_TERM", payload["code"])
	})

}

func TestDiscoveryServiceUsesJSONErrorForUnknownEndpoints(t *testing.T) {
	service := newDiscoveryService()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryRoutePrefix+"missing", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusNotFound, rr.Code)
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

func decodeResponseJSON(t *testing.T, body interface{ String() string }, dest any) {
	t.Helper()
	err := json.Unmarshal([]byte(body.String()), dest)
	require.NoError(t, err)
}

func TestDecodeDiscoveryJSONRejectsOversizedBodies(t *testing.T) {
	var payload map[string]any
	err := decodeDiscoveryJSON(strings.NewReader(`{"a":"`+strings.Repeat("x", 32)+`"}`), 8, &payload)
	if !errors.Is(err, errDiscoveryTooLarge) {
		t.Fatalf("error = %v, want errDiscoveryTooLarge", err)
	}
}

func TestDecodeDiscoveryJSONRejectsTrailingData(t *testing.T) {
	var payload map[string]any
	err := decodeDiscoveryJSON(strings.NewReader(`{"results":[]} {"extra":true}`), 1024, &payload)
	if !errors.Is(err, errDiscoveryDecode) {
		t.Fatalf("error = %v, want errDiscoveryDecode", err)
	}
}

func TestNewDiscoveryServiceUsesDiscoveryAllowedOrigins(t *testing.T) {
	t.Setenv("READIO_PROXY_ALLOWED_ORIGINS", "https://proxy.example")
	t.Setenv(discoveryAllowedOriginsEnv, "https://discovery.example")

	service := newDiscoveryService()
	require.Len(t, service.allowedOrigins, 1)
	require.Equal(t, "https://discovery.example", service.allowedOrigins[0])
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
	require.ErrorAs(t, err, &statusErr)
	require.Equal(t, http.StatusBadGateway, statusErr.status)
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
	got := classifyDiscoveryError(err)
	require.Equal(t, "timeout", got)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		require.Equal(t, http.StatusOK, rr1.Code)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		require.Equal(t, http.StatusOK, rr2.Code)

		require.Equal(t, 1, upstreamCalls)
		require.Equal(t, rr2.Body.String(), rr1.Body.String())
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, upstreamCalls)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		require.Equal(t, http.StatusBadGateway, rr1.Code)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		require.Equal(t, http.StatusBadGateway, rr2.Code)

		require.Equal(t, 2, upstreamCalls)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
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
		require.Equal(t, http.StatusOK, rr1.Code)

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		require.Equal(t, http.StatusOK, rr2.Code)

		require.Equal(t, 2, upstreamCalls)

		var first, second []topPodcastResponse
		decodeResponseJSON(t, rr1.Body, &first)
		decodeResponseJSON(t, rr2.Body, &second)
		require.Len(t, first, 1)
		require.Len(t, second, 1)
		require.NotEqual(t, second[0].Title, first[0].Title)
	})

	t.Run("lookup podcast reuses fresh SQLite snapshot without upstream call", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		upstreamCalls := 0
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			upstreamCalls++
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("42")), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})

		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/42", nil)

		rr1 := httptest.NewRecorder()
		service.ServeHTTP(rr1, req)
		require.Equal(t, http.StatusOK, rr1.Code)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		require.Equal(t, http.StatusOK, rr2.Code)

		require.Equal(t, 2, upstreamCalls)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr := httptest.NewRecorder()
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)

		var items []topPodcastResponse
		decodeResponseJSON(t, rr.Body, &items)
		require.Len(t, items, 1)
		require.Equal(t, "Show", items[0].Title)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
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
		require.Equal(t, http.StatusOK, rr1.Code)

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		require.Equal(t, http.StatusOK, rr2.Code)

		require.Equal(t, 2, upstreamCalls)

		var items []topPodcastResponse
		decodeResponseJSON(t, rr2.Body, &items)
		require.Len(t, items, 1)
		require.Equal(t, "Stale Show", items[0].Title)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
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
		require.Equal(t, http.StatusOK, rr1.Code)

		time.Sleep(100 * time.Millisecond)

		rr2 := httptest.NewRecorder()
		service.ServeHTTP(rr2, req)
		require.Equal(t, http.StatusOK, rr2.Code)

		require.Equal(t, 2, upstreamCalls)

		var first, second []topPodcastResponse
		decodeResponseJSON(t, rr1.Body, &first)
		decodeResponseJSON(t, rr2.Body, &second)
		require.NotEqual(t, second[0].Title, first[0].Title)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
			podcastIndexConfig: podcastIndexConfig{
				apiKey:    "test-key",
				apiSecret: "test-secret",
				userAgent: "test-agent",
			},
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr := httptest.NewRecorder()
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, upstreamCalls)
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
			searchLimiter: httputil.NewRateLimiter(10, time.Second, time.Now),
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
		require.Equal(t, http.StatusOK, rr1.Code)

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

		require.Equal(t, 2, concurrentCalls)
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, time.Now),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	// Querying "bearbrook" (no space) should match "Bear Brook" (with space)
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=bearbrook&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []discoverySearchPodcastResponseItem
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "Bear Brook", payload[0].Title)
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, time.Now),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=show&country=us", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []discoverySearchPodcastResponseItem
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
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
		searchLimiter: httputil.NewRateLimiter(100, time.Minute, time.Now),
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=episode&country=us", nil)
	service.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var payload []discoverySearchEpisodeResponseItem
	decodeResponseJSON(t, rr.Body, &payload)

	require.Len(t, payload, 1)
	require.Equal(t, "https://example.com/audio.mp3", payload[0].AudioURL)
}

func TestDiscoveryServicePreflightCORS(t *testing.T) {
	service := &discoveryService{
		allowedOrigins: []string{"https://app.example"},
	}

	t.Run("allows configured origin", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, discoveryTopPodcastsRoute, nil)
		req.Header.Set("Origin", "https://app.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)
		req.Header.Set("Access-Control-Request-Headers", "content-type")

		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusNoContent, rr.Code)
		allowOrigin := rr.Header().Get("Access-Control-Allow-Origin")
		require.Equal(t, "https://app.example", allowOrigin)
		allowMethods := rr.Header().Get("Access-Control-Allow-Methods")
		require.Equal(t, "GET, POST, OPTIONS", allowMethods)
		allowHeaders := rr.Header().Get("Access-Control-Allow-Headers")
		require.Equal(t, "Content-Type, Accept, Authorization, traceparent", allowHeaders)
		maxAge := rr.Header().Get("Access-Control-Max-Age")
		require.Equal(t, "86400", maxAge)
		vary := rr.Header().Get("Vary")
		require.Equal(t, "Origin", vary)
		require.Equal(t, 0, rr.Body.Len())
	})

	t.Run("omits CORS headers for disallowed origin", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, discoveryTopPodcastsRoute, nil)
		req.Header.Set("Origin", "https://evil.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)

		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusNoContent, rr.Code)
		allowOrigin := rr.Header().Get("Access-Control-Allow-Origin")
		require.Equal(t, "", allowOrigin)
		allowMethods := rr.Header().Get("Access-Control-Allow-Methods")
		require.Equal(t, "", allowMethods)
	})
}

func TestDiscoveryServiceClientUsesInstrumentedTransport(t *testing.T) {
	handler := NewDiscoveryService()
	svc, ok := handler.(*discoveryService)
	require.True(t, ok)
	require.NotNil(t, svc.client)
	require.NotNil(t, svc.client.Transport)
	require.NotEqual(t, reflectTypeName(http.DefaultTransport), reflectTypeName(svc.client.Transport))
}

func reflectTypeName(v any) string {
	if v == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%T", v)
}
