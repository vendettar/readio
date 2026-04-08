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
								"url": "https://podcasts.apple.com/top-show",
								"genres": [
									{"genreId": "1301", "name": "Arts", "url": "https://example.com/arts"}
								]
							}
						]
					}
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []discoveryPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].ID != "100" || payload[0].Name != "Top Show" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
	if len(payload[0].Genres) != 1 || payload[0].Genres[0].GenreID != "1301" {
		t.Fatalf("genres = %+v", payload[0].Genres)
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
								"id": "episode-1",
								"name": "Top Episode",
								"artistName": "JP Host",
								"artworkUrl100": "https://example.com/episode-100.jpg",
								"url": "https://podcasts.apple.com/top-episode",
								"collectionId": 333,
								"description": "summary",
								"releaseDate": "2026-03-27T00:00:00Z",
								"duration": 1800
							}
						]
					}
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryTopEpisodesRoute+"?country=jp&limit=10", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []discoveryPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].ProviderPodcastID != "333" {
		t.Fatalf("providerPodcastId = %q, want 333", payload[0].ProviderPodcastID)
	}
	if payload[0].Duration == nil || *payload[0].Duration != 1800 {
		t.Fatalf("duration = %+v, want 1800", payload[0].Duration)
	}
}

func TestDiscoveryServiceLookupPodcastNormalizesPayloadAndNullMiss(t *testing.T) {
	t.Run("returns normalized podcast payload", func(t *testing.T) {
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
					if !strings.Contains(req.URL.String(), "id=123") || !strings.Contains(req.URL.String(), "country=us") {
						t.Fatalf("unexpected lookup url = %q", req.URL.String())
					}
					return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"wrapperType": "collection",
								"kind": "podcast",
								"collectionId": 123,
								"collectionName": "Show 123",
								"artistName": "Author",
								"artworkUrl100": "https://example.com/show-100.jpg",
								"artworkUrl600": "https://example.com/show-600.jpg",
								"feedUrl": "https://example.com/feed.xml",
								"collectionViewUrl": "https://podcasts.apple.com/show-123",
								"artistId": 456,
								"primaryGenreName": "Technology",
								"genres": ["Technology"],
								"trackCount": 42
							}
						]
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(discoveryCacheMaxKeys),
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryLookupPodcastRoute+"?id=123&country=us", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var payload podcastLookupResponse
		decodeResponseJSON(t, rr.Body, &payload)

		if payload.ProviderPodcastID == nil || *payload.ProviderPodcastID != 123 {
			t.Fatalf("providerPodcastId = %+v, want 123", payload.ProviderPodcastID)
		}
		if payload.CollectionName != "Show 123" || payload.TrackCount == nil || *payload.TrackCount != 42 {
			t.Fatalf("unexpected payload: %+v", payload)
		}
	})

	t.Run("returns null when upstream has no matching podcast", func(t *testing.T) {
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					return jsonResponse(http.StatusOK, `{"results":[]}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(discoveryCacheMaxKeys),
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryLookupPodcastRoute+"?id=123&country=us", nil)
		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if strings.TrimSpace(rr.Body.String()) != "null" {
			t.Fatalf("body = %q, want null", rr.Body.String())
		}
	})
}

func TestDiscoveryServiceLookupPodcastsByIDsPreservesRequestedOrder(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if req.URL.Query().Get("id") != "123,456" {
					t.Fatalf("lookup id query = %q, want %q", req.URL.Query().Get("id"), "123,456")
				}
				if req.URL.Query().Get("country") != "jp" {
					t.Fatalf("country = %q, want jp", req.URL.Query().Get("country"))
				}
				if req.URL.Query().Get("entity") != "podcast" {
					t.Fatalf("entity = %q, want podcast", req.URL.Query().Get("entity"))
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"wrapperType": "track",
							"kind": "podcast",
							"collectionId": 456,
							"collectionName": "Second Show",
							"artistName": "Second Host",
							"artworkUrl100": "https://example.com/second-100.jpg",
							"collectionViewUrl": "https://podcasts.apple.com/second",
							"feedUrl": "https://example.com/second.xml",
							"genres": ["Technology"]
						},
						{
							"wrapperType": "collection",
							"kind": "podcast",
							"collectionId": 123,
							"collectionName": "First Show",
							"artistName": "First Host",
							"artworkUrl100": "https://example.com/first-100.jpg",
							"collectionViewUrl": "https://podcasts.apple.com/first",
							"feedUrl": "https://example.com/first.xml",
							"genres": ["News"]
						},
						{
							"wrapperType": "collection",
							"kind": "podcast",
							"collectionId": 999,
							"collectionName": "Ignored Show",
							"artistName": "Ignored Host",
							"artworkUrl100": "https://example.com/ignored-100.jpg",
							"collectionViewUrl": "https://podcasts.apple.com/ignored",
							"feedUrl": "https://example.com/ignored.xml",
							"genres": ["Ignored"]
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryLookupPodcastsRoute+"?ids=123,456&country=jp", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []discoveryPodcastResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 2 {
		t.Fatalf("payload length = %d, want 2", len(payload))
	}
	if payload[0].ID != "123" || payload[1].ID != "456" {
		t.Fatalf("payload order = [%s, %s], want [123, 456]", payload[0].ID, payload[1].ID)
	}
	if payload[0].Name != "First Show" || payload[1].Name != "Second Show" {
		t.Fatalf("unexpected names: %+v", payload)
	}
	if payload[0].ProviderPodcastID != "123" || payload[1].ProviderPodcastID != "456" {
		t.Fatalf("providerPodcastIds = [%s, %s], want [123, 456]", payload[0].ProviderPodcastID, payload[1].ProviderPodcastID)
	}
}

func TestDiscoveryServiceLookupPodcastEpisodesNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "limit=300") {
					t.Fatalf("unexpected lookup url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{"wrapperType":"collection","collectionId":123},
						{
							"wrapperType":"podcastEpisode",
							"trackId": 999,
							"episodeGuid":"guid-999",
							"trackName":"Episode 999",
							"collectionName":"Show 123",
							"artistName":"Author",
							"episodeUrl":"https://example.com/audio.mp3",
							"releaseDate":"2026-03-27T00:00:00Z",
							"trackTimeMillis": 210000,
							"artworkUrl600":"https://example.com/ep-600.jpg",
							"description":"detail",
							"feedUrl":"https://example.com/feed.xml"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoveryLookupPodcastEpisodesRoute+"?id=123&country=us&limit=300", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []episodeLookupResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].ID != "guid-999" || payload[0].ProviderEpisodeID != "999" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
	if payload[0].Duration == nil || *payload[0].Duration != 210 {
		t.Fatalf("duration = %+v, want 210", payload[0].Duration)
	}
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
	if payload.Episodes[0].ChaptersURL != "https://example.com/chapters.json" {
		t.Fatalf("chaptersUrl = %q", payload.Episodes[0].ChaptersURL)
	}
}

func TestDiscoveryServiceSearchPodcastsNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "term=tech") || !strings.Contains(req.URL.String(), "limit=20") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"kind": "podcast",
							"collectionId": 123,
							"collectionName": "Tech Show",
							"artistName": "Host",
							"artworkUrl100": "https://example.com/tech-100.jpg",
							"artworkUrl600": "https://example.com/tech-600.jpg",
							"feedUrl": "https://example.com/tech.xml",
							"collectionViewUrl": "https://podcasts.apple.com/tech-show",
							"artistId": 456,
							"primaryGenreName": "Technology",
							"genres": ["Technology"],
							"trackCount": 100
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?term=Tech&country=us&limit=20", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []podcastLookupResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].CollectionName != "Tech Show" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchPodcastsFiltersIrrelevantFallbackResults(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"kind": "podcast",
							"collectionId": 1,
							"collectionName": "Fan Controlled TV",
							"artistName": "Irrelevant Host",
							"collectionViewUrl": "https://podcasts.apple.com/fan-controlled-tv"
						},
						{
							"kind": "podcast",
							"collectionId": 2,
							"collectionName": "The Kevin Spacey Trial",
							"artistName": "Relevant Host",
							"collectionViewUrl": "https://podcasts.apple.com/kevin-spacey-trial"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
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

	var payload []podcastLookupResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].CollectionName != "The Kevin Spacey Trial" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchEpisodesNormalizesPayload(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(req *http.Request) (*http.Response, error) {
				if !strings.Contains(req.URL.String(), "entity=podcastEpisode") || !strings.Contains(req.URL.String(), "term=history") {
					t.Fatalf("unexpected search url = %q", req.URL.String())
				}
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"wrapperType": "podcastEpisode",
							"trackId": 999,
							"collectionId": 123,
							"trackName": "History Episode",
							"collectionName": "History Show",
							"artistName": "Historian",
							"episodeUrl": "https://example.com/history.mp3",
							"releaseDate": "2026-03-27T00:00:00Z",
							"trackTimeMillis": 1800000,
							"artworkUrl160": "https://example.com/history-160.jpg",
							"artworkUrl600": "https://example.com/history-600.jpg",
							"description": "episode summary",
							"shortDescription": "short summary",
							"episodeGuid": "guid-history",
							"feedUrl": "https://example.com/history.xml"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, discoverySearchEpisodesRoute+"?term=History&country=us&limit=50", nil)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []searchEpisodeResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].TrackName != "History Episode" || payload[0].ProviderEpisodeID == nil || *payload[0].ProviderEpisodeID != 999 {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
}

func TestDiscoveryServiceSearchEpisodesFiltersIrrelevantFallbackResults(t *testing.T) {
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
				return jsonResponse(http.StatusOK, `{
					"results": [
						{
							"wrapperType": "podcastEpisode",
							"trackId": 1,
							"collectionId": 10,
							"trackName": "Popular Fallback Episode",
							"collectionName": "Fan Controlled TV",
							"artistName": "Irrelevant Host",
							"episodeUrl": "https://example.com/fallback.mp3",
							"releaseDate": "2026-03-27T00:00:00Z"
						},
						{
							"wrapperType": "podcastEpisode",
							"trackId": 2,
							"collectionId": 11,
							"trackName": "The Kevin Spacey Trial Part 1",
							"collectionName": "Court Files",
							"artistName": "Relevant Host",
							"episodeUrl": "https://example.com/relevant.mp3",
							"releaseDate": "2026-03-27T00:00:00Z"
						}
					]
				}`), nil
			}),
		},
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodGet,
		discoverySearchEpisodesRoute+"?term=the%20kevin%20spacey%20trial&country=us&limit=50",
		nil,
	)
	service.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var payload []searchEpisodeResponse
	decodeResponseJSON(t, rr.Body, &payload)

	if len(payload) != 1 {
		t.Fatalf("payload length = %d, want 1", len(payload))
	}
	if payload[0].TrackName != "The Kevin Spacey Trial Part 1" {
		t.Fatalf("unexpected payload: %+v", payload[0])
	}
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
			timeout:       20 * time.Millisecond,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(discoveryCacheMaxKeys),
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
		result, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeed error = %v", err)
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
		result, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeed error = %v", err)
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
		result, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeed error = %v", err)
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
		result, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeed error = %v", err)
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
		result, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeed error = %v", err)
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
		result, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeed error = %v", err)
		}
		if len(result.Episodes) != 0 {
			t.Fatalf("episodes length = %d, want 0 (enclosure missing url should be skipped)", len(result.Episodes))
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
		_, err := decodeDiscoveryFeed(body, discoveryBodyLimit)
		if err == nil {
			t.Fatalf("decodeDiscoveryFeed should return error for whitespace-only title")
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
		timeout:       time.Second,
		rssBaseURL:    discoveryRSSBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		cache:         newDiscoveryCache(discoveryCacheMaxKeys),
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
								{"id": "100", "name": "Cached Show", "url": "https://example.com/show"}
							]
						}
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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
								{"id": "1", "name": "Show", "url": "https://example.com/1"}
							]
						}
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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
								{"id": "1", "name": %q, "url": "https://example.com/1"}
							]
						}
					}`, name)), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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

		var first, second []discoveryPodcastResponse
		decodeResponseJSON(t, rr1.Body, &first)
		decodeResponseJSON(t, rr2.Body, &second)
		if len(first) != 1 || len(second) != 1 {
			t.Fatalf("unexpected payload lengths: %d, %d", len(first), len(second))
		}
		if first[0].Name == second[0].Name {
			t.Fatalf("expected different names after TTL expiry, got %q both times", first[0].Name)
		}
	})

	t.Run("lookup podcast is cached", func(t *testing.T) {
		upstreamCalls := 0
		service := &discoveryService{
			client: &http.Client{
				Transport: discoveryRoundTripper(func(_ *http.Request) (*http.Response, error) {
					upstreamCalls++
					return jsonResponse(http.StatusOK, `{
						"results": [
							{
								"wrapperType": "collection",
								"kind": "podcast",
								"collectionId": 42,
								"collectionName": "Cached Lookup",
								"collectionViewUrl": "https://podcasts.apple.com/show-42"
							}
						]
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
		}

		req := httptest.NewRequest(http.MethodGet, discoveryLookupPodcastRoute+"?id=42&country=us", nil)

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
								{"id": "1", "name": "Show", "url": "https://example.com/1"}
							]
						}
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
		}

		req := httptest.NewRequest(http.MethodGet, discoveryTopPodcastsRoute+"?country=us&limit=25", nil)

		rr := httptest.NewRecorder()
		service.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}

		var items []discoveryPodcastResponse
		decodeResponseJSON(t, rr.Body, &items)
		if len(items) != 1 || items[0].Name != "Show" {
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
									{"id": "1", "name": "Stale Show", "url": "https://example.com/1"}
								]
							}
						}`), nil
					}
					return nil, errors.New("upstream failed")
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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

		var items []discoveryPodcastResponse
		decodeResponseJSON(t, rr2.Body, &items)
		if len(items) != 1 || items[0].Name != "Stale Show" {
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
								{"id": "1", "name": %q, "url": "https://example.com/1"}
							]
						}
					}`, name)), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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

		var first, second []discoveryPodcastResponse
		decodeResponseJSON(t, rr1.Body, &first)
		decodeResponseJSON(t, rr2.Body, &second)
		if first[0].Name == second[0].Name {
			t.Fatalf("expected fresh data after refresh, got same data")
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
								{"id": "1", "name": "New Show", "url": "https://example.com/1"}
							]
						}
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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
								{"id": "1", "name": "Show", "url": "https://example.com/1"}
							]
						}
					}`), nil
				}),
			},
			timeout:       time.Second,
			rssBaseURL:    discoveryRSSBaseURL,
			lookupBaseURL: discoveryLookupBaseURL,
			userAgent:     discoveryUserAgent,
			bodyLimit:     discoveryBodyLimit,
			cache:         newDiscoveryCache(256),
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
