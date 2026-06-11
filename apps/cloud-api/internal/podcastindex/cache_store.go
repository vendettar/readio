package podcastindex

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	cloudsqlc "readio-cloud/internal/db/sqlc"
)

const (
	piEpisodeCacheDefaultMaxPodcasts    = 5000
	piEpisodeCacheDefaultMaxApproxBytes = int64(1073741824)
)

type PIEpisodeCacheStore struct {
	db      *sql.DB
	queries *cloudsqlc.Queries
}

type PIEpisodeCacheSnapshot struct {
	Podcast  PIEpisodeCachePodcastRecord
	Episodes []PIEpisodeCacheEpisode
}

type PIEpisodeCachePodcastMetadata struct {
	PodcastItunesID        string
	Title                  string
	Description            string
	Author                 string
	Image                  string
	FeedURL                string
	Language               string
	CategoriesJSON         string
	EpisodeCountHint       int64
	FeedLastUpdateTimeUnix int64
	CreatedAtUnix          int64
	UpdatedAtUnix          int64
}

type PIEpisodeCachePodcastState struct {
	StoredEpisodeCount    int
	IsTruncated           bool
	LastSuccessfulFetchAt int64
	LastAttemptedFetchAt  int64
	RefreshNotBefore      int64
	FetchFailCount        int
	LastErrorClass        string
	ApproxBytes           int64
	Priority              int
	LastAccessedAt        int64
}

type PIEpisodeCachePodcastRecord struct {
	PIEpisodeCachePodcastMetadata
	PIEpisodeCachePodcastState
}

type PIEpisodeCacheEpisode struct {
	PodcastItunesID string
	EpisodeGUID     string
	Title           string
	Description     string
	EnclosureURL    string
	PublishedAtUnix int64
	DurationSeconds int64
	Image           string
	EpisodeNumber   *int64
	SeasonNumber    *int64
	EpisodeType     string
	Explicit        *bool
	Link            string
	EnclosureLength *int64
	TranscriptURL   string
	CreatedAtUnix   int64
	UpdatedAtUnix   int64
}

type PIEpisodeCachePage struct {
	Episodes              []PIEpisodeCacheEpisode
	Limit                 int
	Offset                int
	TotalCount            int
	IsTruncated           bool
	LastSuccessfulFetchAt int64
	RefreshNotBefore      int64
	CacheStatus           string
}

type PIEpisodeCacheRefreshState struct {
	PodcastItunesID       string
	StoredEpisodeCount    int
	IsTruncated           bool
	LastSuccessfulFetchAt int64
	LastAttemptedFetchAt  int64
	RefreshNotBefore      int64
	FetchFailCount        int
	LastErrorClass        string
}

func NewPIEpisodeCacheStore(db *sql.DB) *PIEpisodeCacheStore {
	if db == nil {
		return nil
	}
	return &PIEpisodeCacheStore{db: db, queries: cloudsqlc.New(db)}
}

func (s *PIEpisodeCacheStore) DB() *sql.DB {
	return s.db
}

func (s *PIEpisodeCacheStore) GetPodcastSnapshot(ctx context.Context, podcastItunesID string) (*PIEpisodeCacheSnapshot, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin pi cache snapshot read: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	txq := s.queries.WithTx(tx)

	podcast, err := getPodcastRecordWithQueries(ctx, txq, podcastID)
	if err != nil {
		return nil, err
	}
	if podcast == nil {
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit pi cache snapshot read: %w", err)
		}
		committed = true
		return nil, nil
	}

	episodes, err := listEpisodesWithQueries(ctx, txq, podcastID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit pi cache snapshot read: %w", err)
	}
	committed = true

	return &PIEpisodeCacheSnapshot{
		Podcast:  *podcast,
		Episodes: episodes,
	}, nil
}

func (s *PIEpisodeCacheStore) GetPodcastMetadata(ctx context.Context, podcastItunesID string) (*PIEpisodeCachePodcastMetadata, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return nil, err
	}

	return s.getPodcastMetadata(ctx, podcastID)
}

func (s *PIEpisodeCacheStore) GetEpisodePage(ctx context.Context, podcastItunesID string, limit int, offset int) (*PIEpisodeCachePage, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}
	if limit < 0 {
		return nil, errors.New("limit must be non-negative")
	}
	if offset < 0 {
		return nil, errors.New("offset must be non-negative")
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin pi cache episode page read: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	txq := s.queries.WithTx(tx)

	metadata, err := txq.GetPIEpisodePageMetadata(ctx, podcastID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query pi cache episode page metadata: %w", err)
	}

	page := &PIEpisodeCachePage{
		Limit:                 limit,
		Offset:                offset,
		TotalCount:            int(metadata.TotalCount),
		IsTruncated:           metadata.IsTruncated != 0,
		LastSuccessfulFetchAt: metadata.LastSuccessfulFetchAtUnix,
		RefreshNotBefore:      metadata.RefreshNotBeforeUnix,
	}
	if limit == 0 {
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit pi cache episode page read: %w", err)
		}
		committed = true
		return page, nil
	}

	rows, err := txq.ListPIEpisodesPage(ctx, cloudsqlc.ListPIEpisodesPageParams{
		PodcastItunesID: podcastID,
		Limit:           int64(limit),
		Offset:          int64(offset),
	})
	if err != nil {
		return nil, fmt.Errorf("query pi cache episode page: %w", err)
	}
	page.Episodes = piEpisodeCacheEpisodesFromSQLC(rows)
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit pi cache episode page read: %w", err)
	}
	committed = true
	return page, nil
}

func (s *PIEpisodeCacheStore) GetEpisodeByGuid(ctx context.Context, podcastItunesID string, episodeGUID string) (*PIEpisodeCacheEpisode, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return nil, err
	}
	guid, err := normalizePIEpisodeCacheRequired("episode_guid", episodeGUID)
	if err != nil {
		return nil, err
	}

	row, err := s.queries.GetPIEpisodeByGuid(ctx, cloudsqlc.GetPIEpisodeByGuidParams{
		PodcastItunesID: podcastID,
		EpisodeGuid:     guid,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query pi cache episode by guid: %w", err)
	}
	episode := piEpisodeCacheEpisodeFromSQLC(row)
	return episode, nil
}

func (s *PIEpisodeCacheStore) GetNewestEpisodePublishedAtUnix(ctx context.Context, podcastItunesID string) (int64, error) {
	if err := s.requireDB(); err != nil {
		return 0, err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return 0, err
	}

	newest, err := s.queries.GetPINewestEpisodePublishedAtUnix(ctx, podcastID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, fmt.Errorf("query pi cache newest episode published_at_unix: %w", err)
	}
	return newest, nil
}

func (s *PIEpisodeCacheStore) GetRefreshState(ctx context.Context, podcastItunesID string) (*PIEpisodeCacheRefreshState, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return nil, err
	}

	row, err := s.queries.GetPIRefreshState(ctx, podcastID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query pi cache refresh state: %w", err)
	}
	return piEpisodeCacheRefreshStateFromSQLC(row), nil
}

func (s *PIEpisodeCacheStore) ReplacePodcastSnapshotTx(ctx context.Context, snapshot PIEpisodeCacheSnapshot) error {
	if err := s.requireDB(); err != nil {
		return err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", snapshot.Podcast.PodcastItunesID)
	if err != nil {
		return err
	}

	for _, episode := range snapshot.Episodes {
		episodePodcastID, err := normalizePIEpisodeCacheRequired("episode podcast_itunes_id", episode.PodcastItunesID)
		if err != nil {
			return err
		}
		if episodePodcastID != podcastID {
			return fmt.Errorf("episode podcast_itunes_id %q does not match podcast %q", episodePodcastID, podcastID)
		}
		if _, err := normalizePIEpisodeCacheRequired("episode_guid", episode.EpisodeGUID); err != nil {
			return err
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin pi cache snapshot replace: %w", err)
	}

	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	txq := s.queries.WithTx(tx)

	podcast := snapshot.Podcast
	podcast.PodcastItunesID = podcastID
	podcast.StoredEpisodeCount = len(snapshot.Episodes)

	if err := txq.UpsertPIPodcastShow(ctx, piEpisodeCachePodcastShowParams(podcast.PIEpisodeCachePodcastMetadata)); err != nil {
		return fmt.Errorf("upsert pi cache podcast: %w", err)
	}

	if err := txq.DeletePIEpisodesForPodcast(ctx, podcastID); err != nil {
		return fmt.Errorf("delete previous pi cache episodes: %w", err)
	}

	for _, episode := range snapshot.Episodes {
		if err := txq.InsertPIEpisode(ctx, piEpisodeCacheInsertEpisodeParams(podcastID, episode)); err != nil {
			return fmt.Errorf("insert pi cache episode %q: %w", episode.EpisodeGUID, err)
		}
	}

	if err := txq.UpsertPIFullCacheState(ctx, piEpisodeCacheFullStateParams(podcast)); err != nil {
		return fmt.Errorf("upsert pi cache state: %w", err)
	}

	if _, err := evictPodcastsOverBudgetTx(ctx, tx, piEpisodeCacheDefaultMaxPodcasts, piEpisodeCacheDefaultMaxApproxBytes, podcastID); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit pi cache snapshot replace: %w", err)
	}
	committed = true
	return nil
}

type ApplyPodcastIncrementalRefreshParams struct {
	Snapshot               PIPodcastSnapshot
	WasPreviouslyTruncated bool
}

func (s *PIEpisodeCacheStore) ApplyPodcastIncrementalRefreshTx(ctx context.Context, params ApplyPodcastIncrementalRefreshParams) error {
	if err := s.requireDB(); err != nil {
		return err
	}

	cacheSnapshot := params.Snapshot.toEpisodeCacheSnapshot()
	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", cacheSnapshot.Podcast.PodcastItunesID)
	if err != nil {
		return err
	}

	for _, episode := range cacheSnapshot.Episodes {
		episodePodcastID, err := normalizePIEpisodeCacheRequired("episode podcast_itunes_id", episode.PodcastItunesID)
		if err != nil {
			return err
		}
		if episodePodcastID != podcastID {
			return fmt.Errorf("episode podcast_itunes_id %q does not match podcast %q", episodePodcastID, podcastID)
		}
		if _, err := normalizePIEpisodeCacheRequired("episode_guid", episode.EpisodeGUID); err != nil {
			return err
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin pi cache incremental refresh: %w", err)
	}

	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	txq := s.queries.WithTx(tx)

	podcast := cacheSnapshot.Podcast
	podcast.PodcastItunesID = podcastID

	if err := txq.UpsertPIPodcastShow(ctx, piEpisodeCachePodcastShowParams(podcast.PIEpisodeCachePodcastMetadata)); err != nil {
		return fmt.Errorf("upsert pi cache podcast: %w", err)
	}

	for _, episode := range cacheSnapshot.Episodes {
		if err := txq.UpsertPIEpisode(ctx, piEpisodeCacheUpsertEpisodeParams(podcastID, episode)); err != nil {
			return fmt.Errorf("upsert pi cache episode %q: %w", episode.EpisodeGUID, err)
		}
	}

	if err := prunePIEpisodeCacheRetentionTx(ctx, tx, podcastID, PISnapshotMaxEpisodesPerPodcast); err != nil {
		return err
	}
	if err := upsertPIEpisodeCacheIncrementalStateTx(ctx, tx, podcast, params.WasPreviouslyTruncated); err != nil {
		return err
	}

	if _, err := evictPodcastsOverBudgetTx(ctx, tx, piEpisodeCacheDefaultMaxPodcasts, piEpisodeCacheDefaultMaxApproxBytes, podcastID); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit pi cache incremental refresh: %w", err)
	}
	committed = true
	return nil
}

func (s *PIEpisodeCacheStore) MarkRefreshFailure(
	ctx context.Context,
	podcastItunesID string,
	attemptedAt int64,
	refreshNotBefore int64,
	fetchFailCount int,
	lastErrorClass string,
) error {
	if err := s.requireDB(); err != nil {
		return err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return err
	}

	if err := s.queries.MarkPIRefreshFailure(ctx, cloudsqlc.MarkPIRefreshFailureParams{
		LastAttemptedFetchAtUnix: attemptedAt,
		RefreshNotBeforeUnix:     refreshNotBefore,
		FetchFailCount:           int64(fetchFailCount),
		LastErrorClass:           sqlNullStringIfEmpty(lastErrorClass),
		PodcastItunesID:          podcastID,
	}); err != nil {
		return fmt.Errorf("mark pi cache refresh failure: %w", err)
	}
	return nil
}

func (s *PIEpisodeCacheStore) TouchPodcastAccess(ctx context.Context, podcastItunesID string, accessedAt int64) error {
	if err := s.requireDB(); err != nil {
		return err
	}

	podcastID, err := normalizePIEpisodeCacheRequired("podcast_itunes_id", podcastItunesID)
	if err != nil {
		return err
	}

	if err := s.queries.TouchPIPodcastAccess(ctx, cloudsqlc.TouchPIPodcastAccessParams{
		LastAccessedAtUnix: accessedAt,
		PodcastItunesID:    podcastID,
	}); err != nil {
		return fmt.Errorf("touch pi cache podcast access: %w", err)
	}
	return nil
}

func (s *PIEpisodeCacheStore) EvictPodcastsOverBudget(ctx context.Context, maxPodcasts int, maxApproxBytes int64, excludePodcastItunesID string) ([]string, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}
	if maxPodcasts < 0 && maxApproxBytes < 0 {
		return nil, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin pi cache eviction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	evictParams, err := evictPodcastsOverBudgetTx(ctx, tx, maxPodcasts, maxApproxBytes, excludePodcastItunesID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit pi cache eviction: %w", err)
	}
	committed = true
	return evictParams, nil
}

func evictPodcastsOverBudgetTx(
	ctx context.Context,
	tx *sql.Tx,
	maxPodcasts int,
	maxApproxBytes int64,
	excludePodcastItunesID string,
) ([]string, error) {
	if maxPodcasts < 0 && maxApproxBytes < 0 {
		return nil, nil
	}

	excludeID := strings.TrimSpace(excludePodcastItunesID)

	type evictionCandidate struct {
		podcastItunesID string
		approxBytes     int64
	}

	txq := cloudsqlc.New(tx)
	rows, err := txq.ListPIEvictionCandidates(ctx)
	if err != nil {
		return nil, fmt.Errorf("query pi cache eviction candidates: %w", err)
	}

	candidates := make([]evictionCandidate, 0, len(rows))
	var totalBytes int64
	podcastCount := len(rows)
	for _, row := range rows {
		totalBytes += row.ApproxBytes
		if excludeID != "" && row.PodcastItunesID == excludeID {
			continue
		}
		candidates = append(candidates, evictionCandidate{
			podcastItunesID: row.PodcastItunesID,
			approxBytes:     row.ApproxBytes,
		})
	}

	evicted := make([]string, 0)
	for _, candidate := range candidates {
		overPodcastBudget := maxPodcasts >= 0 && podcastCount > maxPodcasts
		overByteBudget := maxApproxBytes >= 0 && totalBytes > maxApproxBytes
		if !overPodcastBudget && !overByteBudget {
			break
		}

		if err := txq.DeletePIPodcastShow(ctx, candidate.podcastItunesID); err != nil {
			return nil, fmt.Errorf("evict pi cache podcast %q: %w", candidate.podcastItunesID, err)
		}
		evicted = append(evicted, candidate.podcastItunesID)
		podcastCount--
		totalBytes -= candidate.approxBytes
	}
	if len(evicted) > 0 {
		slog.DebugContext(ctx, "pi episode cache budget eviction", "count", len(evicted))
	}
	return evicted, nil
}

func prunePIEpisodeCacheRetentionTx(ctx context.Context, tx *sql.Tx, podcastID string, maxEpisodes int) error {
	if maxEpisodes < 0 {
		return nil
	}
	if _, err := tx.ExecContext(
		ctx,
		`WITH ranked AS (
			SELECT
				episode_guid,
				ROW_NUMBER() OVER (
					ORDER BY published_at_unix DESC, episode_guid ASC
				) AS row_num
			FROM podcast_episodes
			WHERE podcast_itunes_id = ?
		)
		DELETE FROM podcast_episodes
		WHERE podcast_itunes_id = ?
			AND episode_guid IN (
				SELECT episode_guid FROM ranked WHERE row_num > ?
			)`,
		podcastID,
		podcastID,
		maxEpisodes,
	); err != nil {
		return fmt.Errorf("prune pi cache episode retention: %w", err)
	}
	return nil
}

func upsertPIEpisodeCacheIncrementalStateTx(ctx context.Context, tx *sql.Tx, podcast PIEpisodeCachePodcastRecord, previouslyTruncated bool) error {
	podcastID := podcast.PodcastItunesID
	txq := cloudsqlc.New(tx)
	if err := txq.UpsertPIIncrementalCacheState(ctx, cloudsqlc.UpsertPIIncrementalCacheStateParams{
		PodcastItunesID:           podcastID,
		PreviouslyTruncated:       int64(boolToSQLiteInt(previouslyTruncated)),
		EpisodeCountHint:          podcast.EpisodeCountHint,
		LastSuccessfulFetchAtUnix: podcast.LastSuccessfulFetchAt,
		LastAttemptedFetchAtUnix:  podcast.LastAttemptedFetchAt,
		RefreshNotBeforeUnix:      podcast.RefreshNotBefore,
		Priority:                  int64(podcast.Priority),
		LastAccessedAtUnix:        podcast.LastAccessedAt,
	}); err != nil {
		return fmt.Errorf("upsert pi cache incremental state: %w", err)
	}

	if err := txq.UpdatePIApproxBytes(ctx, cloudsqlc.UpdatePIApproxBytesParams{
		PodcastRowOverhead: int64(PISnapshotPodcastRowOverhead),
		EpisodeRowOverhead: int64(PISnapshotEpisodeRowOverhead),
		PodcastItunesID:    podcastID,
	}); err != nil {
		return fmt.Errorf("update pi cache incremental approx bytes: %w", err)
	}
	return nil
}

func (s *PIEpisodeCacheStore) requireDB() error {
	if s == nil || s.db == nil {
		return errors.New("pi episode cache store requires a sqlite db")
	}
	if s.queries == nil {
		s.queries = cloudsqlc.New(s.db)
	}
	return nil
}

func (s *PIEpisodeCacheStore) getPodcastMetadata(ctx context.Context, podcastItunesID string) (*PIEpisodeCachePodcastMetadata, error) {
	row, err := s.queries.GetPIPodcastMetadata(ctx, podcastItunesID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query pi cache podcast metadata: %w", err)
	}
	podcast := piEpisodeCachePodcastMetadataFromSQLC(row)
	return podcast, nil
}

func (s *PIEpisodeCacheStore) getPodcastRecord(ctx context.Context, podcastItunesID string) (*PIEpisodeCachePodcastRecord, error) {
	return getPodcastRecordWithQueries(ctx, s.queries, podcastItunesID)
}

func getPodcastRecordWithQueries(ctx context.Context, queries *cloudsqlc.Queries, podcastItunesID string) (*PIEpisodeCachePodcastRecord, error) {
	row, err := queries.GetPIPodcastRecord(ctx, podcastItunesID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query pi cache podcast record: %w", err)
	}
	podcast := piEpisodeCachePodcastRecordFromSQLC(row)
	return podcast, nil
}

func listEpisodesWithQueries(ctx context.Context, queries *cloudsqlc.Queries, podcastItunesID string) ([]PIEpisodeCacheEpisode, error) {
	rows, err := queries.ListPIEpisodes(ctx, podcastItunesID)
	if err != nil {
		return nil, fmt.Errorf("query pi cache episodes: %w", err)
	}
	return piEpisodeCacheEpisodesFromSQLC(rows), nil
}

func piEpisodeCachePodcastShowParams(podcast PIEpisodeCachePodcastMetadata) cloudsqlc.UpsertPIPodcastShowParams {
	return cloudsqlc.UpsertPIPodcastShowParams{
		PodcastItunesID:        podcast.PodcastItunesID,
		Title:                  podcast.Title,
		Description:            podcast.Description,
		Author:                 sqlNullStringIfEmpty(podcast.Author),
		Image:                  sqlNullStringIfEmpty(podcast.Image),
		FeedUrl:                sqlNullStringIfEmpty(podcast.FeedURL),
		Language:               sqlNullStringIfEmpty(podcast.Language),
		CategoriesJson:         sqlNullStringIfEmpty(podcast.CategoriesJSON),
		EpisodeCountHint:       sqlNullInt64(podcast.EpisodeCountHint),
		FeedLastUpdateTimeUnix: podcast.FeedLastUpdateTimeUnix,
		CreatedAtUnix:          podcast.CreatedAtUnix,
		UpdatedAtUnix:          podcast.UpdatedAtUnix,
	}
}

func piEpisodeCacheInsertEpisodeParams(podcastID string, episode PIEpisodeCacheEpisode) cloudsqlc.InsertPIEpisodeParams {
	return cloudsqlc.InsertPIEpisodeParams{
		PodcastItunesID: podcastID,
		EpisodeGuid:     strings.TrimSpace(episode.EpisodeGUID),
		Title:           episode.Title,
		Description:     episode.Description,
		EnclosureUrl:    episode.EnclosureURL,
		PublishedAtUnix: episode.PublishedAtUnix,
		DurationSeconds: episode.DurationSeconds,
		Image:           sqlNullStringIfEmpty(episode.Image),
		EpisodeNumber:   sqlNullInt64Ptr(episode.EpisodeNumber),
		SeasonNumber:    sqlNullInt64Ptr(episode.SeasonNumber),
		EpisodeType:     sqlNullStringIfEmpty(episode.EpisodeType),
		Explicit:        sqlNullBoolPtr(episode.Explicit),
		Link:            sqlNullStringIfEmpty(episode.Link),
		EnclosureLength: sqlNullInt64Ptr(episode.EnclosureLength),
		TranscriptUrl:   sqlNullStringIfEmpty(episode.TranscriptURL),
		CreatedAtUnix:   episode.CreatedAtUnix,
		UpdatedAtUnix:   episode.UpdatedAtUnix,
	}
}

func piEpisodeCacheUpsertEpisodeParams(podcastID string, episode PIEpisodeCacheEpisode) cloudsqlc.UpsertPIEpisodeParams {
	insertParams := piEpisodeCacheInsertEpisodeParams(podcastID, episode)
	return cloudsqlc.UpsertPIEpisodeParams(insertParams)
}

func piEpisodeCacheFullStateParams(podcast PIEpisodeCachePodcastRecord) cloudsqlc.UpsertPIFullCacheStateParams {
	return cloudsqlc.UpsertPIFullCacheStateParams{
		PodcastItunesID:           podcast.PodcastItunesID,
		IsTruncated:               int64(boolToSQLiteInt(podcast.IsTruncated)),
		LastSuccessfulFetchAtUnix: podcast.LastSuccessfulFetchAt,
		LastAttemptedFetchAtUnix:  podcast.LastAttemptedFetchAt,
		RefreshNotBeforeUnix:      podcast.RefreshNotBefore,
		FetchFailCount:            int64(podcast.FetchFailCount),
		LastErrorClass:            sqlNullStringIfEmpty(podcast.LastErrorClass),
		ApproxBytes:               podcast.ApproxBytes,
		Priority:                  int64(podcast.Priority),
		LastAccessedAtUnix:        podcast.LastAccessedAt,
	}
}

func piEpisodeCachePodcastMetadataFromSQLC(row cloudsqlc.GetPIPodcastMetadataRow) *PIEpisodeCachePodcastMetadata {
	return &PIEpisodeCachePodcastMetadata{
		PodcastItunesID:        row.PodcastItunesID,
		Title:                  row.Title,
		Description:            row.Description,
		Author:                 row.Author,
		Image:                  row.Image,
		FeedURL:                row.FeedUrl,
		Language:               row.Language,
		CategoriesJSON:         row.CategoriesJson,
		EpisodeCountHint:       row.EpisodeCountHint,
		FeedLastUpdateTimeUnix: row.FeedLastUpdateTimeUnix,
		CreatedAtUnix:          row.CreatedAtUnix,
		UpdatedAtUnix:          row.UpdatedAtUnix,
	}
}

func piEpisodeCachePodcastRecordFromSQLC(row cloudsqlc.GetPIPodcastRecordRow) *PIEpisodeCachePodcastRecord {
	return &PIEpisodeCachePodcastRecord{
		PIEpisodeCachePodcastMetadata: PIEpisodeCachePodcastMetadata{
			PodcastItunesID:        row.PodcastItunesID,
			Title:                  row.Title,
			Description:            row.Description,
			Author:                 row.Author,
			Image:                  row.Image,
			FeedURL:                row.FeedUrl,
			Language:               row.Language,
			CategoriesJSON:         row.CategoriesJson,
			EpisodeCountHint:       row.EpisodeCountHint,
			FeedLastUpdateTimeUnix: row.FeedLastUpdateTimeUnix,
			CreatedAtUnix:          row.CreatedAtUnix,
			UpdatedAtUnix:          row.UpdatedAtUnix,
		},
		PIEpisodeCachePodcastState: PIEpisodeCachePodcastState{
			StoredEpisodeCount:    int(row.StoredEpisodeCount),
			IsTruncated:           row.IsTruncated != 0,
			LastSuccessfulFetchAt: row.LastSuccessfulFetchAtUnix,
			LastAttemptedFetchAt:  row.LastAttemptedFetchAtUnix,
			RefreshNotBefore:      row.RefreshNotBeforeUnix,
			FetchFailCount:        int(row.FetchFailCount),
			LastErrorClass:        row.LastErrorClass,
			ApproxBytes:           row.ApproxBytes,
			Priority:              int(row.Priority),
			LastAccessedAt:        row.LastAccessedAtUnix,
		},
	}
}

func piEpisodeCacheRefreshStateFromSQLC(row cloudsqlc.GetPIRefreshStateRow) *PIEpisodeCacheRefreshState {
	return &PIEpisodeCacheRefreshState{
		PodcastItunesID:       row.PodcastItunesID,
		StoredEpisodeCount:    int(row.StoredEpisodeCount),
		IsTruncated:           row.IsTruncated != 0,
		LastSuccessfulFetchAt: row.LastSuccessfulFetchAtUnix,
		LastAttemptedFetchAt:  row.LastAttemptedFetchAtUnix,
		RefreshNotBefore:      row.RefreshNotBeforeUnix,
		FetchFailCount:        int(row.FetchFailCount),
		LastErrorClass:        row.LastErrorClass,
	}
}

func piEpisodeCacheEpisodesFromSQLC(rows []cloudsqlc.PodcastEpisode) []PIEpisodeCacheEpisode {
	episodes := make([]PIEpisodeCacheEpisode, 0, len(rows))
	for _, row := range rows {
		episodes = append(episodes, *piEpisodeCacheEpisodeFromSQLC(row))
	}
	return episodes
}

func piEpisodeCacheEpisodeFromSQLC(row cloudsqlc.PodcastEpisode) *PIEpisodeCacheEpisode {
	return &PIEpisodeCacheEpisode{
		PodcastItunesID: row.PodcastItunesID,
		EpisodeGUID:     row.EpisodeGuid,
		Title:           row.Title,
		Description:     row.Description,
		EnclosureURL:    row.EnclosureUrl,
		PublishedAtUnix: row.PublishedAtUnix,
		DurationSeconds: row.DurationSeconds,
		Image:           stringFromNull(row.Image),
		EpisodeNumber:   int64PtrFromNull(row.EpisodeNumber),
		SeasonNumber:    int64PtrFromNull(row.SeasonNumber),
		EpisodeType:     stringFromNull(row.EpisodeType),
		Explicit:        boolPtrFromNull(row.Explicit),
		Link:            stringFromNull(row.Link),
		EnclosureLength: int64PtrFromNull(row.EnclosureLength),
		TranscriptURL:   stringFromNull(row.TranscriptUrl),
		CreatedAtUnix:   row.CreatedAtUnix,
		UpdatedAtUnix:   row.UpdatedAtUnix,
	}
}

func normalizePIEpisodeCacheRequired(field string, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	return trimmed, nil
}

func boolToSQLiteInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func sqlNullStringIfEmpty(value string) sql.NullString {
	if strings.TrimSpace(value) == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}

func sqlNullInt64(value int64) sql.NullInt64 {
	return sql.NullInt64{Int64: value, Valid: true}
}

func sqlNullInt64Ptr(value *int64) sql.NullInt64 {
	if value == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *value, Valid: true}
}

func sqlNullBoolPtr(value *bool) sql.NullInt64 {
	if value == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(boolToSQLiteInt(*value)), Valid: true}
}

func stringFromNull(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func int64PtrFromNull(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	return &value.Int64
}

func boolPtrFromNull(value sql.NullInt64) *bool {
	if !value.Valid {
		return nil
	}
	result := value.Int64 != 0
	return &result
}
