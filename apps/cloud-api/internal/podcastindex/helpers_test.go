package podcastindex

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

const testSQLiteMigrationDir = "../../migrations"

func openPIEpisodeCacheTestDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	require.NoError(t, err)

	db.SetMaxIdleConns(1)
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)

	if err := db.PingContext(context.Background()); err != nil {
		_ = db.Close()
		t.Fatalf("ping: %v", err)
	}

	if err := goose.SetDialect("sqlite"); err != nil {
		_ = db.Close()
		t.Fatalf("set dialect: %v", err)
	}

	if err := goose.UpContext(context.Background(), db, testSQLiteMigrationDir); err != nil {
		_ = db.Close()
		t.Fatalf("apply migrations: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})
	return db
}

func piEpisodeCacheSnapshotFixture(podcastItunesID string, episodeGUIDs []string) PIEpisodeCacheSnapshot {
	now := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)
	podcast := PIEpisodeCachePodcastRecord{
		PIEpisodeCachePodcastMetadata: PIEpisodeCachePodcastMetadata{
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
		PIEpisodeCachePodcastState: PIEpisodeCachePodcastState{
			LastSuccessfulFetchAt: now.Unix(),
			LastAttemptedFetchAt:  now.Unix(),
			RefreshNotBefore:      now.Add(2 * time.Hour).Unix(),
			ApproxBytes:           2048,
			LastAccessedAt:        now.Unix(),
		},
	}

	episodes := make([]PIEpisodeCacheEpisode, 0, len(episodeGUIDs))
	for i, guid := range episodeGUIDs {
		published := now.Add(-time.Duration(i) * time.Hour)
		episodes = append(episodes, PIEpisodeCacheEpisode{
			PodcastItunesID: podcastItunesID,
			EpisodeGUID:     guid,
			Title:           "Episode " + guid,
			Description:     "Episode description " + guid,
			EnclosureURL:    "https://example.com/audio/" + guid + ".mp3",
			PublishedAtUnix: published.Unix(),
			DurationSeconds: 1800 + int64(i),
			Image:           "https://example.com/art/" + guid + ".jpg",
			EpisodeType:     "full",
			Explicit:        boolPtr(i%2 == 0),
			Link:            "https://example.com/episodes/" + guid,
			EnclosureLength: int64Ptr(1000 + int64(i)),
			TranscriptURL:   "https://example.com/transcript/" + guid + ".srt",
			CreatedAtUnix:   now.Unix(),
			UpdatedAtUnix:   now.Unix(),
		})
	}

	return PIEpisodeCacheSnapshot{
		Podcast:  podcast,
		Episodes: episodes,
	}
}

func boolPtr(v bool) *bool {
	return &v
}

func int64Ptr(v int64) *int64 {
	return &v
}

type mockPodcastIndexClient struct {
	allowFunc              func(remoteAddr string) bool
	fetchPodcastFunc       func(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error)
	fetchEpisodesFunc      func(ctx context.Context, itunesID string, maxEpisodes int) ([]PodcastIndexEpisodeItem, error)
	fetchEpisodesSinceFunc func(ctx context.Context, itunesID string, sinceUnix int64) ([]PodcastIndexEpisodeItem, error)
}

func (m *mockPodcastIndexClient) AllowPodcastIndexRequest(remoteAddr string) bool {
	if m.allowFunc != nil {
		return m.allowFunc(remoteAddr)
	}
	return true
}

func (m *mockPodcastIndexClient) FetchPodcastIndexPodcastByItunesID(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error) {
	if m.fetchPodcastFunc != nil {
		return m.fetchPodcastFunc(ctx, itunesID)
	}
	return nil, nil
}

func (m *mockPodcastIndexClient) FetchPodcastIndexEpisodesByItunesID(ctx context.Context, itunesID string, maxEpisodes int) ([]PodcastIndexEpisodeItem, error) {
	if m.fetchEpisodesFunc != nil {
		return m.fetchEpisodesFunc(ctx, itunesID, maxEpisodes)
	}
	return nil, nil
}

func (m *mockPodcastIndexClient) FetchPodcastIndexEpisodesByItunesIDSince(ctx context.Context, itunesID string, sinceUnix int64) ([]PodcastIndexEpisodeItem, error) {
	if m.fetchEpisodesSinceFunc != nil {
		return m.fetchEpisodesSinceFunc(ctx, itunesID, sinceUnix)
	}
	return nil, nil
}

func piEpisodeCacheGUIDs(episodes []PIEpisodeCacheEpisode) []string {
	guids := make([]string, 0, len(episodes))
	for _, episode := range episodes {
		guids = append(guids, episode.EpisodeGUID)
	}
	return guids
}

func piEpisodeCacheLastAccessedAt(t *testing.T, db interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, podcastItunesID string) int64 {
	t.Helper()

	var lastAccessedAt int64
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT last_accessed_at_unix FROM podcast_cache_state WHERE podcast_itunes_id = ?",
		podcastItunesID,
	).Scan(&lastAccessedAt); err != nil {
		t.Fatalf("query last_accessed_at for %s: %v", podcastItunesID, err)
	}
	return lastAccessedAt
}
