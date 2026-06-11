package podcastindex

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/stretchr/testify/require"
	"io"
	"net/http"
	"reflect"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type rateLimiter struct {
	limit int
}

func newRateLimiter(limit int, window time.Duration, now func() time.Time) *rateLimiter {
	return &rateLimiter{limit: limit}
}

type mockPIRefreshTestDiscoveryClient struct {
	rt                  func(req *http.Request) (*http.Response, error)
	podcastIndexLimiter *rateLimiter
	allowReqCalled      bool
}

func (c *mockPIRefreshTestDiscoveryClient) allowPodcastIndexRequest(remoteAddr string) bool {
	if c.podcastIndexLimiter != nil {
		if !c.allowReqCalled {
			c.allowReqCalled = true
			return true
		}
		return false
	}
	return true
}

func (c *mockPIRefreshTestDiscoveryClient) AllowPodcastIndexRequest(remoteAddr string) bool {
	return c.allowPodcastIndexRequest(remoteAddr)
}

func (c *mockPIRefreshTestDiscoveryClient) FetchPodcastIndexPodcastByItunesID(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.podcastindex.org/api/1.0/podcasts/byitunesid?id="+itunesID, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.rt(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var r struct {
		Status string                   `json:"status"`
		Feed   *PodcastIndexPodcastFeed `json:"feed"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	if r.Status != "true" {
		return nil, &PodcastIndexInvalidResponseError{Message: fmt.Sprintf("podcastindex podcast status = %q", r.Status)}
	}
	return r.Feed, nil
}

func (c *mockPIRefreshTestDiscoveryClient) FetchPodcastIndexEpisodesByItunesID(ctx context.Context, itunesID string, maxEpisodes int) ([]PodcastIndexEpisodeItem, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("https://api.podcastindex.org/api/1.0/episodes/byitunesid?id=%s&max=%d&fulltext", itunesID, maxEpisodes), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.rt(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var r struct {
		Status string                    `json:"status"`
		Items  []PodcastIndexEpisodeItem `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	if r.Status != "true" {
		return nil, &PodcastIndexInvalidResponseError{Message: fmt.Sprintf("podcastindex episodes status = %q", r.Status)}
	}
	return r.Items, nil
}

func (c *mockPIRefreshTestDiscoveryClient) FetchPodcastIndexEpisodesByItunesIDSince(ctx context.Context, itunesID string, sinceUnix int64) ([]PodcastIndexEpisodeItem, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("https://api.podcastindex.org/api/1.0/episodes/byitunesid?id=%s&since=%d&max=100&fulltext", itunesID, sinceUnix), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.rt(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var r struct {
		Status string                    `json:"status"`
		Items  []PodcastIndexEpisodeItem `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	if r.Status != "true" {
		return nil, &PodcastIndexInvalidResponseError{Message: fmt.Sprintf("podcastindex episodes status = %q", r.Status)}
	}
	return r.Items, nil
}

func newPIRefreshTestDiscoveryService(t *testing.T, rt func(req *http.Request) (*http.Response, error)) *mockPIRefreshTestDiscoveryClient {
	t.Helper()
	return &mockPIRefreshTestDiscoveryClient{rt: rt}
}

func jsonResponse(statusCode int, body string) *http.Response {
	return &http.Response{
		StatusCode: statusCode,
		Body:       io.NopCloser(bytes.NewBufferString(body)),
		Header:     make(http.Header),
	}
}

func TestPIEpisodeRefreshServiceFreshSnapshotHitsSQLiteWithoutUpstream(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 8, 30, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	snapshot.Podcast.RefreshNotBefore = now.Add(time.Hour).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, &mockPodcastIndexClient{
		fetchPodcastFunc: func(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
			t.Fatal("fresh snapshot must not call PodcastIndex")
			return nil, errors.New("unexpected upstream call")
		},
	})
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomeCacheHit, result.Outcome)
	require.Equal(t, CacheStatusFreshHit, result.CacheStatus)
	require.NotNil(t, result.Snapshot)
	require.Len(t, result.Snapshot.Episodes, 1)
}

func TestPIEpisodeRefreshServiceColdMissUsesMax1000AndPersistsSnapshotWithoutTraceparent(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)

	seenPodcast := false
	seenEpisodes := false
	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		assertNoTraceparentHeaders(t, req)
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			seenPodcast = true
			got := req.URL.Query().Get("id")
			require.Equal(t, "123", got)
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 1)), nil
		case "/api/1.0/episodes/byitunesid":
			seenEpisodes = true
			_, hasFulltext := req.URL.Query()["fulltext"]
			require.True(t, hasFulltext)
			gotID := req.URL.Query().Get("id")
			require.Equal(t, "123", gotID)
			gotMax := req.URL.Query().Get("max")
			require.Equal(t, "1000", gotMax)
			gotSince := req.URL.Query().Get("since")
			require.Equal(t, "", gotSince)
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("cold-guid", 2000),
			)), nil
		default:
			t.Fatalf("unexpected upstream path = %q", req.URL.Path)
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	if !seenPodcast || !seenEpisodes {
		t.Fatalf("seen podcast=%v episodes=%v, want both", seenPodcast, seenEpisodes)
	}
	require.Equal(t, PIEpisodeRefreshOutcomeReplacedSnapshot, result.Outcome)
	require.Equal(t, CacheStatusRefreshed, result.CacheStatus)

	stored, err := store.GetPodcastSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, stored)
	require.Len(t, stored.Episodes, 1)
	require.Equal(t, "cold-guid", stored.Episodes[0].EpisodeGUID)
	require.Equal(t, now.Unix(), stored.Podcast.LastSuccessfulFetchAt)
	require.Equal(t, now.Add(2*time.Hour).Unix(), stored.Podcast.RefreshNotBefore)
}

func TestPIEpisodeRefreshServicePersistenceFailureReturnsFallbackStatusAndSnapshot(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 1)), nil
		case "/api/1.0/episodes/byitunesid":
			err := db.Close()
			require.NoError(t, err)
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("cold-guid", 2000),
			)), nil
		default:
			t.Fatalf("unexpected upstream path = %q", req.URL.Path)
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomePersistenceFailed, result.Outcome)
	require.Equal(t, CacheStatusPersistenceFallback, result.CacheStatus)
	require.NotNil(t, result.Snapshot)
	require.Len(t, result.Snapshot.Episodes, 1)
	require.Equal(t, "cold-guid", result.Snapshot.Episodes[0].EpisodeGUID)
}

func TestPIEpisodeRefreshServiceColdMissRejectsNonTruePodcastIndexStatus(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 10, 30, 0, 0, time.UTC)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSONWithStatus("maybe", "123", 1)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("cold-guid", 2000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NotNil(t, err)
	require.NotNil(t, result)
	require.Equal(t, CacheStatusMissError, result.CacheStatus)
	stored, err := store.GetPodcastSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Nil(t, stored)
}

func TestPIEpisodeRefreshServiceStaleSnapshotUsesSinceFromNewestStoredEpisode(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"older", "newest"})
	snapshot.Episodes[0].PublishedAtUnix = 1000
	snapshot.Episodes[1].PublishedAtUnix = 3000
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 3)), nil
		case "/api/1.0/episodes/byitunesid":
			_, hasFulltext := req.URL.Query()["fulltext"]
			require.True(t, hasFulltext)
			gotSince := req.URL.Query().Get("since")
			require.Equal(t, "2999", gotSince)
			gotMax := req.URL.Query().Get("max")
			require.Equal(t, "100", gotMax)
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("newer", 4000),
			)), nil
		default:
			t.Fatalf("unexpected upstream path = %q", req.URL.Path)
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, CacheStatusRefreshed, result.CacheStatus)
	require.False(t, result.Snapshot.Podcast.IsTruncated)
	got := piEpisodeCacheGUIDs(result.Snapshot.Episodes)
	want := []string{"newer", "newest", "older"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("episode order = %#v, want %#v", got, want)
	}
}

func TestPIEpisodeRefreshServiceSingleflightUsesDetachedRefreshContextAndLimiterIdentity(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 13, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Episodes[0].PublishedAtUnix = 3000
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	leaderCtx, cancelLeader := context.WithCancel(context.Background())
	leaderCtx = WithLimiterRemoteAddr(leaderCtx, "leader-client")
	followerCtx := WithLimiterRemoteAddr(context.Background(), "follower-client")

	started := make(chan struct{})
	release := make(chan struct{})
	followerAllowed := make(chan struct{})
	var episodeCalls atomic.Int64
	var allowRemoteAddrs []string
	var allowMu sync.Mutex

	service := NewPIEpisodeRefreshService(store, &mockPodcastIndexClient{
		allowFunc: func(remoteAddr string) bool {
			allowMu.Lock()
			allowRemoteAddrs = append(allowRemoteAddrs, remoteAddr)
			allowMu.Unlock()
			if remoteAddr == "follower-client" {
				close(followerAllowed)
			}
			return true
		},
		fetchPodcastFunc: func(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
			close(started)
			<-release
			err := ctx.Err()
			require.NoError(t, err)
			if _, ok := ctx.Deadline(); !ok {
				t.Fatal("shared refresh context missing timeout deadline")
			}
			feed := piSnapshotPodcastFeedFixture(itunesID, 2)
			return &feed, nil
		},
		fetchEpisodesSinceFunc: func(ctx context.Context, itunesID string, sinceUnix int64) ([]PodcastIndexEpisodeItem, error) {
			episodeCalls.Add(1)
			require.Equal(t, snapshot.Episodes[0].PublishedAtUnix-1, sinceUnix)
			return []PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("fresh", 4000)}, nil
		},
	})
	service.now = func() time.Time { return now }

	errs := make(chan error, 2)
	go func() {
		_, err := service.EnsureSnapshot(leaderCtx, "123")
		errs <- err
	}()
	<-started
	cancelLeader()
	go func() {
		_, err := service.EnsureSnapshot(followerCtx, "123")
		errs <- err
	}()
	select {
	case <-followerAllowed:
	case <-time.After(time.Second):
		t.Fatal("follower did not reach limiter before shared refresh was released")
	}
	close(release)

	for i := 0; i < 2; i++ {
		err := <-errs
		require.NoError(t, err)
	}
	got := episodeCalls.Load()
	require.Equal(t, int64(1), got)
	allowMu.Lock()
	gotAllowRemoteAddrs := append([]string(nil), allowRemoteAddrs...)
	allowMu.Unlock()
	if !reflect.DeepEqual(gotAllowRemoteAddrs, []string{"leader-client", "follower-client"}) {
		t.Fatalf("AllowPodcastIndexRequest remote addrs = %#v, want per-caller limiter identity before shared refresh", gotAllowRemoteAddrs)
	}
}

func TestPIEpisodeRefreshServiceRateLimitedCallerDoesNotBlockAllowedCallerRefresh(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 14, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Episodes[0].PublishedAtUnix = 3000
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	var upstreamCalls atomic.Int64
	service := NewPIEpisodeRefreshService(store, &mockPodcastIndexClient{
		allowFunc: func(remoteAddr string) bool {
			return remoteAddr != "blocked-client"
		},
		fetchPodcastFunc: func(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
			upstreamCalls.Add(1)
			feed := piSnapshotPodcastFeedFixture(itunesID, 2)
			return &feed, nil
		},
		fetchEpisodesSinceFunc: func(ctx context.Context, itunesID string, sinceUnix int64) ([]PodcastIndexEpisodeItem, error) {
			return []PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("fresh", 4000)}, nil
		},
	})
	service.now = func() time.Time { return now }

	blockedResult, err := service.EnsureSnapshot(WithLimiterRemoteAddr(context.Background(), "blocked-client"), "123")
	require.NoError(t, err)
	require.Equal(t, CacheStatusStaleFallback, blockedResult.CacheStatus)
	got := upstreamCalls.Load()
	require.Equal(t, int64(0), got)

	allowedResult, err := service.EnsureSnapshot(WithLimiterRemoteAddr(context.Background(), "allowed-client"), "123")
	require.NoError(t, err)
	require.Equal(t, CacheStatusRefreshed, allowedResult.CacheStatus)
	got = upstreamCalls.Load()
	require.Equal(t, int64(1), got)
}

func TestPIEpisodeRefreshServiceStaleRateLimitUsesStaleFallback(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 5, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	discovery := newPIRefreshTestDiscoveryService(t, func(*http.Request) (*http.Response, error) {
		t.Fatal("rate-limited stale refresh must not call PodcastIndex")
		return nil, errors.New("unexpected upstream call")
	})
	discovery.podcastIndexLimiter = newRateLimiter(1, time.Hour, time.Now)
	require.True(t, discovery.allowPodcastIndexRequest(""))
	service := NewPIEpisodeRefreshService(store, discovery)
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomeFailed, result.Outcome)
	require.Equal(t, CacheStatusStaleFallback, result.CacheStatus)
	require.NotNil(t, result.Snapshot)
	require.True(t, reflect.DeepEqual(piEpisodeCacheGUIDs(result.Snapshot.Episodes), []string{"old"}))
}

func TestPIEpisodeRefreshServiceIncrementalUpsertsWithoutRewritingExistingRows(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 15, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"existing-update", "stable-old"})
	snapshot.Episodes[0].PublishedAtUnix = 1000
	snapshot.Episodes[0].Title = "Original title"
	snapshot.Episodes[0].CreatedAtUnix = now.Add(-24 * time.Hour).Unix()
	snapshot.Episodes[0].UpdatedAtUnix = now.Add(-24 * time.Hour).Unix()
	snapshot.Episodes[1].PublishedAtUnix = 900
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)
	oldExistingRowID := piEpisodeCacheRowID(t, db, "123", "existing-update")
	oldStableRowID := piEpisodeCacheRowID(t, db, "123", "stable-old")

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 3)), nil
		case "/api/1.0/episodes/byitunesid":
			update := piSnapshotEpisodeItemFixture("existing-update", 1000)
			update.Title = "Updated title"
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				update,
				piSnapshotEpisodeItemFixture("brand-new", 2000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, CacheStatusRefreshed, result.CacheStatus)
	require.Len(t, result.Snapshot.Episodes, 3)
	guids := piEpisodeCacheGUIDs(result.Snapshot.Episodes)
	wantGUIDs := []string{"brand-new", "existing-update", "stable-old"}
	if !reflect.DeepEqual(guids, wantGUIDs) {
		t.Fatalf("episode order = %#v, want %#v", guids, wantGUIDs)
	}
	gotTitle := result.Snapshot.Episodes[1].Title
	require.Equal(t, "Updated title", gotTitle)
	gotCreatedAt := result.Snapshot.Episodes[1].CreatedAtUnix
	require.Equal(t, now.Add(-24*time.Hour).Unix(), gotCreatedAt)
	gotUpdatedAt := result.Snapshot.Episodes[1].UpdatedAtUnix
	require.Equal(t, now.Unix(), gotUpdatedAt)
	gotRowID := piEpisodeCacheRowID(t, db, "123", "existing-update")
	require.Equal(t, oldExistingRowID, gotRowID)
	got := piEpisodeCacheRowID(t, db, "123", "stable-old")
	require.Equal(t, oldStableRowID, got)
}

func TestPIEpisodeRefreshServiceIncrementalRejectsNonTrueEpisodeStatusWithStaleFallback(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 20, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 2)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSONWithStatus("false",
				piSnapshotEpisodeItemFixture("new", 2000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomeFailed, result.Outcome)
	require.Equal(t, CacheStatusStaleFallback, result.CacheStatus)
	if got := piEpisodeCacheGUIDs(result.Snapshot.Episodes); !reflect.DeepEqual(got, []string{"old"}) {
		t.Fatalf("episodes = %#v, want unchanged old episode", got)
	}
}

func TestPIEpisodeRefreshServiceIncrementalPersistenceFailureDoesNotReturnPartialSincePayload(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 11, 40, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Episodes[0].PublishedAtUnix = 1000
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 2)), nil
		case "/api/1.0/episodes/byitunesid":
			err := db.Close()
			require.NoError(t, err)
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("new", 2000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomePersistenceFailed, result.Outcome)
	require.Equal(t, CacheStatusPersistenceFallback, result.CacheStatus)
	require.Nil(t, result.Snapshot)
}

func TestPIEpisodeRefreshServiceSingleflightDedupesConcurrentStaleRefresh(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Episodes[0].PublishedAtUnix = 3000
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	var episodeCalls atomic.Int64
	release := make(chan struct{})
	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 2)), nil
		case "/api/1.0/episodes/byitunesid":
			if episodeCalls.Add(1) == 1 {
				<-release
			}
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("new", 4000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	const callers = 8
	var wg sync.WaitGroup
	errs := make(chan error, callers)
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.EnsureSnapshot(context.Background(), "123")
			errs <- err
		}()
	}
	for episodeCalls.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	close(release)
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	got := episodeCalls.Load()
	require.Equal(t, int64(1), got)
}

func TestPIEpisodeRefreshServiceIncrementalAppendDedupeReorderAndClip(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 13, 0, 0, 0, time.UTC)
	guids := make([]string, 0, PISnapshotMaxEpisodesPerPodcast)
	for i := 0; i < PISnapshotMaxEpisodesPerPodcast; i++ {
		guids = append(guids, "old-"+strconv.Itoa(i))
	}
	snapshot := piEpisodeCacheSnapshotFixture("123", guids)
	for i := range snapshot.Episodes {
		published := int64(3000 - i)
		snapshot.Episodes[i].PublishedAtUnix = published
	}
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)
	oldZeroRowID := piEpisodeCacheRowID(t, db, "123", "old-0")

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 1002)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("old-5", 5000),
				piSnapshotEpisodeItemFixture("newest", 6000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Len(t, result.Snapshot.Episodes, PISnapshotMaxEpisodesPerPodcast)
	gotPrefix := piEpisodeCacheGUIDs(result.Snapshot.Episodes[:3])
	wantPrefix := []string{"newest", "old-5", "old-0"}
	if !reflect.DeepEqual(gotPrefix, wantPrefix) {
		t.Fatalf("episode prefix = %#v, want %#v", gotPrefix, wantPrefix)
	}
	if containsString(piEpisodeCacheGUIDs(result.Snapshot.Episodes), "old-999") {
		t.Fatal("oldest episode old-999 was not clipped")
	}
	require.Equal(t, 1, countString(piEpisodeCacheGUIDs(result.Snapshot.Episodes), "old-5"))
	got := piEpisodeCacheRowID(t, db, "123", "old-0")
	require.Equal(t, oldZeroRowID, got)
	require.True(t, result.Snapshot.Podcast.IsTruncated)
}

func TestPIEpisodeRefreshServiceNoNewEpisodesStillAdvancesFreshness(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 14, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Podcast.FetchFailCount = 2
	snapshot.Podcast.LastErrorClass = "timeout"
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 1)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, `{"status":"true","items":[]}`), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	if got := piEpisodeCacheGUIDs(result.Snapshot.Episodes); !reflect.DeepEqual(got, []string{"old"}) {
		t.Fatalf("episodes = %#v, want unchanged old episode", got)
	}
	state, err := store.GetRefreshState(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, now.Unix(), state.LastSuccessfulFetchAt)
	require.Equal(t, now.Add(2*time.Hour).Unix(), state.RefreshNotBefore)
	require.Equal(t, 0, state.FetchFailCount)
	require.Equal(t, "", state.LastErrorClass)
}

func TestPIEpisodeRefreshServiceBoundedFailureBackoffAndStaleFallback(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	base := time.Date(2026, 5, 18, 15, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Podcast.RefreshNotBefore = base.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/api/1.0/podcasts/byitunesid" {
			return nil, errors.New("podcastindex unavailable")
		}
		return nil, errors.New("unexpected path")
	}))

	tests := []struct {
		now          time.Time
		wantCount    int
		wantBackoff  time.Duration
		wantFallback bool
	}{
		{now: base, wantCount: 1, wantBackoff: 5 * time.Minute, wantFallback: true},
		{now: base.Add(5 * time.Minute), wantCount: 2, wantBackoff: 15 * time.Minute, wantFallback: true},
		{now: base.Add(20 * time.Minute), wantCount: 3, wantBackoff: time.Hour, wantFallback: true},
		{now: base.Add(80 * time.Minute), wantCount: 4, wantBackoff: 6 * time.Hour, wantFallback: true},
	}

	for _, tt := range tests {
		service.now = func() time.Time { return tt.now }
		result, err := service.EnsureSnapshot(context.Background(), "123")
		require.NoError(t, err)
		require.Equal(t, PIEpisodeRefreshOutcomeFailed, result.Outcome)
		require.Equal(t, CacheStatusStaleFallback, result.CacheStatus)
		require.NotNil(t, result.Snapshot)
		require.Len(t, result.Snapshot.Episodes, 1)
		state, err := store.GetRefreshState(context.Background(), "123")
		require.NoError(t, err)
		require.Equal(t, tt.wantCount, state.FetchFailCount)
		require.Equal(t, "upstream", state.LastErrorClass)
		require.Equal(t, tt.now.Add(tt.wantBackoff).Unix(), state.RefreshNotBefore)
	}
}

func TestPIEpisodeRefreshServiceBackoffSnapshotServesStaleWithoutUpstreamRetry(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 15, 30, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	var upstreamCalls atomic.Int64
	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(*http.Request) (*http.Response, error) {
		upstreamCalls.Add(1)
		return nil, errors.New("podcastindex unavailable")
	}))
	service.now = func() time.Time { return now }

	first, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomeFailed, first.Outcome)
	require.Equal(t, CacheStatusStaleFallback, first.CacheStatus)
	got := upstreamCalls.Load()
	require.Equal(t, int64(1), got)

	service.now = func() time.Time { return now.Add(time.Minute) }
	second, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.Equal(t, PIEpisodeRefreshOutcomeFailed, second.Outcome)
	require.Equal(t, CacheStatusStaleFallback, second.CacheStatus)
	require.NotNil(t, second.Snapshot)
	require.Len(t, second.Snapshot.Episodes, 1)
	require.Equal(t, "old", second.Snapshot.Episodes[0].EpisodeGUID)
	got = upstreamCalls.Load()
	require.Equal(t, int64(1), got)
}

func TestPIEpisodeRefreshServiceColdFailureFailsClosedWithoutSnapshotOrDBState(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(*http.Request) (*http.Response, error) {
		return nil, errors.New("podcastindex unavailable")
	}))
	now := time.Date(2026, 5, 18, 16, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NotNil(t, err)
	require.NotNil(t, result)
	require.Equal(t, CacheStatusMissError, result.CacheStatus)
	var coldFailureRows int
	err = db.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM podcast_cache_state WHERE podcast_itunes_id = ?", "123").Scan(&coldFailureRows)
	require.NoError(t, err)
	require.Equal(t, 0, coldFailureRows)
}

func TestPIEpisodeRefreshServiceUsesPodcastItunesIDForRefreshIdentity(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 17, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old"})
	snapshot.Episodes[0].PublishedAtUnix = 3000
	snapshot.Podcast.FeedURL = "https://example.com/not-the-cache-key.xml"
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		got := req.URL.Query().Get("id")
		require.Equal(t, "123", got)
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 2)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("new", 4000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	for _, episode := range result.Snapshot.Episodes {
		require.Equal(t, "123", episode.PodcastItunesID)
	}
}

func TestPIEpisodeRefreshServiceTruncationSemantics(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 13, 0, 0, 0, time.UTC)

	// Case 1: Pre-existing truncated podcast remains truncated after refresh even if new feed's EpisodeCount is missing
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"old-1"})
	snapshot.Episodes[0].PublishedAtUnix = 1000
	snapshot.Podcast.IsTruncated = true
	snapshot.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	service := NewPIEpisodeRefreshService(store, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("123", 0)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("new-1", 5000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service.now = func() time.Time { return now }

	result, err := service.EnsureSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.True(t, result.Snapshot.Podcast.IsTruncated)

	// Case 2: Stored snapshot that reaches exactly 1000 items is not truncated without overflow evidence
	db2 := openPIEpisodeCacheTestDB(t)
	store2 := NewPIEpisodeCacheStore(db2)
	guids := make([]string, 0, PISnapshotMaxEpisodesPerPodcast)
	for i := 0; i < PISnapshotMaxEpisodesPerPodcast; i++ {
		guids = append(guids, "old-"+strconv.Itoa(i))
	}
	snapshot2 := piEpisodeCacheSnapshotFixture("456", guids)
	for i := range snapshot2.Episodes {
		snapshot2.Episodes[i].PublishedAtUnix = int64(3000 - i)
	}
	snapshot2.Podcast.RefreshNotBefore = now.Add(-time.Second).Unix()
	err = store2.ReplacePodcastSnapshotTx(context.Background(), snapshot2)
	require.NoError(t, err)

	service2 := NewPIEpisodeRefreshService(store2, newPIRefreshTestDiscoveryService(t, func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/api/1.0/podcasts/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshPodcastResponseJSON("456", 0)), nil
		case "/api/1.0/episodes/byitunesid":
			return jsonResponse(http.StatusOK, piRefreshEpisodesResponseJSON(
				piSnapshotEpisodeItemFixture("new-2", 5000),
			)), nil
		default:
			return nil, errors.New("unexpected path")
		}
	}))
	service2.now = func() time.Time { return now }

	result2, err := service2.EnsureSnapshot(context.Background(), "456")
	require.NoError(t, err)
	require.Len(t, result2.Snapshot.Episodes, PISnapshotMaxEpisodesPerPodcast)
	require.False(t, result2.Snapshot.Podcast.IsTruncated)
}

func assertNoTraceparentHeaders(t *testing.T, req *http.Request) {
	t.Helper()
	got := req.Header.Get("traceparent")
	require.Equal(t, "", got)
	gotTraceState := req.Header.Get("tracestate")
	require.Equal(t, "", gotTraceState)
}

func piRefreshPodcastResponseJSON(itunesID string, episodeCount int64) string {
	return piRefreshPodcastResponseJSONWithStatus("true", itunesID, episodeCount)
}

func piRefreshPodcastResponseJSONWithStatus(status string, itunesID string, episodeCount int64) string {
	feed := piSnapshotPodcastFeedFixture(itunesID, episodeCount)
	return `{"status":` + strconv.Quote(status) + `,"feed":{` +
		`"title":` + strconv.Quote(feed.Title) + `,` +
		`"url":` + strconv.Quote(feed.URL) + `,` +
		`"description":` + strconv.Quote(feed.Description) + `,` +
		`"author":` + strconv.Quote(feed.Author) + `,` +
		`"artwork":` + strconv.Quote(feed.Artwork) + `,` +
		`"lastUpdateTime":1700000000,` +
		`"itunesId":` + itunesID + `,` +
		`"language":` + strconv.Quote(feed.Language) + `,` +
		`"episodeCount":` + strconv.FormatInt(episodeCount, 10) + `,` +
		`"dead":0,` +
		`"categories":{"1":"Technology","2":"News"}` +
		`}}`
}

func piRefreshEpisodesResponseJSON(items ...PodcastIndexEpisodeItem) string {
	return piRefreshEpisodesResponseJSONWithStatus("true", items...)
}

func piRefreshEpisodesResponseJSONWithStatus(status string, items ...PodcastIndexEpisodeItem) string {
	body := `{"status":` + strconv.Quote(status) + `,"items":[`
	for i, item := range items {
		if i > 0 {
			body += ","
		}
		body += piRefreshEpisodeItemJSON(item)
	}
	return body + `]}`
}

func piRefreshEpisodeItemJSON(item PodcastIndexEpisodeItem) string {
	body := `{` +
		`"title":` + strconv.Quote(item.Title) + `,` +
		`"link":` + strconv.Quote(item.Link) + `,` +
		`"description":` + strconv.Quote(item.Description) + `,` +
		`"guid":` + strconv.Quote(item.GUID) + `,` +
		`"datePublished":` + strconv.FormatInt(item.DatePublished, 10) + `,` +
		`"enclosureUrl":` + strconv.Quote(item.EnclosureURL) + `,` +
		`"explicit":` + strconv.Itoa(item.Explicit) + `,` +
		`"image":` + strconv.Quote(item.Image)
	if item.EnclosureLength != nil {
		body += `,"enclosureLength":` + strconv.FormatInt(*item.EnclosureLength, 10)
	}
	if item.Duration != nil {
		body += `,"duration":` + strconv.FormatInt(*item.Duration, 10)
	}
	if item.Episode != nil {
		body += `,"episode":` + strconv.FormatInt(*item.Episode, 10)
	}
	if item.Season != nil {
		body += `,"season":` + strconv.FormatInt(*item.Season, 10)
	}
	if item.EpisodeType != nil {
		body += `,"episodeType":` + strconv.Quote(*item.EpisodeType)
	}
	if item.TranscriptURL != nil {
		body += `,"transcriptUrl":` + strconv.Quote(*item.TranscriptURL)
	}
	return body + `}`
}

func containsString(values []string, target string) bool {
	return countString(values, target) > 0
}

func countString(values []string, target string) int {
	count := 0
	for _, value := range values {
		if value == target {
			count++
		}
	}
	return count
}

func piEpisodeCacheRowID(t *testing.T, db interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, podcastItunesID string, episodeGUID string) int64 {
	t.Helper()

	var rowID int64
	if err := db.QueryRowContext(
		context.Background(),
		`SELECT rowid FROM podcast_episodes WHERE podcast_itunes_id = ? AND episode_guid = ?`,
		podcastItunesID,
		episodeGUID,
	).Scan(&rowID); err != nil {
		t.Fatalf("query rowid for %s/%s: %v", podcastItunesID, episodeGUID, err)
	}
	return rowID
}
