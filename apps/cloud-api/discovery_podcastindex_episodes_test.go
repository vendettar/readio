package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDiscoveryServicePodcastEpisodesByItunesID(t *testing.T) {
	t.Run("returns normalized podcast episode payload", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					if req.URL.Path != "/api/1.0/episodes/byitunesid" {
						t.Fatalf("unexpected path = %q", req.URL.Path)
					}
					if got := req.URL.Query().Get("id"); got != "123" {
						t.Fatalf("id = %q, want 123", got)
					}
					if got := req.URL.Query().Get("max"); got != "1000" {
						t.Fatalf("max = %q, want 1000", got)
					}

					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":16795088,
								"title":"Episode One",
								"link":"https://example.com/episodes/1",
								"description":"Plain episode description",
								"guid":"episode-guid-1",
								"datePublished":1546399813,
								"datePublishedPretty":"January 01, 2019 9:30pm",
								"dateCrawled":1598369047,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":26385472,
								"duration":54,
								"explicit":1,
								"episode":19,
								"episodeType":"full",
								"season":3,
								"image":"https://example.com/episode-1.jpg",
								"feedItunesId":123,
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedDuplicateOf":75075,
								"transcriptUrl":"https://example.com/transcript.srt"
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		if len(payload.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(payload.Episodes))
		}

		episode := payload.Episodes[0]
		if episode.GUID != "episode-guid-1" {
			t.Fatalf("guid = %q", episode.GUID)
		}
		if episode.PubDate != "2019-01-02T03:30:13Z" {
			t.Fatalf("pubDate = %q", episode.PubDate)
		}
		if episode.Duration != 54 {
			t.Fatalf("duration = %d, want 54", episode.Duration)
		}
		if episode.FileSize != 26385472 {
			t.Fatalf("fileSize = %d, want 26385472", episode.FileSize)
		}
		if !episode.Explicit {
			t.Fatalf("explicit = false, want true")
		}
		if episode.ArtworkURL != "https://example.com/episode-1.jpg" {
			t.Fatalf("artworkUrl = %q", episode.ArtworkURL)
		}
		if episode.SeasonNumber == nil || *episode.SeasonNumber != 3 {
			t.Fatalf("seasonNumber = %#v, want 3", episode.SeasonNumber)
		}
		if episode.EpisodeNumber == nil || *episode.EpisodeNumber != 19 {
			t.Fatalf("episodeNumber = %#v, want 19", episode.EpisodeNumber)
		}
		if episode.EpisodeType != "full" {
			t.Fatalf("episodeType = %q, want full", episode.EpisodeType)
		}
		if episode.TranscriptURL != "https://example.com/transcript.srt" {
			t.Fatalf("transcriptUrl = %q", episode.TranscriptURL)
		}
	})

	t.Run("drops rows when PI enclosureLength is missing", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":16795088,
								"title":"Episode Without File Size",
								"link":"https://example.com/episodes/1",
								"description":"Plain episode description",
								"guid":"episode-guid-no-filesize",
								"datePublished":1546399813,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"duration":54,
								"explicit":0,
								"image":"https://example.com/episode-1.jpg",
								"feedItunesId":123,
								"feedImage":"https://example.com/feed.jpg"
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload map[string][]map[string]any
		decodeResponseJSON(t, rr.Body, &payload)
		if len(payload["episodes"]) != 0 {
			t.Fatalf("episodes length = %d, want 0", len(payload["episodes"]))
		}
	})

	t.Run("invalid itunesId returns bad request", func(t *testing.T) {
		service := &discoveryService{cache: newDiscoveryCache(0)}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/abc/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "INVALID_ITUNES_ID" {
			t.Fatalf("code = %q, want INVALID_ITUNES_ID", payload["code"])
		}
	})

	t.Run("deduplicates duplicate guid values and keeps the first mapped episode", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":1,
								"title":"First Title",
								"link":"https://example.com/episodes/1",
								"description":"desc",
								"guid":"duplicate-guid",
								"datePublished":1546399813,
								"datePublishedPretty":"January 01, 2019 9:30pm",
								"dateCrawled":1598369047,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":26385472,
								"duration":54,
								"explicit":1,
								"image":"https://example.com/episode-1.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123
							},
							{
								"id":2,
								"title":"Second Title",
								"link":"https://example.com/episodes/2",
								"description":"desc-2",
								"guid":"duplicate-guid",
								"datePublished":1546399814,
								"datePublishedPretty":"January 01, 2019 9:31pm",
								"dateCrawled":1598369048,
								"enclosureUrl":"https://example.com/audio-2.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":123,
								"duration":55,
								"explicit":0,
								"image":"https://example.com/episode-2.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		if len(payload.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(payload.Episodes))
		}
		if payload.Episodes[0].GUID != "duplicate-guid" {
			t.Fatalf("guid = %q, want duplicate-guid", payload.Episodes[0].GUID)
		}
		if payload.Episodes[0].Title != "First Title" {
			t.Fatalf("title = %q, want first duplicate winner", payload.Episodes[0].Title)
		}
	})

	t.Run("drops rows when no valid artwork url can be produced", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":1,
								"title":"Invalid Episode Artwork",
								"link":"https://example.com/episodes/1",
								"description":"desc",
								"guid":"invalid-artwork-guid",
								"datePublished":1546399813,
								"dateCrawled":1598369047,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":111,
								"duration":54,
								"explicit":1,
								"image":"javascript:alert(1)",
								"feedImage":"not-a-url",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123
							},
							{
								"id":2,
								"title":"Missing Artwork",
								"link":"https://example.com/episodes/2",
								"description":"desc",
								"guid":"missing-artwork-guid",
								"datePublished":1546399814,
								"dateCrawled":1598369048,
								"enclosureUrl":"https://example.com/audio-2.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":222,
								"duration":55,
								"explicit":0,
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123
							},
							{
								"id":3,
								"title":"Fallback Feed Artwork",
								"link":"https://example.com/episodes/3",
								"description":"desc",
								"guid":"fallback-artwork-guid",
								"datePublished":1546399815,
								"dateCrawled":1598369049,
								"enclosureUrl":"https://example.com/audio-3.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":333,
								"duration":56,
								"explicit":0,
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		if len(payload.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(payload.Episodes))
		}
		if payload.Episodes[0].GUID != "fallback-artwork-guid" {
			t.Fatalf("guid = %q, want fallback-artwork-guid", payload.Episodes[0].GUID)
		}
		if payload.Episodes[0].ArtworkURL != "https://example.com/feed.jpg" {
			t.Fatalf("artworkUrl = %q, want https://example.com/feed.jpg", payload.Episodes[0].ArtworkURL)
		}
	})

	t.Run("skips mismatched feedItunesId and strips invalid transcript urls", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":1,
								"title":"Wrong Show",
								"link":"https://example.com/episodes/wrong",
								"description":"desc",
								"guid":"wrong-show-guid",
								"datePublished":1546399813,
								"datePublishedPretty":"January 01, 2019 9:30pm",
								"dateCrawled":1598369047,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":26385472,
								"duration":54,
								"explicit":1,
								"image":"https://example.com/episode-1.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":999
							},
							{
								"id":2,
								"title":"Allowed Episode",
								"link":"https://example.com/episodes/allowed",
								"description":"desc-2",
								"guid":"allowed-guid",
								"datePublished":1546399814,
								"datePublishedPretty":"January 01, 2019 9:31pm",
								"dateCrawled":1598369048,
								"enclosureUrl":"https://example.com/audio-2.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":123,
								"duration":55,
								"explicit":0,
								"image":"https://example.com/episode-2.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123,
								"transcriptUrl":"javascript:alert(1)"
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		if len(payload.Episodes) != 1 {
			t.Fatalf("episodes length = %d, want 1", len(payload.Episodes))
		}
		if payload.Episodes[0].GUID != "allowed-guid" {
			t.Fatalf("guid = %q, want allowed-guid", payload.Episodes[0].GUID)
		}
		if payload.Episodes[0].TranscriptURL != "" {
			t.Fatalf("transcriptUrl = %q, want stripped invalid url", payload.Episodes[0].TranscriptURL)
		}
	})

	t.Run("fails closed when any episode has an invalid canonical audio url", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":1,
								"title":"Valid Episode",
								"link":"https://example.com/episodes/1",
								"description":"desc",
								"guid":"valid-guid",
								"datePublished":1546399813,
								"dateCrawled":1598369047,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"enclosureLength":111,
								"duration":54,
								"explicit":1,
								"image":"https://example.com/episode-1.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedItunesId":123
							},
							{
								"id":2,
								"title":"Invalid Audio URL",
								"link":"https://example.com/episodes/2",
								"description":"desc",
								"guid":"invalid-audio-guid",
								"datePublished":1546399814,
								"dateCrawled":1598369048,
								"enclosureUrl":"ftp://example.com/audio-2.mp3",
								"enclosureLength":222,
								"duration":55,
								"explicit":0,
								"image":"https://example.com/episode-2.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedItunesId":123
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_INVALID_RESPONSE" {
			t.Fatalf("code = %q, want UPSTREAM_INVALID_RESPONSE", payload["code"])
		}
	})

	t.Run("does not cache oversized episode lists", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		transportCalls := 0
		largeDescription := strings.Repeat("x", podcastIndexArchiveCacheMax+512)
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					transportCalls++
					return jsonResponse(http.StatusOK, `{
						"status":"true",
						"items":[
							{
								"id":1,
								"title":"Large Episode",
								"link":"https://example.com/episodes/1",
								"description":"`+largeDescription+`",
								"guid":"large-guid",
								"datePublished":1546399813,
								"datePublishedPretty":"January 01, 2019 9:30pm",
								"dateCrawled":1598369047,
								"enclosureUrl":"https://example.com/audio-1.mp3",
								"enclosureType":"audio/mp3",
								"enclosureLength":26385472,
								"duration":54,
								"explicit":1,
								"image":"https://example.com/episode-1.jpg",
								"feedImage":"https://example.com/feed.jpg",
								"feedId":75075,
								"feedLanguage":"en-us",
								"feedDead":0,
								"feedItunesId":123
							}
						]
					}`), nil
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(8),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		for i := 0; i < 2; i++ {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
			service.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
			}
		}

		if transportCalls != 2 {
			t.Fatalf("transportCalls = %d, want 2", transportCalls)
		}
	})

	t.Run("upstream failure maps to bad gateway", func(t *testing.T) {
		t.Setenv(podcastIndexAPIKeyEnv, "test-key")
		t.Setenv(podcastIndexAPISecretEnv, "test-secret")
		t.Setenv(podcastIndexUserAgentEnv, "readio-test")

		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return nil, errors.New("podcastindex upstream failed")
				}),
			},
			timeout:            time.Second,
			userAgent:          discoveryUserAgent,
			bodyLimit:          discoveryBodyLimit,
			cache:              newDiscoveryCache(0),
			podcastIndexConfig: podcastIndexConfig{apiKey: "test-key", apiSecret: "test-secret", userAgent: "test"},
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["code"] != "UPSTREAM_REQUEST_FAILED" {
			t.Fatalf("code = %q, want UPSTREAM_REQUEST_FAILED", payload["code"])
		}
	})
}
