package podcastindex

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func TestPIEpisodeCacheSearchIndexesColdReplace(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-vector"})
	snapshot.Podcast.Title = "Syntax Daily"
	snapshot.Podcast.Author = "Cache Author"
	snapshot.Podcast.Description = "A show about practical software"
	snapshot.Podcast.CategoriesJSON = `["Technology","AI"]`
	snapshot.Episodes[0].Title = "Vector Search Basics"
	snapshot.Episodes[0].Description = "A cache-only SQLite FTS episode"
	snapshot.Episodes[0].Image = ""
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))

	podcasts, err := store.SearchCachedPodcasts(context.Background(), "technology", 5)
	require.NoError(t, err)
	require.Len(t, podcasts, 1)
	require.Equal(t, "123", podcasts[0].PodcastItunesID)
	require.Equal(t, "Syntax Daily", podcasts[0].Title)

	episodes, err := store.SearchCachedEpisodes(context.Background(), "vector", 5)
	require.NoError(t, err)
	require.Len(t, episodes, 1)
	require.Equal(t, "ep-vector", episodes[0].EpisodeGUID)
	require.Equal(t, "Syntax Daily", episodes[0].PodcastTitle)
	require.Equal(t, "https://example.com/show.jpg", episodes[0].Image)
}

func TestPIEpisodeCacheSearchTracksReplaceIncrementalEvictionAndShowMetadata(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	first := piEpisodeCacheSnapshotFixture("123", []string{"old-only"})
	first.Podcast.Title = "Original Show"
	first.Episodes[0].Title = "OldOnlyMarker"
	first.Episodes[0].PublishedAtUnix = 100
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), first))
	assertPIEpisodeCacheSearchNoOrphans(t, store.db)

	replacement := piEpisodeCacheSnapshotFixture("123", []string{"new-only"})
	replacement.Podcast.Title = "Original Show"
	replacement.Episodes[0].Title = "NewOnlyMarker"
	replacement.Episodes[0].PublishedAtUnix = 100
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), replacement))
	assertPIEpisodeCacheSearchNoOrphans(t, store.db)

	oldEpisodes, err := store.SearchCachedEpisodes(context.Background(), "oldonlymarker", 5)
	require.NoError(t, err)
	require.Empty(t, oldEpisodes)

	incremental := piEpisodeCacheSnapshotFixture("123", []string{"incremental-only"})
	incremental.Podcast.Title = "Original Show"
	incremental.Episodes[0].Title = "Incremental Keyword"
	incremental.Episodes[0].PublishedAtUnix = 200
	require.NoError(t, store.ApplyPodcastIncrementalRefreshTx(context.Background(), ApplyPodcastIncrementalRefreshParams{
		Snapshot: incremental,
	}))
	assertPIEpisodeCacheSearchNoOrphans(t, store.db)

	incrementalEpisodes, err := store.SearchCachedEpisodes(context.Background(), "incremental", 5)
	require.NoError(t, err)
	require.Len(t, incrementalEpisodes, 1)

	_, err = store.db.ExecContext(context.Background(), "UPDATE podcast_shows SET title = ? WHERE podcast_itunes_id = ?", "Retitled Show", "123")
	require.NoError(t, err)

	retitledEpisodes, err := store.SearchCachedEpisodes(context.Background(), "retitled", 5)
	require.NoError(t, err)
	require.NotEmpty(t, retitledEpisodes)
	assertPIEpisodeCacheSearchNoOrphans(t, store.db)

	tx, err := store.db.BeginTx(context.Background(), nil)
	require.NoError(t, err)
	require.NoError(t, prunePIEpisodeCacheRetentionTx(context.Background(), tx, "123", 1))
	require.NoError(t, tx.Commit())
	assertPIEpisodeCacheSearchNoOrphans(t, store.db)

	prunedEpisodes, err := store.SearchCachedEpisodes(context.Background(), "newonlymarker", 5)
	require.NoError(t, err)
	require.Empty(t, prunedEpisodes)
	incrementalEpisodes, err = store.SearchCachedEpisodes(context.Background(), "incremental", 5)
	require.NoError(t, err)
	require.Len(t, incrementalEpisodes, 1)

	evicted, err := store.EvictPodcastsOverBudget(context.Background(), 0, -1, "")
	require.NoError(t, err)
	require.Equal(t, []string{"123"}, evicted)
	assertPIEpisodeCacheSearchNoOrphans(t, store.db)

	podcasts, err := store.SearchCachedPodcasts(context.Background(), "retitled", 5)
	require.NoError(t, err)
	require.Empty(t, podcasts)
	episodes, err := store.SearchCachedEpisodes(context.Background(), "incremental", 5)
	require.NoError(t, err)
	require.Empty(t, episodes)
}

func TestPIEpisodeCacheSearchShowNonSearchUpdateDoesNotRebuildEpisodeFTS(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	snapshot.Podcast.Title = "Original Show"
	snapshot.Podcast.FeedURL = "https://example.com/original.xml"
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))

	_, err := store.db.ExecContext(
		context.Background(),
		`UPDATE podcast_episodes_fts
		SET podcast_title = ?
		WHERE rowid = (
			SELECT id FROM podcast_episodes_fts_index
			WHERE podcast_itunes_id = ? AND episode_guid = ?
		)`,
		"Manual Sentinel",
		"123",
		"ep-1",
	)
	require.NoError(t, err)

	_, err = store.db.ExecContext(
		context.Background(),
		"UPDATE podcast_shows SET feed_url = ? WHERE podcast_itunes_id = ?",
		"https://example.com/updated.xml",
		"123",
	)
	require.NoError(t, err)
	require.Equal(t, "Manual Sentinel", piEpisodeCacheEpisodeFTSPodcastTitle(t, store.db, "123", "ep-1"))

	_, err = store.db.ExecContext(
		context.Background(),
		"UPDATE podcast_shows SET title = ? WHERE podcast_itunes_id = ?",
		"Retitled Show",
		"123",
	)
	require.NoError(t, err)
	require.Equal(t, "Retitled Show", piEpisodeCacheEpisodeFTSPodcastTitle(t, store.db, "123", "ep-1"))
}

func TestPIEpisodeCacheSearchMatchesMultiTokenAcrossFields(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-vector"})
	snapshot.Podcast.Title = "Syntax Daily"
	snapshot.Episodes[0].Title = "Vector Search Basics"
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))

	onlySyntax := piEpisodeCacheSnapshotFixture("456", []string{"ep-syntax"})
	onlySyntax.Podcast.Title = "Syntax Weekly"
	onlySyntax.Episodes[0].Title = "No second token"
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), onlySyntax))

	onlyVector := piEpisodeCacheSnapshotFixture("789", []string{"ep-vector"})
	onlyVector.Podcast.Title = "No first token"
	onlyVector.Episodes[0].Title = "Vector Only"
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), onlyVector))

	episodes, err := store.SearchCachedEpisodes(context.Background(), "syntax vector", 5)
	require.NoError(t, err)
	require.Len(t, episodes, 1)
	require.Equal(t, "ep-vector", episodes[0].EpisodeGUID)
	require.Equal(t, "123", episodes[0].PodcastItunesID)

	podcasts, err := store.SearchCachedPodcasts(context.Background(), "syntax vector", 5)
	require.NoError(t, err)
	require.Empty(t, podcasts)
}

func piEpisodeCacheEpisodeFTSPodcastTitle(t *testing.T, db *sql.DB, podcastItunesID string, episodeGUID string) string {
	t.Helper()

	var title string
	require.NoError(t, db.QueryRowContext(
		context.Background(),
		`SELECT fts.podcast_title
		FROM podcast_episodes_fts fts
		JOIN podcast_episodes_fts_index idx
			ON idx.id = fts.rowid
		WHERE idx.podcast_itunes_id = ? AND idx.episode_guid = ?`,
		podcastItunesID,
		episodeGUID,
	).Scan(&title))
	return title
}

func TestPIEpisodeCacheSearchMultiTokenDoesNotEarlyTruncateHighFrequencyCandidates(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	for i := 0; i < 75; i++ {
		snapshot := piEpisodeCacheSnapshotFixture(fmt.Sprintf("common-%03d", i), []string{"ep"})
		snapshot.Podcast.Title = fmt.Sprintf("Common Podcast %03d", i)
		snapshot.Episodes[0].Title = "Common Episode"
		require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))
	}

	target := piEpisodeCacheSnapshotFixture("target", []string{"ep-target"})
	target.Podcast.Title = "Common Target Show"
	target.Episodes[0].Title = "Raretoken Episode"
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), target))

	episodes, err := store.SearchCachedEpisodes(context.Background(), "common raretoken", 5)
	require.NoError(t, err)
	require.Len(t, episodes, 1)
	require.Equal(t, "target", episodes[0].PodcastItunesID)
	require.Equal(t, "ep-target", episodes[0].EpisodeGUID)
}

func TestPIEpisodeCacheSearchCandidateOrderingPrefersTitleMatches(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	for i := 0; i < 6; i++ {
		snapshot := piEpisodeCacheSnapshotFixture(string(rune('A'+i)), []string{"ep"})
		snapshot.Podcast.Title = "A Low Quality Show " + string(rune('A'+i))
		snapshot.Podcast.Description = "needle only in the description"
		require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))
	}
	best := piEpisodeCacheSnapshotFixture("999", []string{"ep"})
	best.Podcast.Title = "Z Needle Title"
	best.Podcast.Description = "plain description"
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), best))

	podcasts, err := store.SearchCachedPodcasts(context.Background(), "needle", 1)
	require.NoError(t, err)
	require.Len(t, podcasts, 1)
	require.Equal(t, "999", podcasts[0].PodcastItunesID)
}

func TestPIEpisodeCacheSearchInvalidCategoriesIndexEmptyText(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	snapshot.Podcast.Title = "Plain Show"
	snapshot.Podcast.Author = "Plain Author"
	snapshot.Podcast.Description = "Plain description"
	snapshot.Podcast.CategoriesJSON = `{"bad":"Technology"}`
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))

	podcasts, err := store.SearchCachedPodcasts(context.Background(), "technology", 5)
	require.NoError(t, err)
	require.Empty(t, podcasts)

	snapshot.Podcast.CategoriesJSON = `{not-json`
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))
	podcasts, err = store.SearchCachedPodcasts(context.Background(), "technology", 5)
	require.NoError(t, err)
	require.Empty(t, podcasts)
}

func TestPIEpisodeCacheSearchSanitizesFTSSpecialSyntax(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))
	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1"})
	require.NoError(t, store.ReplacePodcastSnapshotTx(context.Background(), snapshot))

	inputs := []string{
		`"quoted"`,
		"field:value",
		"hyphen-word",
		"NEAR(search)",
		"prefix*",
		"unmatched(paren",
		"中文搜索",
		"emoji 😀 search",
		"cafe cafe\u0301",
	}
	for _, input := range inputs {
		t.Run(input, func(t *testing.T) {
			query, tokens := sanitizePIEpisodeCacheFTSQuery(input)
			require.LessOrEqual(t, len(tokens), PIEpisodeCacheSearchMaxTokens)
			require.NotContains(t, query, " OR ")
			require.NotContains(t, query, `"`)
			require.NotContains(t, query, ":")
			require.NotContains(t, query, "(")
			require.NotContains(t, query, ")")
			require.NotContains(t, query, "😀")

			_, err := store.SearchCachedPodcasts(context.Background(), input, 5)
			require.NoError(t, err)
			_, err = store.SearchCachedEpisodes(context.Background(), input, 5)
			require.NoError(t, err)
		})
	}
}

func TestPIEpisodeCacheSearchSanitizerEmitsANDPrefixQuery(t *testing.T) {
	query, tokens := sanitizePIEpisodeCacheFTSQuery("syntax vector syntax")

	require.Equal(t, []string{"syntax", "vector"}, tokens)
	require.Equal(t, "syntax* vector*", query)
}

func TestPIEpisodeCacheSearchMigrationDownUp(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	require.NoError(t, goose.SetDialect("sqlite"))
	require.NoError(t, goose.UpContext(context.Background(), db, testSQLiteMigrationDir))
	require.NoError(t, goose.DownToContext(context.Background(), db, testSQLiteMigrationDir, 2))
	require.NoError(t, goose.UpContext(context.Background(), db, testSQLiteMigrationDir))
}

func TestPIEpisodeCacheSearchStorageAmplificationObservation(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	require.NoError(t, goose.SetDialect("sqlite"))
	require.NoError(t, goose.UpToContext(context.Background(), db, testSQLiteMigrationDir, 2))

	insertPIEpisodeCacheSearchStorageObservationRows(t, db, 10, 10)
	beforeFTS := sqlitePageBytes(t, db)

	require.NoError(t, goose.UpContext(context.Background(), db, testSQLiteMigrationDir))
	afterFTS := sqlitePageBytes(t, db)

	require.Greater(t, afterFTS, beforeFTS)
	t.Logf("FTS storage observation: 10 shows/100 episodes page bytes before 00003=%d after 00003=%d amplification=%d", beforeFTS, afterFTS, afterFTS-beforeFTS)
}

func TestPIEpisodeCacheSearchStoreIgnoresOversizedDirectQueries(t *testing.T) {
	store := NewPIEpisodeCacheStore(openPIEpisodeCacheTestDB(t))
	results, err := store.SearchCachedPodcasts(context.Background(), strings.Repeat("a", PIEpisodeCacheSearchMaxRawQueryBytes+1), 5)
	require.NoError(t, err)
	require.Empty(t, results)
}

func assertPIEpisodeCacheSearchNoOrphans(t *testing.T, db *sql.DB) {
	t.Helper()

	queries := map[string]string{
		"show mapping without canonical show": `
			SELECT COUNT(*)
			FROM podcast_shows_fts_index idx
			LEFT JOIN podcast_shows show
				ON show.podcast_itunes_id = idx.podcast_itunes_id
			WHERE show.podcast_itunes_id IS NULL`,
		"show fts without mapping": `
			SELECT COUNT(*)
			FROM podcast_shows_fts fts
			LEFT JOIN podcast_shows_fts_index idx
				ON idx.id = fts.rowid
			WHERE idx.id IS NULL`,
		"episode mapping without canonical episode": `
			SELECT COUNT(*)
			FROM podcast_episodes_fts_index idx
			LEFT JOIN podcast_episodes episode
				ON episode.podcast_itunes_id = idx.podcast_itunes_id
				AND episode.episode_guid = idx.episode_guid
			WHERE episode.episode_guid IS NULL`,
		"episode fts without mapping": `
			SELECT COUNT(*)
			FROM podcast_episodes_fts fts
			LEFT JOIN podcast_episodes_fts_index idx
				ON idx.id = fts.rowid
			WHERE idx.id IS NULL`,
	}

	for name, query := range queries {
		var count int
		require.NoError(t, db.QueryRowContext(context.Background(), query).Scan(&count), name)
		require.Equal(t, 0, count, name)
	}
}

func sqlitePageBytes(t *testing.T, db *sql.DB) int64 {
	t.Helper()

	var pageCount int64
	require.NoError(t, db.QueryRowContext(context.Background(), "PRAGMA page_count").Scan(&pageCount))
	var pageSize int64
	require.NoError(t, db.QueryRowContext(context.Background(), "PRAGMA page_size").Scan(&pageSize))
	return pageCount * pageSize
}

func insertPIEpisodeCacheSearchStorageObservationRows(t *testing.T, db *sql.DB, showCount int, episodesPerShow int) {
	t.Helper()

	now := int64(1779091200)
	for showIndex := 0; showIndex < showCount; showIndex++ {
		podcastID := fmt.Sprintf("storage-%03d", showIndex)
		_, err := db.ExecContext(
			context.Background(),
			`INSERT INTO podcast_shows (
				podcast_itunes_id,
				title,
				description,
				author,
				image,
				feed_url,
				language,
				categories_json,
				episode_count_hint,
				feed_last_update_time_unix,
				created_at_unix,
				updated_at_unix
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			podcastID,
			"Storage Observation Show "+podcastID,
			strings.Repeat("representative show description ", 8),
			"Storage Author",
			"https://example.com/show.jpg",
			"https://example.com/feed.xml",
			"en",
			`["Technology","News"]`,
			episodesPerShow,
			now,
			now,
			now,
		)
		require.NoError(t, err)

		_, err = db.ExecContext(
			context.Background(),
			`INSERT INTO podcast_cache_state (
				podcast_itunes_id,
				is_truncated,
				last_successful_fetch_at_unix,
				last_attempted_fetch_at_unix,
				refresh_not_before_unix,
				approx_bytes,
				last_accessed_at_unix
			) VALUES (?, 0, ?, ?, ?, ?, ?)`,
			podcastID,
			now,
			now,
			now+3600,
			int64(4096),
			now,
		)
		require.NoError(t, err)

		for episodeIndex := 0; episodeIndex < episodesPerShow; episodeIndex++ {
			guid := fmt.Sprintf("episode-%03d", episodeIndex)
			_, err = db.ExecContext(
				context.Background(),
				`INSERT INTO podcast_episodes (
					podcast_itunes_id,
					episode_guid,
					title,
					description,
					enclosure_url,
					published_at_unix,
					duration_seconds,
					image,
					episode_type,
					created_at_unix,
					updated_at_unix
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				podcastID,
				guid,
				"Storage Observation Episode "+guid,
				strings.Repeat("representative episode description ", 10),
				"https://example.com/audio.mp3",
				now-int64(episodeIndex),
				int64(1800+episodeIndex),
				"https://example.com/episode.jpg",
				"full",
				now,
				now,
			)
			require.NoError(t, err)
		}
	}
}
