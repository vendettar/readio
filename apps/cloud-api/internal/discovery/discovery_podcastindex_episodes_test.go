package discovery

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"readio-cloud/internal/httputil"
	"readio-cloud/internal/podcastindex"
)

func TestDiscoveryServicePodcastEpisodesPaginatedSQLiteContract(t *testing.T) {
	t.Run("fresh podcast detail route does not materialize full episode rows", func(t *testing.T) {
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
			t.Fatal("fresh cached podcast metadata read must not call PodcastIndex")
			return nil, nil
		})
		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2", "ep-3"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)
		if _, err := store.DB().ExecContext(
			t.Context(),
			"UPDATE podcast_episodes SET published_at_unix = ? WHERE podcast_itunes_id = ? AND episode_guid = ?",
			"not-an-integer",
			"123",
			"ep-3",
		); err != nil {
			t.Fatalf("poison episode row: %v", err)
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)

		var payload piPodcastResponse
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "123", payload.PodcastItunesID)
		require.Equal(t, "Fixture Show", payload.Title)
	})

	t.Run("fresh DB hit returns requested page without upstream fetch", func(t *testing.T) {
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
			t.Fatal("fresh cached route read must not call PodcastIndex")
			return nil, nil
		})
		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2", "ep-3"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		snapshot.Podcast.IsTruncated = true
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=2&offset=1", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)

		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, 2, payload.Limit)
		require.Equal(t, 1, payload.Offset)
		require.Equal(t, 3, payload.NextOffset)
		require.False(t, payload.HasMore)
		require.Equal(t, 3, payload.StoredTotal)
		require.True(t, payload.IsTruncated)
		require.Len(t, payload.Episodes, 2)
		require.Equal(t, "ep-2", payload.Episodes[0].GUID)
		require.Equal(t, "ep-3", payload.Episodes[1].GUID)
		require.NotEqual(t, int64(0), payload.LastSuccessfulFetchAt)
		require.NotEqual(t, int64(0), payload.NextRefreshAfter)
		assertResponseJSONNumberField(t, rr.Body.String(), "lastSuccessfulFetchAt")
		assertResponseJSONNumberField(t, rr.Body.String(), "nextRefreshAfter")
		assertResponseJSONNumberFieldInEpisode(t, rr.Body.String(), 0, "pubDate")
	})

	t.Run("fresh local page requests do not consume PodcastIndex limiter before cold refresh", func(t *testing.T) {
		upstreamCalls := 0
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			upstreamCalls++
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("456")), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("cold-ep-1")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})
		service.podcastIndexLimiter = httputil.NewRateLimiter(1, time.Hour, time.Now)
		service.podcastIndexLocalReadLimiter = httputil.NewRateLimiter(120, time.Hour, time.Now)

		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)

		for i := 0; i < 50; i++ {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=1&offset=0", nil)
			service.ServeHTTP(rr, req)
			require.Equal(t, http.StatusOK, rr.Code)
		}
		require.Equal(t, 0, upstreamCalls)

		coldRR := httptest.NewRecorder()
		coldReq := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/456/episodes?limit=1&offset=0", nil)
		service.ServeHTTP(coldRR, coldReq)
		require.Equal(t, http.StatusOK, coldRR.Code)
		require.Equal(t, 2, upstreamCalls)
	})

	t.Run("local page reads have separate abuse cap", func(t *testing.T) {
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
			t.Fatal("fresh cached route read must not call PodcastIndex")
			return nil, nil
		})
		service.podcastIndexLimiter = httputil.NewRateLimiter(100, time.Hour, time.Now)
		service.podcastIndexLocalReadLimiter = httputil.NewRateLimiter(2, time.Hour, time.Now)

		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)

		for i := 0; i < 2; i++ {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=1&offset=0", nil)
			service.ServeHTTP(rr, req)
			require.Equal(t, http.StatusOK, rr.Code)
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=1&offset=0", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusTooManyRequests, rr.Code)
	})

	t.Run("cached podcast detail preserves upstream feed lastUpdateTime", func(t *testing.T) {
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSONWithLastUpdate("123", 1712345678)), nil
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

		var payload piPodcastResponse
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, int64(1712345678), payload.LastUpdateTime)
	})

	t.Run("podcast detail cold refresh logs refreshed cache status", func(t *testing.T) {
		logs := captureDiscoveryTestLogs(t)
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("123")), nil
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
		require.Contains(t, logs.cacheStatuses(), CacheStatusRefreshed)
	})

	t.Run("podcast detail refresh limiter is scoped by effective client IP", func(t *testing.T) {
		upstreamCalls := 0
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			upstreamCalls++
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON(req.URL.Query().Get("id"))), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-"+req.URL.Query().Get("id"))), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})
		service.podcastIndexLimiter = httputil.NewRateLimiter(1, time.Hour, time.Now)

		firstRR := httptest.NewRecorder()
		firstReq := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		firstReq.RemoteAddr = "203.0.113.10:12345"
		service.ServeHTTP(firstRR, firstReq)
		require.Equal(t, http.StatusOK, firstRR.Code)

		secondRR := httptest.NewRecorder()
		secondReq := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/456", nil)
		secondReq.RemoteAddr = "203.0.113.11:12345"
		service.ServeHTTP(secondRR, secondReq)
		require.Equal(t, http.StatusOK, secondRR.Code)
		require.Equal(t, 4, upstreamCalls)
	})

	t.Run("podcast detail stale fallback logs stale fallback cache status", func(t *testing.T) {
		logs := captureDiscoveryTestLogs(t)
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("123")), nil
			case "/api/1.0/episodes/byitunesid":
				require.NotEmpty(t, req.URL.Query().Get("since"))
				require.Equal(t, "100", req.URL.Query().Get("max"))
				_, hasFulltext := req.URL.Query()["fulltext"]
				require.True(t, hasFulltext)
				return jsonResponse(http.StatusOK, `{"status":"ok","items":[]}`), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})
		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old-ep"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(-time.Hour).Unix()
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)
		require.Contains(t, logs.cacheStatuses(), CacheStatusStaleFallback)
	})

	t.Run("cold page miss refreshes and returns requested page", func(t *testing.T) {
		var upstreamPaths []string
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			upstreamPaths = append(upstreamPaths, req.URL.Path+"?"+req.URL.RawQuery)
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("123")), nil
			case "/api/1.0/episodes/byitunesid":
				_, hasFulltext := req.URL.Query()["fulltext"]
				require.True(t, hasFulltext)
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1", "ep-2", "ep-3")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=2&offset=1", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, 3, payload.StoredTotal)
		require.Len(t, payload.Episodes, 2)
		require.Equal(t, "ep-2", payload.Episodes[0].GUID)
		require.Equal(t, "ep-3", payload.Episodes[1].GUID)
		require.Len(t, upstreamPaths, 2)
	})

	t.Run("concurrent cold page misses share one PI refresh", func(t *testing.T) {
		var upstreamCalls atomic.Int64
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			upstreamCalls.Add(1)
			time.Sleep(50 * time.Millisecond)
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("123")), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1", "ep-2")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})

		var wg sync.WaitGroup
		for i := 0; i < 3; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				rr := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=1&offset=0", nil)
				service.ServeHTTP(rr, req)
				assert.Equal(t, http.StatusOK, rr.Code)
			}()
		}
		wg.Wait()

		got := upstreamCalls.Load()
		require.Equal(t, int64(2), got)
	})

	t.Run("repeated scrolling reads SQLite without repeated PI fetches", func(t *testing.T) {
		upstreamCalls := 0
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			upstreamCalls++
			switch req.URL.Path {
			case "/api/1.0/podcasts/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexPodcastFixtureJSON("123")), nil
			case "/api/1.0/episodes/byitunesid":
				return jsonResponse(http.StatusOK, podcastIndexEpisodesFixtureJSON("ep-1", "ep-2", "ep-3", "ep-4", "ep-5")), nil
			default:
				t.Fatalf("unexpected upstream path %q", req.URL.Path)
				return nil, nil
			}
		})

		detailRR := httptest.NewRecorder()
		detailReq := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123", nil)
		service.ServeHTTP(detailRR, detailReq)
		require.Equal(t, http.StatusOK, detailRR.Code)

		for _, target := range []string{
			discoveryPodcastsRoute + "/123/episodes?limit=2&offset=0",
			discoveryPodcastsRoute + "/123/episodes?limit=2&offset=2",
			discoveryPodcastsRoute + "/123/episodes?limit=2&offset=4",
		} {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, target, nil)
			service.ServeHTTP(rr, req)
			require.Equal(t, http.StatusOK, rr.Code)
		}

		require.Equal(t, 2, upstreamCalls)
	})

	t.Run("detail query resolves by podcastItunesId and episodeGuid from SQLite", func(t *testing.T) {
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
			t.Fatal("fresh cached detail read must not call PodcastIndex")
			return nil, nil
		})
		first := piEpisodeCacheSnapshotFixture("123", []string{"shared-guid"})
		first.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		first.Episodes[0].Title = "First podcast"
		err := store.ReplacePodcastSnapshotTx(t.Context(), first)
		require.NoError(t, err)
		second := piEpisodeCacheSnapshotFixture("456", []string{"shared-guid"})
		second.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		second.Episodes[0].Title = "Second podcast"
		err = store.ReplacePodcastSnapshotTx(t.Context(), second)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/456/episodes?episodeGuid=shared-guid", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		var payload piEpisodeResponse
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "Second podcast", payload.Title)
		assertResponseJSONNumberField(t, rr.Body.String(), "pubDate")
	})

	t.Run("episode detail cold miss returns not found without upstream refresh", func(t *testing.T) {
		service, _ := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			t.Fatalf("cold episode detail must not call PodcastIndex, got %q", req.URL.Path)
			return nil, nil
		})

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?episodeGuid=target-guid", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("missing detail returns episode not found without refresh", func(t *testing.T) {
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(req *http.Request) (*http.Response, error) {
			t.Fatalf("missing episode detail must not call PodcastIndex, got %q", req.URL.Path)
			return nil, nil
		})
		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"different-guid"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(-time.Hour).Unix()
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?episodeGuid=missing-guid", nil)
		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusNotFound, rr.Code)
		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "EPISODE_NOT_FOUND", payload["code"])
	})

	t.Run("validates and caps pagination params", func(t *testing.T) {
		service, store := newDiscoveryServiceWithPIEpisodeTestStore(t, func(*http.Request) (*http.Response, error) {
			t.Fatal("fresh cached page read must not call PodcastIndex")
			return nil, nil
		})
		snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
		snapshot.Podcast.RefreshNotBefore = time.Now().UTC().Add(time.Hour).Unix()
		err := store.ReplacePodcastSnapshotTx(t.Context(), snapshot)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=500&offset=5000", nil)
		service.ServeHTTP(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)
		var payload piPodcastEpisodesResponse
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, podcastIndexEpisodePageMax, payload.Limit)
		require.Equal(t, podcastIndexPageEpisodesMax, payload.Offset)

		badRR := httptest.NewRecorder()
		badReq := httptest.NewRequest(http.MethodGet, discoveryPodcastsRoute+"/123/episodes?limit=0", nil)
		service.ServeHTTP(badRR, badReq)
		require.Equal(t, http.StatusBadRequest, badRR.Code)
	})
}

func assertResponseJSONNumberField(t *testing.T, body string, field string) {
	t.Helper()

	var payload map[string]json.RawMessage
	err := json.Unmarshal([]byte(body), &payload)
	require.NoError(t, err)
	assertRawJSONNumber(t, payload[field], field)
}

func assertResponseJSONNumberFieldInEpisode(t *testing.T, body string, index int, field string) {
	t.Helper()

	var payload struct {
		Episodes []map[string]json.RawMessage `json:"episodes"`
	}
	err := json.Unmarshal([]byte(body), &payload)
	require.NoError(t, err)
	if index < 0 || index >= len(payload.Episodes) {
		t.Fatalf("episode index %d out of range for %d episodes", index, len(payload.Episodes))
	}
	assertRawJSONNumber(t, payload.Episodes[index][field], "episodes."+field)
}

func assertRawJSONNumber(t *testing.T, raw json.RawMessage, field string) {
	t.Helper()
	require.NotEmpty(t, raw)

	var number json.Number
	err := json.Unmarshal(raw, &number)
	require.NoError(t, err)
	_, err = number.Int64()
	require.NoError(t, err)
}

func newDiscoveryServiceWithPIEpisodeTestStore(t *testing.T, roundTrip func(*http.Request) (*http.Response, error)) (*discoveryService, *podcastindex.PIEpisodeCacheStore) {
	t.Helper()

	db := openPIEpisodeCacheTestDB(t)
	store := podcastindex.NewPIEpisodeCacheStore(db)
	service := &discoveryService{
		client: &http.Client{
			Transport: discoveryRoundTripper(roundTrip),
		},
		timeout:                      time.Second,
		userAgent:                    discoveryUserAgent,
		bodyLimit:                    discoveryBodyLimit,
		cache:                        newDiscoveryCache(8),
		podcastIndexLimiter:          httputil.NewRateLimiter(100, time.Second, time.Now),
		podcastIndexLocalReadLimiter: httputil.NewRateLimiter(120, time.Second, time.Now),
		piEpisodeCacheStore:          store,
		podcastIndexConfig: podcastIndexConfig{
			apiKey:    "test-key",
			apiSecret: "test-secret",
			userAgent: "test-agent",
		},
	}
	return service, store
}

func openPIEpisodeCacheTestDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	require.NoError(t, err)

	db.SetMaxIdleConns(1)
	db.SetMaxOpenConns(1)
	db.SetConnMaxIdleTime(time.Hour)

	if err := goose.SetDialect("sqlite"); err != nil {
		_ = db.Close()
		t.Fatalf("set dialect: %v", err)
	}

	if err := goose.UpContext(context.Background(), db, "../../migrations"); err != nil {
		_ = db.Close()
		t.Fatalf("apply migrations: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})
	return db
}

func piEpisodeCacheSnapshotFixture(podcastItunesID string, episodeGUIDs []string) podcastindex.PIEpisodeCacheSnapshot {
	now := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)
	podcast := podcastindex.PIEpisodeCachePodcastRecord{
		PIEpisodeCachePodcastMetadata: podcastindex.PIEpisodeCachePodcastMetadata{
			PodcastItunesID:        podcastItunesID,
			Title:                  "Fixture Show",
			Description:            "Fixture description",
			Author:                 "Fixture Author",
			Image:                  "https://example.com/show.jpg",
			FeedURL:                "https://example.com/feed.xml",
			Language:               "en",
			CategoriesJSON:         `["Technology"]`,
			EpisodeCountHint:       int64(len(episodeGUIDs)),
			FeedLastUpdateTimeUnix: now.Unix(),
			CreatedAtUnix:          now.Unix(),
			UpdatedAtUnix:          now.Unix(),
		},
		PIEpisodeCachePodcastState: podcastindex.PIEpisodeCachePodcastState{
			LastSuccessfulFetchAt: now.Unix(),
			LastAttemptedFetchAt:  now.Unix(),
			RefreshNotBefore:      now.Add(2 * time.Hour).Unix(),
			ApproxBytes:           2048,
			LastAccessedAt:        now.Unix(),
		},
	}

	episodes := make([]podcastindex.PIEpisodeCacheEpisode, 0, len(episodeGUIDs))
	for i, guid := range episodeGUIDs {
		published := now.Add(-time.Duration(i) * time.Hour)
		episodes = append(episodes, podcastindex.PIEpisodeCacheEpisode{
			PodcastItunesID: podcastItunesID,
			EpisodeGUID:     guid,
			Title:           "Episode " + guid,
			Description:     "Episode description " + guid,
			EnclosureURL:    "https://example.com/audio/" + guid + ".mp3",
			PublishedAtUnix: published.Unix(),
			DurationSeconds: 120,
			Image:           "https://example.com/episode.jpg",
			CreatedAtUnix:   published.Unix(),
			UpdatedAtUnix:   published.Unix(),
		})
	}

	return podcastindex.PIEpisodeCacheSnapshot{
		Podcast:  podcast,
		Episodes: episodes,
	}
}

func podcastIndexPodcastFixtureJSON(itunesID string) string {
	return podcastIndexPodcastFixtureJSONWithLastUpdate(itunesID, 1770000000)
}

func podcastIndexPodcastFixtureJSONWithLastUpdate(itunesID string, lastUpdateTime int64) string {
	return `{
		"status":"true",
		"feed":{
			"id":` + itunesID + `,
			"title":"Fixture Show",
			"url":"https://example.com/feed.xml",
			"description":"Fixture description",
			"author":"Fixture Author",
			"artwork":"https://example.com/show.jpg",
			"itunesId":` + itunesID + `,
			"lastUpdateTime":` + strconv.FormatInt(lastUpdateTime, 10) + `,
			"episodeCount":10,
			"categories":{"1":"Technology"},
			"language":"en"
		}
	}`
}

func podcastIndexEpisodesFixtureJSON(guids ...string) string {
	var b strings.Builder
	b.WriteString(`{"status":"true","items":[`)
	for i, guid := range guids {
		if i > 0 {
			b.WriteByte(',')
		}
		published := 1770000000 - int64(i*3600)
		b.WriteString(`{
			"id":`)
		b.WriteString(strconv.Itoa(i + 1))
		b.WriteString(`,
			"title":"Episode `)
		b.WriteString(guid)
		b.WriteString(`",
			"link":"https://example.com/episodes/`)
		b.WriteString(guid)
		b.WriteString(`",
			"description":"Episode description",
			"guid":"`)
		b.WriteString(guid)
		b.WriteString(`",
			"datePublished":`)
		b.WriteString(strconv.FormatInt(published, 10))
		b.WriteString(`,
			"enclosureUrl":"https://example.com/audio/`)
		b.WriteString(guid)
		b.WriteString(`.mp3",
			"enclosureLength":123,
			"duration":55,
			"explicit":0,
			"image":"https://example.com/episode.jpg"
		}`)
	}
	b.WriteString(`]}`)
	return b.String()
}

type discoveryTestLogHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func captureDiscoveryTestLogs(t *testing.T) *discoveryTestLogHandler {
	t.Helper()
	handler := &discoveryTestLogHandler{}
	previous := slog.Default()
	slog.SetDefault(slog.New(handler))
	t.Cleanup(func() {
		slog.SetDefault(previous)
	})
	return handler
}

func (h *discoveryTestLogHandler) Enabled(context.Context, slog.Level) bool {
	return true
}

func (h *discoveryTestLogHandler) Handle(_ context.Context, record slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = append(h.records, record.Clone())
	return nil
}

func (h *discoveryTestLogHandler) WithAttrs([]slog.Attr) slog.Handler {
	return h
}

func (h *discoveryTestLogHandler) WithGroup(string) slog.Handler {
	return h
}

func (h *discoveryTestLogHandler) cacheStatuses() []string {
	h.mu.Lock()
	defer h.mu.Unlock()

	statuses := make([]string, 0, len(h.records))
	for _, record := range h.records {
		record.Attrs(func(attr slog.Attr) bool {
			if attr.Key == "cache_status" {
				statuses = append(statuses, attr.Value.String())
			}
			return true
		})
	}
	return statuses
}
