package podcastindex

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPIEpisodeReadPathFreshSnapshotReadsSQLiteWithoutUpstream(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	upstreamCalled := false
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	refresh := NewPIEpisodeRefreshService(store, &mockPodcastIndexClient{
		fetchPodcastFunc: func(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
			upstreamCalled = true
			t.Fatal("fresh cached read must not call PodcastIndex")
			return nil, nil
		},
	})
	refresh.now = func() time.Time { return readAt }
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	got, err := readPath.ReadSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, got, "snapshot = nil, want cached snapshot")
	require.False(t, upstreamCalled)
	require.Equal(t, "123", got.Podcast.PodcastItunesID)
	if gotGUIDs := piEpisodeCacheGUIDs(got.Episodes); !reflect.DeepEqual(gotGUIDs, []string{"ep-1", "ep-2"}) {
		t.Fatalf("snapshot GUIDs = %#v, want ep-1/ep-2", gotGUIDs)
	}
	lastAccessedAt := piEpisodeCacheLastAccessedAt(t, db, "123")
	require.Equal(t, UnixPISnapshotTime(readAt), lastAccessedAt)
}

func TestPIEpisodeReadPathStableSQLWindows(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2", "ep-3", "ep-4", "ep-5"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	readPath := NewPIEpisodeReadPathService(store, piEpisodeReadPathNoUpstreamRefresh(t, store))
	readPath.now = func() time.Time {
		return time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	}
	readPath.now = func() time.Time {
		return time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	}

	firstWindow, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 1)
	require.NoError(t, err)
	secondWindow, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 3)
	require.NoError(t, err)
	repeatedFirstWindow, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 1)
	require.NoError(t, err)

	require.Equal(t, 5, firstWindow.TotalCount)
	if got := piEpisodeCacheGUIDs(firstWindow.Episodes); !reflect.DeepEqual(got, []string{"ep-2", "ep-3"}) {
		t.Fatalf("first window GUIDs = %#v, want ep-2/ep-3", got)
	}
	if got := piEpisodeCacheGUIDs(secondWindow.Episodes); !reflect.DeepEqual(got, []string{"ep-4", "ep-5"}) {
		t.Fatalf("second window GUIDs = %#v, want ep-4/ep-5", got)
	}
	if got := piEpisodeCacheGUIDs(repeatedFirstWindow.Episodes); !reflect.DeepEqual(got, []string{"ep-2", "ep-3"}) {
		t.Fatalf("repeated first window GUIDs = %#v, want ep-2/ep-3", got)
	}
}

func TestPIEpisodeReadPathPageReadDoesNotMaterializeFullSnapshotOnFreshCache(t *testing.T) {
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	store := &piEpisodeReadPathFakeStore{
		state: &PIEpisodeCacheRefreshState{
			PodcastItunesID:       "123",
			StoredEpisodeCount:    1000,
			LastSuccessfulFetchAt: UnixPISnapshotTime(readAt.Add(-time.Hour)),
			RefreshNotBefore:      UnixPISnapshotTime(readAt.Add(time.Hour)),
		},
		page: &PIEpisodeCachePage{
			Episodes: []PIEpisodeCacheEpisode{
				{PodcastItunesID: "123", EpisodeGUID: "ep-101"},
				{PodcastItunesID: "123", EpisodeGUID: "ep-102"},
			},
			Limit:      2,
			Offset:     100,
			TotalCount: 1000,
		},
	}
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			t.Fatal("fresh page read must not materialize a full snapshot through refresh")
			return nil, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	page, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 100)
	require.NoError(t, err)
	if got := piEpisodeCacheGUIDs(page.Episodes); !reflect.DeepEqual(got, []string{"ep-101", "ep-102"}) {
		t.Fatalf("page GUIDs = %#v, want SQL-windowed page", got)
	}
	require.Equal(t, 1, store.refreshStateCalls)
	require.Equal(t, 1, store.pageCalls)
	require.Equal(t, 1, store.touchCalls)
}

func TestPIEpisodeReadPathStalePageReadUsesDBWithoutRefresh(t *testing.T) {
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	store := &piEpisodeReadPathFakeStore{
		state: &PIEpisodeCacheRefreshState{
			PodcastItunesID:       "123",
			StoredEpisodeCount:    1000,
			LastSuccessfulFetchAt: UnixPISnapshotTime(readAt.Add(-24 * time.Hour)),
			RefreshNotBefore:      UnixPISnapshotTime(readAt.Add(-time.Hour)),
		},
		page: &PIEpisodeCachePage{
			Episodes: []PIEpisodeCacheEpisode{
				{PodcastItunesID: "123", EpisodeGUID: "ep-101"},
				{PodcastItunesID: "123", EpisodeGUID: "ep-102"},
			},
			Limit:      2,
			Offset:     100,
			TotalCount: 1000,
		},
	}
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			t.Fatal("stale page read must not refresh before reading the DB page")
			return nil, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	page, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 100)
	require.NoError(t, err)
	require.NotNil(t, page, "page = nil, want stale DB page")
	if got := piEpisodeCacheGUIDs(page.Episodes); !reflect.DeepEqual(got, []string{"ep-101", "ep-102"}) {
		t.Fatalf("page GUIDs = %#v, want SQL-windowed page", got)
	}
	require.Equal(t, CacheStatusStaleFallback, page.CacheStatus)
	require.Equal(t, 1, store.pageCalls)
}

func TestPIEpisodeReadPathPageTouchFailureDoesNotFailRead(t *testing.T) {
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	store := &piEpisodeReadPathFakeStore{
		state: &PIEpisodeCacheRefreshState{
			PodcastItunesID:       "123",
			StoredEpisodeCount:    2,
			LastSuccessfulFetchAt: UnixPISnapshotTime(readAt.Add(-time.Hour)),
			RefreshNotBefore:      UnixPISnapshotTime(readAt.Add(time.Hour)),
		},
		page: &PIEpisodeCachePage{
			Episodes: []PIEpisodeCacheEpisode{
				{PodcastItunesID: "123", EpisodeGUID: "ep-101"},
			},
			Limit:      1,
			Offset:     0,
			TotalCount: 2,
		},
		touchErr: errors.New("db unavailable"),
	}
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			t.Fatal("page touch failure must not trigger PodcastIndex refresh")
			return nil, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	page, err := readPath.ReadEpisodePage(context.Background(), "123", 1, 0)
	require.NoError(t, err)
	require.NotNil(t, page, "page = nil, want DB page despite touch failure")
	if got := piEpisodeCacheGUIDs(page.Episodes); !reflect.DeepEqual(got, []string{"ep-101"}) {
		t.Fatalf("page GUIDs = %#v, want DB page", got)
	}
	require.Equal(t, 1, store.touchCalls)
}

func TestPIEpisodeReadPathColdPageReadRefreshesAndReturnsRequestedPage(t *testing.T) {
	store := &piEpisodeReadPathFakeStore{}
	refreshCalls := 0
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			refreshCalls++
			return &PIEpisodeRefreshResult{
				Snapshot: &PIEpisodeCacheSnapshot{
					Podcast: PIEpisodeCachePodcastRecord{
						PIEpisodeCachePodcastMetadata: PIEpisodeCachePodcastMetadata{PodcastItunesID: "123"},
					},
					Episodes: []PIEpisodeCacheEpisode{
						{PodcastItunesID: "123", EpisodeGUID: "ep-1"},
						{PodcastItunesID: "123", EpisodeGUID: "ep-2"},
						{PodcastItunesID: "123", EpisodeGUID: "ep-3"},
					},
				},
				CacheStatus: CacheStatusRefreshed,
			}, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)

	page, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 1)
	require.NoError(t, err)
	require.NotNil(t, page, "page = nil, want refreshed page")
	if got := piEpisodeCacheGUIDs(page.Episodes); !reflect.DeepEqual(got, []string{"ep-2", "ep-3"}) {
		t.Fatalf("page GUIDs = %#v, want requested refreshed window", got)
	}
	require.Equal(t, CacheStatusRefreshed, page.CacheStatus)
	require.Equal(t, 3, page.TotalCount)
	require.Equal(t, 1, refreshCalls)
	require.Equal(t, 0, store.pageCalls)
}

func TestPIEpisodeReadPathPodcastMetadataReadDoesNotMaterializeFullSnapshotOnFreshCache(t *testing.T) {
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	store := &piEpisodeReadPathFakeStore{
		state: &PIEpisodeCacheRefreshState{
			PodcastItunesID:       "123",
			StoredEpisodeCount:    1000,
			LastSuccessfulFetchAt: UnixPISnapshotTime(readAt.Add(-time.Hour)),
			RefreshNotBefore:      UnixPISnapshotTime(readAt.Add(time.Hour)),
		},
		podcast: &PIEpisodeCachePodcastMetadata{
			PodcastItunesID: "123",
			Title:           "Fixture Show",
		},
	}
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			t.Fatal("fresh podcast metadata read must not materialize a full snapshot through refresh")
			return nil, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	podcastResult, err := readPath.ReadPodcastMetadata(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, podcastResult)
	require.NotNil(t, podcastResult.Podcast)
	require.Equal(t, "123", podcastResult.Podcast.PodcastItunesID)
	require.Equal(t, CacheStatusFreshHit, podcastResult.CacheStatus)
	require.Equal(t, 1, store.refreshStateCalls)
	require.Equal(t, 1, store.podcastMetadataCalls)
	require.Equal(t, 0, store.pageCalls)
	require.Equal(t, 1, store.touchCalls)
}

func TestPIEpisodeReadPathStalePodcastMetadataRefreshes(t *testing.T) {
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	snapshot.Podcast.Title = "Refreshed show"
	store := &piEpisodeReadPathFakeStore{
		state: &PIEpisodeCacheRefreshState{
			PodcastItunesID:       "123",
			StoredEpisodeCount:    1,
			LastSuccessfulFetchAt: UnixPISnapshotTime(readAt.Add(-24 * time.Hour)),
			RefreshNotBefore:      UnixPISnapshotTime(readAt.Add(-time.Hour)),
		},
	}
	refreshCalls := 0
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			refreshCalls++
			return &PIEpisodeRefreshResult{
				Snapshot:    &snapshot,
				Outcome:     PIEpisodeRefreshOutcomeReplacedSnapshot,
				CacheStatus: CacheStatusRefreshed,
			}, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	podcastResult, err := readPath.ReadPodcastMetadata(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, podcastResult)
	require.NotNil(t, podcastResult.Podcast)
	require.Equal(t, "Refreshed show", podcastResult.Podcast.Title)
	require.Equal(t, CacheStatusRefreshed, podcastResult.CacheStatus)
	require.Equal(t, 1, refreshCalls)
}

func TestPIEpisodeReadPathFallsBackToRefreshSnapshotWhenPersistenceFailed(t *testing.T) {
	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2", "ep-3"})
	snapshot.Podcast.Title = "Freshly fetched show"
	snapshot.Episodes[1].Title = "Freshly fetched episode"
	store := &piEpisodeReadPathFakeStore{
		podcastMetadataErr: errors.New("db unavailable"),
		pageErr:            errors.New("db unavailable"),
		episodeByGUIDErr:   errors.New("db unavailable"),
		touchErr:           errors.New("db unavailable"),
	}
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			return &PIEpisodeRefreshResult{
				Snapshot:    &snapshot,
				Outcome:     PIEpisodeRefreshOutcomePersistenceFailed,
				CacheStatus: CacheStatusPersistenceFallback,
			}, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	page, err := readPath.ReadEpisodePage(context.Background(), "123", 2, 1)
	require.NoError(t, err)
	require.NotNil(t, page, "page = nil, want in-memory fallback page")
	if got := piEpisodeCacheGUIDs(page.Episodes); !reflect.DeepEqual(got, []string{"ep-2", "ep-3"}) {
		t.Fatalf("page GUIDs = %#v, want fallback requested window", got)
	}
	require.Equal(t, CacheStatusPersistenceFallback, page.CacheStatus)

	podcastResult, err := readPath.ReadPodcastMetadata(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, podcastResult)
	require.NotNil(t, podcastResult.Podcast)
	require.Equal(t, "Freshly fetched show", podcastResult.Podcast.Title)
	require.Equal(t, CacheStatusPersistenceFallback, podcastResult.CacheStatus)

	require.Equal(t, 0, store.pageCalls)
	require.Equal(t, 0, store.podcastMetadataCalls)
	require.Equal(t, 0, store.episodeByGUIDCalls)
	require.Equal(t, 0, store.touchCalls)
}

func TestPIEpisodeReadPathDetailLookupDoesNotRefreshStalePodcast(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	readAt := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	snapshot.Podcast.RefreshNotBefore = readAt.Add(-time.Hour).Unix()
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			t.Fatal("episode detail must not refresh stale podcast snapshots")
			return nil, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)
	readPath.now = func() time.Time { return readAt }

	got, err := readPath.ReadEpisodeDetail(context.Background(), "123", "ep-1")
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.Episode)
	require.Equal(t, CacheStatusStaleFallback, got.CacheStatus)
}

func TestPIEpisodeReadPathColdDetailLookupDoesNotBootstrapPodcastIndex(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	refresh := &piEpisodeReadPathFakeRefresh{
		ensureSnapshot: func(context.Context, string) (*PIEpisodeRefreshResult, error) {
			t.Fatal("cold episode detail must not bootstrap PodcastIndex")
			return nil, nil
		},
	}
	readPath := NewPIEpisodeReadPathService(store, refresh)

	got, err := readPath.ReadEpisodeDetail(context.Background(), "123", "ep-1")
	require.NotNil(t, got, "episode result = nil, want cache status result")
	require.Equal(t, CacheStatusMissError, got.CacheStatus)
	if !errors.Is(err, ErrPIEpisodeReadPathEpisodeNotFound) {
		t.Fatalf("error = %v, want ErrPIEpisodeReadPathEpisodeNotFound", err)
	}
}

func TestPIEpisodeReadPathDetailLookupUsesPodcastItunesIDAndEpisodeGUID(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	first := piEpisodeCacheSnapshotFixture("123", []string{"shared-guid"})
	first.Episodes[0].Title = "First podcast episode"
	err := store.ReplacePodcastSnapshotTx(context.Background(), first)
	require.NoError(t, err)
	second := piEpisodeCacheSnapshotFixture("456", []string{"shared-guid"})
	second.Episodes[0].Title = "Second podcast episode"
	err = store.ReplacePodcastSnapshotTx(context.Background(), second)
	require.NoError(t, err)

	readPath := NewPIEpisodeReadPathService(store, piEpisodeReadPathNoUpstreamRefresh(t, store))
	readPath.now = func() time.Time {
		return time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	}

	got, err := readPath.ReadEpisodeDetail(context.Background(), "456", "shared-guid")
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.Episode)
	require.Equal(t, "456", got.Episode.PodcastItunesID)
	require.Equal(t, "Second podcast episode", got.Episode.Title)
	require.Equal(t, CacheStatusFreshHit, got.CacheStatus)
}

func TestPIEpisodeReadPathMissingDetailReturnsDeterministicNotFound(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	readPath := NewPIEpisodeReadPathService(store, piEpisodeReadPathNoUpstreamRefresh(t, store))
	readPath.now = func() time.Time {
		return time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	}

	got, err := readPath.ReadEpisodeDetail(context.Background(), "123", "missing-guid")
	require.NotNil(t, got, "episode result = nil, want cache status result")
	require.Nil(t, got.Episode)
	require.Equal(t, CacheStatusFreshHit, got.CacheStatus)
	if !errors.Is(err, ErrPIEpisodeReadPathEpisodeNotFound) {
		t.Fatalf("error = %v, want ErrPIEpisodeReadPathEpisodeNotFound", err)
	}
}

func TestPIEpisodeReadPathTouchesLastAccessedAtOnReadAndExplicitTouch(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)
	lastAccessedAt := piEpisodeCacheLastAccessedAt(t, db, "123")
	require.Equal(t, snapshot.Podcast.LastAccessedAt, lastAccessedAt)

	readAt := time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	readPath := NewPIEpisodeReadPathService(store, piEpisodeReadPathNoUpstreamRefresh(t, store))
	readPath.now = func() time.Time { return readAt }

	_, err = readPath.ReadEpisodePage(context.Background(), "123", 1, 0)

	require.NoError(t, err)
	lastAccessedAt = piEpisodeCacheLastAccessedAt(t, db, "123")
	require.Equal(t, UnixPISnapshotTime(readAt), lastAccessedAt)

	touchAt := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	err = store.TouchPodcastAccess(context.Background(), "123", UnixPISnapshotTime(touchAt))
	require.NoError(t, err)
	lastAccessedAt = piEpisodeCacheLastAccessedAt(t, db, "123")
	require.Equal(t, UnixPISnapshotTime(touchAt), lastAccessedAt)
}

func piEpisodeReadPathNoUpstreamRefresh(t *testing.T, store *PIEpisodeCacheStore) *PIEpisodeRefreshService {
	t.Helper()
	refresh := NewPIEpisodeRefreshService(store, &mockPodcastIndexClient{
		fetchPodcastFunc: func(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
			t.Fatal("fresh cached read must not call PodcastIndex")
			return nil, nil
		},
	})
	refresh.now = func() time.Time {
		return time.Date(2026, 5, 18, 9, 0, 0, 0, time.UTC)
	}
	return refresh
}

type piEpisodeReadPathFakeStore struct {
	state   *PIEpisodeCacheRefreshState
	podcast *PIEpisodeCachePodcastMetadata
	page    *PIEpisodeCachePage
	episode *PIEpisodeCacheEpisode

	refreshStateErr    error
	podcastMetadataErr error
	pageErr            error
	episodeByGUIDErr   error
	touchErr           error

	refreshStateCalls    int
	podcastMetadataCalls int
	pageCalls            int
	episodeByGUIDCalls   int
	touchCalls           int
}

func (s *piEpisodeReadPathFakeStore) GetRefreshState(context.Context, string) (*PIEpisodeCacheRefreshState, error) {
	s.refreshStateCalls++
	if s.refreshStateErr != nil {
		return nil, fmt.Errorf("get refresh state: %w", s.refreshStateErr)
	}
	return s.state, nil
}

func (s *piEpisodeReadPathFakeStore) GetPodcastMetadata(context.Context, string) (*PIEpisodeCachePodcastMetadata, error) {
	s.podcastMetadataCalls++
	if s.podcastMetadataErr != nil {
		return nil, fmt.Errorf("get podcast metadata: %w", s.podcastMetadataErr)
	}
	return s.podcast, nil
}

func (s *piEpisodeReadPathFakeStore) GetEpisodePage(_ context.Context, _ string, _ int, _ int) (*PIEpisodeCachePage, error) {
	s.pageCalls++
	if s.pageErr != nil {
		return nil, fmt.Errorf("get episode page: %w", s.pageErr)
	}
	return s.page, nil
}

func (s *piEpisodeReadPathFakeStore) GetEpisodeByGuid(context.Context, string, string) (*PIEpisodeCacheEpisode, error) {
	s.episodeByGUIDCalls++
	if s.episodeByGUIDErr != nil {
		return nil, fmt.Errorf("get episode by guid: %w", s.episodeByGUIDErr)
	}
	return s.episode, nil
}

func (s *piEpisodeReadPathFakeStore) TouchPodcastAccess(context.Context, string, int64) error {
	s.touchCalls++
	if s.touchErr != nil {
		return fmt.Errorf("touch podcast access: %w", s.touchErr)
	}
	return nil
}

type piEpisodeReadPathFakeRefresh struct {
	ensureSnapshot func(context.Context, string) (*PIEpisodeRefreshResult, error)
}

func (r *piEpisodeReadPathFakeRefresh) EnsureSnapshot(ctx context.Context, podcastItunesID string) (*PIEpisodeRefreshResult, error) {
	return r.ensureSnapshot(ctx, podcastItunesID)
}
