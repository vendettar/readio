package podcastindex

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

var ErrPIEpisodeReadPathEpisodeNotFound = errors.New("pi episode read path episode not found")

type PIEpisodePodcastMetadataReadResult struct {
	Podcast     *PIEpisodeCachePodcastMetadata
	CacheStatus string
}

type PIEpisodeDetailReadResult struct {
	Episode     *PIEpisodeCacheEpisode
	CacheStatus string
}

type PIEpisodeTargetedReadState struct {
	PodcastID   string
	CanRead     bool
	CacheStatus string
	Snapshot    *PIEpisodeCacheSnapshot
}

type PIEpisodeReadPathService struct {
	store   PIEpisodeReadPathStore
	refresh PIEpisodeReadPathRefresh
	now     func() time.Time
}

type PIEpisodeReadPathStore interface {
	GetRefreshState(context.Context, string) (*PIEpisodeCacheRefreshState, error)
	GetPodcastMetadata(context.Context, string) (*PIEpisodeCachePodcastMetadata, error)
	GetEpisodePage(context.Context, string, int, int) (*PIEpisodeCachePage, error)
	GetEpisodeByGuid(context.Context, string, string) (*PIEpisodeCacheEpisode, error)
	TouchPodcastAccess(context.Context, string, int64) error
}

type PIEpisodeReadPathRefresh interface {
	EnsureSnapshot(context.Context, string) (*PIEpisodeRefreshResult, error)
}

func NewPIEpisodeReadPathService(store PIEpisodeReadPathStore, refresh PIEpisodeReadPathRefresh) *PIEpisodeReadPathService {
	return &PIEpisodeReadPathService{
		store:   store,
		refresh: refresh,
		now:     time.Now,
	}
}

func (s *PIEpisodeReadPathService) ReadSnapshot(ctx context.Context, podcastItunesID string) (*PIEpisodeCacheSnapshot, error) {
	snapshot, err := s.ensureSnapshot(ctx, podcastItunesID)
	if err != nil {
		return nil, err
	}
	if snapshot == nil {
		return nil, nil
	}

	accessedAt := s.accessedAt()
	if err := s.store.TouchPodcastAccess(ctx, snapshot.Podcast.PodcastItunesID, accessedAt); err != nil {
		slog.WarnContext(ctx, "pi episode cache access touch failed",
			"podcast_itunes_id", snapshot.Podcast.PodcastItunesID,
			"read_path", "snapshot",
			"error", err,
		)
	} else {
		snapshot.Podcast.LastAccessedAt = accessedAt
	}
	return snapshot, nil
}

func (s *PIEpisodeReadPathService) ReadPodcastMetadata(ctx context.Context, podcastItunesID string) (*PIEpisodePodcastMetadataReadResult, error) {
	podcastID, err := normalizeItunesID(podcastItunesID)
	if err != nil {
		return nil, err
	}

	readState, err := s.ensureStoredForTargetedRead(ctx, podcastID)
	if err != nil {
		return nil, err
	}
	if !readState.CanRead {
		return nil, nil
	}
	if readState.shouldUseSnapshotFallback() {
		podcast := piEpisodePodcastFromSnapshot(readState.Snapshot)
		if podcast == nil {
			return nil, nil
		}
		return &PIEpisodePodcastMetadataReadResult{
			Podcast:     podcast,
			CacheStatus: readState.CacheStatus,
		}, nil
	}

	podcast, err := s.store.GetPodcastMetadata(ctx, readState.PodcastID)
	if err != nil {
		return nil, err
	}
	if podcast == nil {
		podcast = piEpisodePodcastFromSnapshot(readState.Snapshot)
	}
	if podcast == nil {
		return nil, nil
	}

	s.touchPodcastAccess(ctx, podcast.PodcastItunesID, "podcast_metadata")
	return &PIEpisodePodcastMetadataReadResult{
		Podcast:     podcast,
		CacheStatus: readState.CacheStatus,
	}, nil
}

func (s *PIEpisodeReadPathService) ReadEpisodePage(ctx context.Context, podcastItunesID string, limit int, offset int) (*PIEpisodeCachePage, error) {
	if err := s.requireDependencies(); err != nil {
		return nil, err
	}

	podcastID, err := normalizeItunesID(podcastItunesID)
	if err != nil {
		return nil, err
	}

	state, err := s.store.GetRefreshState(ctx, podcastID)
	if err != nil {
		return nil, err
	}

	if state != nil {
		page, err := s.store.GetEpisodePage(ctx, state.PodcastItunesID, limit, offset)
		if err != nil {
			slog.ErrorContext(ctx, "pi episode page sqlite read failed",
				"podcast_itunes_id", state.PodcastItunesID,
				"limit", limit,
				"offset", offset,
				"error", err,
			)
			return nil, err
		}
		if page == nil {
			return nil, nil
		}
		s.touchPodcastAccess(ctx, state.PodcastItunesID, "episode_page")
		cacheStatus := CacheStatusStaleFallback
		if isPIEpisodeCacheRefreshStateFresh(state, s.nowUTC()) {
			cacheStatus = CacheStatusFreshHit
		}
		page.CacheStatus = cacheStatus
		return page, nil
	}

	result, err := s.refresh.EnsureSnapshot(ctx, podcastID)
	if err != nil {
		return nil, err
	}
	if result == nil || result.Snapshot == nil {
		return nil, nil
	}
	page := piEpisodePageFromSnapshot(result.Snapshot, limit, offset)
	if page == nil {
		return nil, nil
	}
	page.CacheStatus = result.CacheStatus
	return page, nil
}

func (s *PIEpisodeReadPathService) ReadEpisodeDetail(ctx context.Context, podcastItunesID string, episodeGUID string) (*PIEpisodeDetailReadResult, error) {
	if err := s.requireDependencies(); err != nil {
		return nil, err
	}

	podcastID, err := normalizeItunesID(podcastItunesID)
	if err != nil {
		return nil, err
	}
	guid, err := normalizePIEpisodeCacheRequired("episode_guid", episodeGUID)
	if err != nil {
		return nil, err
	}

	state, err := s.store.GetRefreshState(ctx, podcastID)
	if err != nil {
		slog.ErrorContext(ctx, "pi episode detail refresh state read failed",
			"podcast_itunes_id", podcastID,
			"episode_guid", guid,
			"error", err,
		)
		return nil, err
	}
	if state == nil {
		return &PIEpisodeDetailReadResult{CacheStatus: CacheStatusMissError}, fmt.Errorf("%w: podcast_itunes_id=%q episode_guid=%q", ErrPIEpisodeReadPathEpisodeNotFound, podcastID, guid)
	}

	episode, err := s.store.GetEpisodeByGuid(ctx, podcastID, guid)
	if err != nil {
		slog.ErrorContext(ctx, "pi episode detail sqlite read failed",
			"podcast_itunes_id", podcastID,
			"episode_guid", guid,
			"error", err,
		)
		return nil, err
	}
	if episode == nil {
		return &PIEpisodeDetailReadResult{CacheStatus: episodeDetailCacheStatus(state, s.nowUTC())}, fmt.Errorf("%w: podcast_itunes_id=%q episode_guid=%q", ErrPIEpisodeReadPathEpisodeNotFound, podcastID, guid)
	}
	s.touchPodcastAccess(ctx, podcastID, "episode_detail")
	return &PIEpisodeDetailReadResult{
		Episode:     episode,
		CacheStatus: episodeDetailCacheStatus(state, s.nowUTC()),
	}, nil
}

func (s *PIEpisodeReadPathService) ensureSnapshot(ctx context.Context, podcastItunesID string) (*PIEpisodeCacheSnapshot, error) {
	if err := s.requireDependencies(); err != nil {
		return nil, err
	}

	result, err := s.refresh.EnsureSnapshot(ctx, podcastItunesID)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	return result.Snapshot, nil
}

func (s *PIEpisodeTargetedReadState) shouldUseSnapshotFallback() bool {
	return s != nil && s.CacheStatus == CacheStatusPersistenceFallback && s.Snapshot != nil
}

func (s *PIEpisodeReadPathService) ensureStoredForTargetedRead(ctx context.Context, podcastItunesID string) (*PIEpisodeTargetedReadState, error) {
	if err := s.requireDependencies(); err != nil {
		return nil, err
	}

	podcastID, err := normalizeItunesID(podcastItunesID)
	if err != nil {
		return nil, err
	}

	state, err := s.store.GetRefreshState(ctx, podcastID)
	if err != nil {
		// Proceed to fallback when DB is down or refresh state query fails
		result, errFallback := s.refresh.EnsureSnapshot(ctx, podcastID)
		if errFallback != nil {
			return nil, errFallback
		}
		if result == nil || result.Snapshot == nil {
			return &PIEpisodeTargetedReadState{PodcastID: podcastID, CanRead: false, CacheStatus: CacheStatusMissError}, nil
		}
		return &PIEpisodeTargetedReadState{
			PodcastID:   result.Snapshot.Podcast.PodcastItunesID,
			CanRead:     true,
			CacheStatus: result.CacheStatus,
			Snapshot:    result.Snapshot,
		}, nil
	}

	now := s.nowUTC()
	if isPIEpisodeCacheRefreshStateFresh(state, now) || isPIEpisodeCacheRefreshStateInRetryBackoff(state, now) {
		cacheStatus := CacheStatusFreshHit
		if isPIEpisodeCacheRefreshStateInRetryBackoff(state, now) {
			cacheStatus = CacheStatusStaleFallback
		}
		return &PIEpisodeTargetedReadState{PodcastID: state.PodcastItunesID, CanRead: true, CacheStatus: cacheStatus}, nil
	}

	result, err := s.refresh.EnsureSnapshot(ctx, podcastID)
	if err != nil {
		return nil, err
	}
	if result == nil || result.Snapshot == nil {
		return &PIEpisodeTargetedReadState{PodcastID: podcastID, CanRead: false, CacheStatus: CacheStatusMissError}, nil
	}
	return &PIEpisodeTargetedReadState{
		PodcastID:   result.Snapshot.Podcast.PodcastItunesID,
		CanRead:     true,
		CacheStatus: result.CacheStatus,
		Snapshot:    result.Snapshot,
	}, nil
}

func piEpisodePodcastFromSnapshot(snapshot *PIEpisodeCacheSnapshot) *PIEpisodeCachePodcastMetadata {
	if snapshot == nil {
		return nil
	}
	podcast := snapshot.Podcast.PIEpisodeCachePodcastMetadata
	return &podcast
}

func piEpisodePageFromSnapshot(snapshot *PIEpisodeCacheSnapshot, limit int, offset int) *PIEpisodeCachePage {
	if snapshot == nil {
		return nil
	}
	total := len(snapshot.Episodes)
	start := offset
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}
	episodes := append([]PIEpisodeCacheEpisode(nil), snapshot.Episodes[start:end]...)
	return &PIEpisodeCachePage{
		Episodes:              episodes,
		Limit:                 limit,
		Offset:                offset,
		TotalCount:            total,
		IsTruncated:           snapshot.Podcast.IsTruncated,
		LastSuccessfulFetchAt: snapshot.Podcast.LastSuccessfulFetchAt,
		RefreshNotBefore:      snapshot.Podcast.RefreshNotBefore,
	}
}

func episodeDetailCacheStatus(state *PIEpisodeCacheRefreshState, now time.Time) string {
	if isPIEpisodeCacheRefreshStateFresh(state, now) {
		return CacheStatusFreshHit
	}
	return CacheStatusStaleFallback
}

func (s *PIEpisodeReadPathService) touchPodcastAccess(ctx context.Context, podcastItunesID string, readPath string) {
	if err := s.store.TouchPodcastAccess(ctx, podcastItunesID, s.accessedAt()); err != nil {
		slog.WarnContext(ctx, "pi episode cache access touch failed",
			"podcast_itunes_id", podcastItunesID,
			"read_path", readPath,
			"error", err,
		)
	}
}

func (s *PIEpisodeReadPathService) requireDependencies() error {
	if s == nil {
		return errors.New("pi episode read path service is required")
	}
	if s.store == nil {
		return errors.New("pi episode read path service requires a store")
	}
	if s.refresh == nil {
		return errors.New("pi episode read path service requires a refresh service")
	}
	return nil
}

func (s *PIEpisodeReadPathService) accessedAt() int64 {
	return UnixPISnapshotTime(s.nowUTC())
}

func (s *PIEpisodeReadPathService) nowUTC() time.Time {
	now := time.Now
	if s.now != nil {
		now = s.now
	}
	return now().UTC()
}
