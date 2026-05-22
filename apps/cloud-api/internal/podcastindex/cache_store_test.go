package podcastindex

import (
	"context"
	"database/sql"
	"reflect"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPIEpisodeCacheMigrationCreatesSchemaAndIndexes(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)

	assertSQLiteTableExists(t, db, "podcast_shows")
	assertSQLiteTableExists(t, db, "podcast_episodes")
	assertSQLiteTableExists(t, db, "podcast_cache_state")
	assertSQLiteColumnMissing(t, db, "podcast_shows", "last_episode_published_at")
	assertSQLiteColumnMissing(t, db, "podcast_shows", "stored_episode_count")
	assertSQLiteColumnMissing(t, db, "podcast_shows", "refresh_not_before")
	assertSQLiteColumnExists(t, db, "podcast_shows", "created_at_unix")
	assertSQLiteColumnExists(t, db, "podcast_shows", "updated_at_unix")
	assertSQLiteColumnExists(t, db, "podcast_cache_state", "refresh_not_before_unix")
	assertSQLiteColumnExists(t, db, "podcast_cache_state", "last_accessed_at_unix")
	assertSQLiteColumnMissing(t, db, "podcast_cache_state", "created_at_unix")
	assertSQLiteColumnMissing(t, db, "podcast_cache_state", "updated_at_unix")
	assertSQLiteIndexMissing(t, db, "podcast_cache_state", "idx_podcast_cache_state_next_refresh_after")
	assertSQLiteIndexMissing(t, db, "podcast_cache_state", "idx_podcast_cache_state_refresh_not_before")
	assertSQLiteIndexExists(t, db, "podcast_cache_state", "idx_podcast_cache_state_priority_last_accessed")
	assertSQLiteIndexExists(t, db, "podcast_episodes", "idx_podcast_episodes_podcast_published_at")
	assertSQLiteColumnExists(t, db, "podcast_episodes", "enclosure_url")
	assertSQLiteColumnExists(t, db, "podcast_episodes", "image")
	assertSQLiteColumnExists(t, db, "podcast_episodes", "created_at_unix")
	assertSQLiteColumnExists(t, db, "podcast_episodes", "updated_at_unix")
	assertSQLiteColumnMissing(t, db, "podcast_episodes", "audio_url")
	assertSQLiteColumnMissing(t, db, "podcast_episodes", "published_at")
	assertSQLiteColumnMissing(t, db, "podcast_episodes", "episode_artwork_url")
}

func TestPIEpisodeCacheForeignKeyCascade(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	_, err = db.ExecContext(context.Background(), "DELETE FROM podcast_shows WHERE podcast_itunes_id = ?", "123")
	require.NoError(t, err)

	var episodeCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM podcast_episodes WHERE podcast_itunes_id = ?",
		"123",
	).Scan(&episodeCount); err != nil {
		t.Fatalf("query episode count: %v", err)
	}
	require.Equal(t, 0, episodeCount)
}

func TestPIEpisodeCacheStorePagesEpisodesByPublishedAt(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2", "ep-3"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	page, err := store.GetEpisodePage(context.Background(), "123", 2, 1)
	require.NoError(t, err)
	require.Equal(t, 3, page.TotalCount)
	gotGUIDs := []string{}
	for _, episode := range page.Episodes {
		gotGUIDs = append(gotGUIDs, episode.EpisodeGUID)
	}
	wantGUIDs := []string{"ep-2", "ep-3"}
	if !reflect.DeepEqual(gotGUIDs, wantGUIDs) {
		t.Fatalf("page GUIDs = %#v, want %#v", gotGUIDs, wantGUIDs)
	}
}

func TestPIEpisodeCacheStoreTransactionalReplaceRollsBackOnEpisodeFailure(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	original := piEpisodeCacheSnapshotFixture("123", []string{"old-1", "old-2"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), original)
	require.NoError(t, err)

	replacement := piEpisodeCacheSnapshotFixture("123", []string{"dup", "dup"})
	err = store.ReplacePodcastSnapshotTx(context.Background(), replacement)
	require.NotNil(t, err)

	page, err := store.GetEpisodePage(context.Background(), "123", 10, 0)
	require.NoError(t, err)
	gotGUIDs := []string{}
	for _, episode := range page.Episodes {
		gotGUIDs = append(gotGUIDs, episode.EpisodeGUID)
	}
	wantGUIDs := []string{"old-1", "old-2"}
	if !reflect.DeepEqual(gotGUIDs, wantGUIDs) {
		t.Fatalf("episodes after failed replace = %#v, want %#v", gotGUIDs, wantGUIDs)
	}

	state, err := store.GetRefreshState(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, state, "refresh state = nil, want original podcast row")
	require.Equal(t, 2, state.StoredEpisodeCount)
}

func TestPIEpisodeCacheStoreKeepsDomainDataSeparateFromCacheState(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
	snapshot.Podcast.IsTruncated = true
	snapshot.Podcast.Priority = 7
	snapshot.Podcast.FetchFailCount = 3
	snapshot.Podcast.LastErrorClass = "upstream"
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	var podcastRows int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM podcast_shows WHERE podcast_itunes_id = ? AND title = ?",
		"123",
		"Fixture Show",
	).Scan(&podcastRows); err != nil {
		t.Fatalf("query podcast domain row: %v", err)
	}
	require.Equal(t, 1, podcastRows)

	var cacheStateRows int
	if err := db.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*) FROM podcast_cache_state
		WHERE podcast_itunes_id = ?
			AND is_truncated = 1
			AND priority = 7
			AND fetch_fail_count = 3
			AND last_error_class = ?`,
		"123",
		"upstream",
	).Scan(&cacheStateRows); err != nil {
		t.Fatalf("query cache state row: %v", err)
	}
	require.Equal(t, 1, cacheStateRows)
}

func TestPIEpisodeCacheStoreEpisodePageTotalCountComesFromEpisodes(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2", "ep-3"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)
	if _, err := db.ExecContext(
		context.Background(),
		"DELETE FROM podcast_episodes WHERE podcast_itunes_id = ? AND episode_guid = ?",
		"123",
		"ep-3",
	); err != nil {
		t.Fatalf("delete episode: %v", err)
	}

	page, err := store.GetEpisodePage(context.Background(), "123", 20, 0)
	require.NoError(t, err)
	require.Equal(t, 2, page.TotalCount)
	require.Len(t, page.Episodes, 2)
}

func TestPIEpisodeCacheStoreReadsSnapshotAndEpisodeByGuid(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)

	snapshot := piEpisodeCacheSnapshotFixture("123", []string{"ep-1", "ep-2"})
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)

	storedSnapshot, err := store.GetPodcastSnapshot(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, storedSnapshot, "snapshot = nil, want stored snapshot")
	require.Equal(t, "123", storedSnapshot.Podcast.PodcastItunesID)
	require.Equal(t, snapshot.Podcast.FeedLastUpdateTimeUnix, storedSnapshot.Podcast.FeedLastUpdateTimeUnix)
	require.Len(t, storedSnapshot.Episodes, 2)

	episode, err := store.GetEpisodeByGuid(context.Background(), "123", "ep-2")
	require.NoError(t, err)
	require.NotNil(t, episode, "episode = nil, want ep-2")
	require.Equal(t, "Episode ep-2", episode.Title)
}

func TestPIEpisodeCacheStoreIncrementalApproxBytesCountsUTF8Bytes(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 9, 30, 0, 0, time.UTC)
	snapshot := PIPodcastSnapshot{
		PodcastItunesID:        "unicode-show",
		Title:                  "中文播客",
		Description:            "描述🙂",
		Author:                 "作者",
		Image:                  "https://example.com/封面.jpg",
		FeedURL:                "https://example.com/feed.xml",
		Language:               "zh",
		Categories:             []string{"科技"},
		EpisodeCountHint:       1,
		FeedLastUpdateTimeUnix: now.Unix(),
		LastSuccessfulFetchAt:  now,
		RefreshNotBefore:       now.Add(2 * time.Hour),
		Episodes: []PIEpisodeSnapshot{
			{
				PodcastItunesID: "unicode-show",
				EpisodeGUID:     "episode-一",
				Title:           "第一集🙂",
				Description:     "单集描述",
				EnclosureURL:    "https://example.com/audio/一.mp3",
				PublishedAt:     now,
				PublishedAtUnix: now.Unix(),
				DurationSeconds: 1800,
				Image:           "https://example.com/art/一.jpg",
				EpisodeType:     "full",
				Link:            "https://example.com/episodes/一",
				TranscriptURL:   "https://example.com/transcript/一.srt",
				EnclosureLength: int64Ptr(1234),
				EpisodeNumber:   int64Ptr(1),
				SeasonNumber:    int64Ptr(1),
				Explicit:        boolPtr(false),
			},
		},
	}

	err := store.ApplyPodcastIncrementalRefreshTx(context.Background(), ApplyPodcastIncrementalRefreshParams{
		Snapshot: snapshot,
	})
	require.NoError(t, err)

	storedSnapshot, err := store.GetPodcastSnapshot(context.Background(), "unicode-show")
	require.NoError(t, err)
	require.NotNil(t, storedSnapshot, "snapshot = nil, want stored snapshot")
	expectedApproxBytes := estimatePIEpisodeCacheApproxBytes(snapshot.toEpisodeCacheSnapshot())
	require.Equal(t, expectedApproxBytes, storedSnapshot.Podcast.ApproxBytes)
}

func TestPIEpisodeCacheStoreGetPodcastMetadataWithoutCacheStateRow(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	now := time.Date(2026, 5, 18, 9, 30, 0, 0, time.UTC)

	if _, err := db.ExecContext(
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
		"meta-only",
		"Metadata Only Show",
		"Only persisted metadata should be enough",
		"Metadata Author",
		"https://example.com/meta-only.jpg",
		"https://example.com/meta-only.xml",
		"en",
		`["Technology","News"]`,
		42,
		now.Unix(),
		now.Unix(),
		now.Add(time.Minute).Unix(),
	); err != nil {
		t.Fatalf("insert podcast_shows metadata-only row: %v", err)
	}

	metadata, err := store.GetPodcastMetadata(context.Background(), "meta-only")
	require.NoError(t, err)
	require.NotNil(t, metadata, "metadata = nil, want persisted podcast metadata")
	require.Equal(t, "meta-only", metadata.PodcastItunesID)
	require.Equal(t, "Metadata Only Show", metadata.Title)
	require.Equal(t, `["Technology","News"]`, metadata.CategoriesJSON)
	require.Equal(t, now.Unix(), metadata.FeedLastUpdateTimeUnix)
}

func TestPIEpisodeCacheStoreGetPodcastRecordJoinsMetadataAndState(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	base := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)

	if _, err := db.ExecContext(
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
		"joined",
		"Joined Show",
		"Joined Description",
		"Joined Author",
		"https://example.com/joined.jpg",
		"https://example.com/joined.xml",
		"zh",
		`["Business"]`,
		77,
		base.Unix(),
		base.Unix(),
		base.Add(time.Minute).Unix(),
	); err != nil {
		t.Fatalf("insert podcast_shows joined row: %v", err)
	}

	if _, err := db.ExecContext(
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
			link,
			created_at_unix,
			updated_at_unix
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"joined",
		"joined-ep-1",
		"Joined Episode",
		"Joined episode description",
		"https://example.com/joined-ep-1.mp3",
		base.Add(-time.Hour).Unix(),
		1800,
		"https://example.com/joined-ep-1.jpg",
		"full",
		"https://example.com/joined-ep-1",
		base.Unix(),
		base.Unix(),
	); err != nil {
		t.Fatalf("insert podcast_episodes joined row: %v", err)
	}

	if _, err := db.ExecContext(
		context.Background(),
		`INSERT INTO podcast_cache_state (
			podcast_itunes_id,
			is_truncated,
			last_successful_fetch_at_unix,
			last_attempted_fetch_at_unix,
			refresh_not_before_unix,
			fetch_fail_count,
			last_error_class,
			approx_bytes,
			priority,
			last_accessed_at_unix
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"joined",
		1,
		base.Add(2*time.Hour).Unix(),
		base.Add(90*time.Minute).Unix(),
		base.Add(3*time.Hour).Unix(),
		5,
		"rate_limit",
		4096,
		8,
		base.Add(30*time.Minute).Unix(),
	); err != nil {
		t.Fatalf("insert podcast_cache_state joined row: %v", err)
	}

	record, err := store.getPodcastRecord(context.Background(), "joined")
	require.NoError(t, err)
	require.NotNil(t, record, "record = nil, want joined podcast record")
	require.Equal(t, "Joined Show", record.Title)
	require.Equal(t, `["Business"]`, record.CategoriesJSON)
	require.Equal(t, base.Unix(), record.FeedLastUpdateTimeUnix)
	require.Equal(t, 1, record.StoredEpisodeCount)
	require.True(t, record.IsTruncated)
	require.Equal(t, base.Add(2*time.Hour).Unix(), record.LastSuccessfulFetchAt)
	require.Equal(t, base.Add(3*time.Hour).Unix(), record.RefreshNotBefore)
	require.Equal(t, 5, record.FetchFailCount)
	require.Equal(t, 8, record.Priority)
	require.Equal(t, int64(4096), record.ApproxBytes)
	require.Equal(t, base.Add(30*time.Minute).Unix(), record.LastAccessedAt)
}

func TestPIEpisodeCacheStoreDefaultBudgetConstants(t *testing.T) {
	require.Equal(t, 5000, piEpisodeCacheDefaultMaxPodcasts)
	require.Equal(t, int64(1073741824), piEpisodeCacheDefaultMaxApproxBytes)
}

func TestPIEpisodeCacheStoreEvictsByPriorityRecencyAndStableID(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	base := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)

	insertBudgetSnapshot(t, store, "priority-low-old", 0, base.Add(-4*time.Hour), 100)
	insertBudgetSnapshot(t, store, "priority-low-new", 0, base.Add(-1*time.Hour), 100)
	insertBudgetSnapshot(t, store, "priority-high-old", 10, base.Add(-5*time.Hour), 100)

	evicted, err := store.EvictPodcastsOverBudget(context.Background(), 2, -1, "")
	require.NoError(t, err)
	if !reflect.DeepEqual(evicted, []string{"priority-low-old"}) {
		t.Fatalf("evicted = %#v, want lowest priority oldest first", evicted)
	}

	assertPIBudgetPodcastExists(t, db, "priority-low-new")
	assertPIBudgetPodcastExists(t, db, "priority-high-old")
}

func TestPIEpisodeCacheStoreEvictsSamePriorityByOldestLastAccessed(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	base := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)

	insertBudgetSnapshot(t, store, "newer", 0, base.Add(-1*time.Hour), 100)
	insertBudgetSnapshot(t, store, "older", 0, base.Add(-2*time.Hour), 100)

	evicted, err := store.EvictPodcastsOverBudget(context.Background(), 1, -1, "")
	require.NoError(t, err)
	if !reflect.DeepEqual(evicted, []string{"older"}) {
		t.Fatalf("evicted = %#v, want oldest last_accessed_at first", evicted)
	}

	assertPIBudgetPodcastExists(t, db, "newer")
}

func TestPIEpisodeCacheStoreEvictsSameTimestampByPodcastItunesID(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	accessedAt := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)

	insertBudgetSnapshot(t, store, "b-podcast", 0, accessedAt, 100)
	insertBudgetSnapshot(t, store, "a-podcast", 0, accessedAt, 100)

	evicted, err := store.EvictPodcastsOverBudget(context.Background(), 1, -1, "")
	require.NoError(t, err)
	if !reflect.DeepEqual(evicted, []string{"a-podcast"}) {
		t.Fatalf("evicted = %#v, want stable podcast_itunes_id tie-break", evicted)
	}

	assertPIBudgetPodcastExists(t, db, "b-podcast")
}

func TestPIEpisodeCacheStoreEvictsByApproxBytesWithoutEvictingExcludedPodcast(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	base := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)

	insertBudgetSnapshot(t, store, "current", 0, base.Add(-3*time.Hour), 900)
	insertBudgetSnapshot(t, store, "victim", 0, base.Add(-2*time.Hour), 200)
	insertBudgetSnapshot(t, store, "survivor", 10, base.Add(-4*time.Hour), 100)

	evicted, err := store.EvictPodcastsOverBudget(context.Background(), -1, 1000, "current")
	require.NoError(t, err)
	if !reflect.DeepEqual(evicted, []string{"victim"}) {
		t.Fatalf("evicted = %#v, want non-excluded low-priority victim only", evicted)
	}

	assertPIBudgetPodcastExists(t, db, "current")
	assertPIBudgetPodcastExists(t, db, "survivor")
}

func TestPIEpisodeCacheStoreReplaceOpportunisticallyEvictsWithoutEvictingCurrentPodcast(t *testing.T) {
	db := openPIEpisodeCacheTestDB(t)
	store := NewPIEpisodeCacheStore(db)
	base := time.Date(2026, 5, 18, 8, 0, 0, 0, time.UTC)

	insertBudgetSnapshot(t, store, "111", 0, base.Add(-time.Hour), piEpisodeCacheDefaultMaxApproxBytes)

	current := piEpisodeCacheSnapshotFixture("222", []string{"current-episode"})
	current.Podcast.Priority = 0
	current.Podcast.LastAccessedAt = base.Add(-2 * time.Hour).Unix()
	current.Podcast.ApproxBytes = 1
	err := store.ReplacePodcastSnapshotTx(context.Background(), current)
	require.NoError(t, err)

	assertPIBudgetPodcastMissing(t, db, "111")
	assertPIBudgetPodcastExists(t, db, "222")
}

func insertBudgetSnapshot(t *testing.T, store *PIEpisodeCacheStore, podcastItunesID string, priority int, lastAccessedAt time.Time, approxBytes int64) {
	t.Helper()

	snapshot := piEpisodeCacheSnapshotFixture(podcastItunesID, []string{"episode-" + podcastItunesID})
	snapshot.Podcast.Priority = priority
	snapshot.Podcast.LastAccessedAt = lastAccessedAt.Unix()
	snapshot.Podcast.ApproxBytes = approxBytes
	err := store.ReplacePodcastSnapshotTx(context.Background(), snapshot)
	require.NoError(t, err)
}

func assertPIBudgetPodcastExists(t *testing.T, db *sql.DB, podcastItunesID string) {
	t.Helper()

	var count int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM podcast_shows WHERE podcast_itunes_id = ?",
		podcastItunesID,
	).Scan(&count); err != nil {
		t.Fatalf("query podcast %s: %v", podcastItunesID, err)
	}
	require.Equal(t, 1, count)
}

func assertPIBudgetPodcastMissing(t *testing.T, db *sql.DB, podcastItunesID string) {
	t.Helper()

	var count int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM podcast_shows WHERE podcast_itunes_id = ?",
		podcastItunesID,
	).Scan(&count); err != nil {
		t.Fatalf("query podcast %s: %v", podcastItunesID, err)
	}
	require.Equal(t, 0, count)
}

func assertSQLiteTableExists(t *testing.T, db *sql.DB, tableName string) {
	t.Helper()

	var count int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
		tableName,
	).Scan(&count); err != nil {
		t.Fatalf("query table %s: %v", tableName, err)
	}
	require.Equal(t, 1, count)
}

func assertSQLiteIndexExists(t *testing.T, db *sql.DB, tableName string, indexName string) {
	t.Helper()

	if !sqliteIndexExists(t, db, tableName, indexName) {
		t.Fatalf("index %s not found on %s", indexName, tableName)
	}
}

func assertSQLiteIndexMissing(t *testing.T, db *sql.DB, tableName string, indexName string) {
	t.Helper()

	if sqliteIndexExists(t, db, tableName, indexName) {
		t.Fatalf("index %s unexpectedly exists on %s", indexName, tableName)
	}
}

func sqliteIndexExists(t *testing.T, db *sql.DB, tableName string, indexName string) bool {
	t.Helper()

	rows, err := db.QueryContext(context.Background(), "PRAGMA index_list('"+tableName+"');")
	require.NoError(t, err)
	defer rows.Close()

	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		err := rows.Scan(&seq, &name, &unique, &origin, &partial)
		require.NoError(t, err)
		if name == indexName {
			return true
		}
	}
	err = rows.Err()
	require.NoError(t, err)
	return false
}

func assertSQLiteColumnExists(t *testing.T, db *sql.DB, tableName string, columnName string) {
	t.Helper()

	if !sqliteColumnExists(t, db, tableName, columnName) {
		t.Fatalf("column %s not found on %s", columnName, tableName)
	}
}

func assertSQLiteColumnMissing(t *testing.T, db *sql.DB, tableName string, columnName string) {
	t.Helper()

	if sqliteColumnExists(t, db, tableName, columnName) {
		t.Fatalf("column %s unexpectedly exists on %s", columnName, tableName)
	}
}

func sqliteColumnExists(t *testing.T, db *sql.DB, tableName string, columnName string) bool {
	t.Helper()

	rows, err := db.QueryContext(context.Background(), "PRAGMA table_info('"+tableName+"');")
	require.NoError(t, err)
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue any
		var pk int
		err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk)
		require.NoError(t, err)
		if name == columnName {
			return true
		}
	}
	err = rows.Err()
	require.NoError(t, err)
	return false
}
