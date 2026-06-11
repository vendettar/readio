package podcastindex

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	piEpisodeRefreshFreshWindow   = 2 * time.Hour
	piEpisodeRefreshLeaderTimeout = 20 * time.Second
	piEpisodeRefreshKeyPrefix     = "pi-episodes:"
)

type PIEpisodeRefreshOutcome string

const (
	PIEpisodeRefreshOutcomeCacheHit          PIEpisodeRefreshOutcome = "cache_hit"
	PIEpisodeRefreshOutcomeReplacedSnapshot  PIEpisodeRefreshOutcome = "replaced_snapshot"
	PIEpisodeRefreshOutcomePersistenceFailed PIEpisodeRefreshOutcome = "persistence_failed"
	PIEpisodeRefreshOutcomeFailed            PIEpisodeRefreshOutcome = "failed"
)

type PIEpisodeRefreshResult struct {
	Snapshot    *PIEpisodeCacheSnapshot
	Outcome     PIEpisodeRefreshOutcome
	CacheStatus string
}

type piEpisodeRefreshPayload struct {
	Snapshot            *PIEpisodeCacheSnapshot
	Incremental         *PIEpisodeCacheSnapshot
	PreviouslyTruncated bool
	RefreshNotBefore    time.Time
}

type PodcastIndexClient interface {
	AllowPodcastIndexRequest(remoteAddr string) bool
	FetchPodcastIndexPodcastByItunesID(ctx context.Context, itunesID string) (*PodcastIndexPodcastFeed, error)
	FetchPodcastIndexEpisodesByItunesID(ctx context.Context, itunesID string, maxEpisodes int) ([]PodcastIndexEpisodeItem, error)
	FetchPodcastIndexEpisodesByItunesIDSince(ctx context.Context, itunesID string, sinceUnix int64) ([]PodcastIndexEpisodeItem, error)
}

type PIEpisodeRefreshService struct {
	store     *PIEpisodeCacheStore
	discovery PodcastIndexClient
	now       func() time.Time
	sfGroup   singleflight.Group
}

var (
	ErrRateLimited   = errors.New("podcastindex request rate limited")
	ErrUpstreamError = errors.New("podcastindex upstream error")
)

type contextKeyLimiterRemoteAddr struct{}

func WithLimiterRemoteAddr(ctx context.Context, remoteAddr string) context.Context {
	return context.WithValue(ctx, contextKeyLimiterRemoteAddr{}, remoteAddr)
}

func GetLimiterRemoteAddr(ctx context.Context) string {
	remoteAddr, _ := ctx.Value(contextKeyLimiterRemoteAddr{}).(string)
	return remoteAddr
}

func NewPIEpisodeRefreshService(store *PIEpisodeCacheStore, discovery PodcastIndexClient) *PIEpisodeRefreshService {
	return &PIEpisodeRefreshService{
		store:     store,
		discovery: discovery,
		now:       time.Now,
	}
}

func (s *PIEpisodeRefreshService) EnsureSnapshot(ctx context.Context, podcastItunesID string) (*PIEpisodeRefreshResult, error) {
	if s == nil || s.store == nil {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, errors.New("pi episode refresh service requires a store")
	}
	if s.discovery == nil {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, errors.New("pi episode refresh service requires discovery client")
	}

	podcastID, err := normalizeItunesID(podcastItunesID)
	if err != nil {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
	}

	now := s.nowUTC()
	state, err := s.store.GetRefreshState(ctx, podcastID)
	if err != nil {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
	}
	if isPIEpisodeCacheRefreshStateFresh(state, now) {
		snapshot, err := s.store.GetPodcastSnapshot(ctx, podcastID)
		if err != nil {
			return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
		}
		return &PIEpisodeRefreshResult{
			Snapshot:    snapshot,
			Outcome:     PIEpisodeRefreshOutcomeCacheHit,
			CacheStatus: CacheStatusFreshHit,
		}, nil
	}
	if isPIEpisodeCacheRefreshStateInRetryBackoff(state, now) {
		snapshot, err := s.store.GetPodcastSnapshot(ctx, podcastID)
		if err != nil {
			return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
		}
		return &PIEpisodeRefreshResult{
			Snapshot:    snapshot,
			Outcome:     PIEpisodeRefreshOutcomeFailed,
			CacheStatus: CacheStatusStaleFallback,
		}, nil
	}
	if !s.discovery.AllowPodcastIndexRequest(GetLimiterRemoteAddr(ctx)) {
		if state != nil {
			snapshot, err := s.store.GetPodcastSnapshot(ctx, podcastID)
			if err != nil {
				return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
			}
			return &PIEpisodeRefreshResult{
				Snapshot:    snapshot,
				Outcome:     PIEpisodeRefreshOutcomeFailed,
				CacheStatus: CacheStatusStaleFallback,
			}, nil
		}
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, ErrRateLimited
	}

	key := piEpisodeRefreshKeyPrefix + podcastID
	resultAny, err, _ := s.sfGroup.Do(key, func() (any, error) {
		refreshCtx, cancel := context.WithTimeout(context.Background(), piEpisodeRefreshLeaderTimeout)
		defer cancel()
		return s.refreshAfterSingleflight(refreshCtx, podcastID)
	})
	if err != nil {
		result, _ := resultAny.(*PIEpisodeRefreshResult)
		if result == nil {
			result = &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}
		}
		return result, err
	}

	result, ok := resultAny.(*PIEpisodeRefreshResult)
	if !ok {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, fmt.Errorf("pi episode refresh result type mismatch")
	}
	return result, nil
}

func (s *PIEpisodeRefreshService) refreshAfterSingleflight(ctx context.Context, podcastID string) (*PIEpisodeRefreshResult, error) {
	now := s.nowUTC()
	state, err := s.store.GetRefreshState(ctx, podcastID)
	if err != nil {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
	}
	if isPIEpisodeCacheRefreshStateFresh(state, now) {
		snapshot, err := s.store.GetPodcastSnapshot(ctx, podcastID)
		if err != nil {
			return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
		}
		return &PIEpisodeRefreshResult{
			Snapshot:    snapshot,
			Outcome:     PIEpisodeRefreshOutcomeCacheHit,
			CacheStatus: CacheStatusFreshHit,
		}, nil
	}
	if isPIEpisodeCacheRefreshStateInRetryBackoff(state, now) {
		snapshot, err := s.store.GetPodcastSnapshot(ctx, podcastID)
		if err != nil {
			return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
		}
		return &PIEpisodeRefreshResult{
			Snapshot:    snapshot,
			Outcome:     PIEpisodeRefreshOutcomeFailed,
			CacheStatus: CacheStatusStaleFallback,
		}, nil
	}

	refreshed, err := s.fetchAndBuildSnapshot(ctx, podcastID, state, now)
	if err != nil {
		if state != nil {
			if markErr := s.markFailure(ctx, podcastID, state, now, err); markErr != nil {
				slog.WarnContext(ctx, "pi episode cache failure bookkeeping failed", "itunes_id", podcastID, "error", markErr)
			}
			stale, staleErr := s.store.GetPodcastSnapshot(ctx, podcastID)
			if staleErr != nil {
				slog.WarnContext(ctx, "pi episode cache stale fallback reload failed", "itunes_id", podcastID, "error", staleErr)
			}
			return &PIEpisodeRefreshResult{
				Snapshot:    stale,
				Outcome:     PIEpisodeRefreshOutcomeFailed,
				CacheStatus: CacheStatusStaleFallback,
			}, nil
		}
		slog.WarnContext(ctx, "pi episode cache cold refresh failed",
			"itunes_id", podcastID,
			"error_class", piEpisodeRefreshErrorClass(err),
			"error", err,
		)
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
	}

	if err := s.persistRefreshPayload(ctx, refreshed); err != nil {
		slog.WarnContext(ctx, "pi episode cache persistence failed", "itunes_id", podcastID, "error", err)
		return &PIEpisodeRefreshResult{
			Snapshot:    s.persistenceFallbackSnapshot(ctx, podcastID, refreshed, now),
			Outcome:     PIEpisodeRefreshOutcomePersistenceFailed,
			CacheStatus: CacheStatusPersistenceFallback,
		}, nil
	}

	stored, err := s.store.GetPodcastSnapshot(ctx, podcastID)
	if err != nil {
		return &PIEpisodeRefreshResult{Outcome: PIEpisodeRefreshOutcomeFailed, CacheStatus: CacheStatusMissError}, err
	}
	return &PIEpisodeRefreshResult{
		Snapshot:    stored,
		Outcome:     PIEpisodeRefreshOutcomeReplacedSnapshot,
		CacheStatus: CacheStatusRefreshed,
	}, nil
}

func (s *PIEpisodeRefreshService) fetchAndBuildSnapshot(
	ctx context.Context,
	podcastID string,
	state *PIEpisodeCacheRefreshState,
	now time.Time,
) (*piEpisodeRefreshPayload, error) {
	feed, err := s.discovery.FetchPodcastIndexPodcastByItunesID(ctx, podcastID)
	if err != nil {
		return nil, errors.Join(ErrUpstreamError, err)
	}
	if feed == nil {
		return nil, &PodcastIndexInvalidResponseError{Message: "podcastindex podcast response missing feed"}
	}

	var items []PodcastIndexEpisodeItem
	if state == nil {
		items, err = s.discovery.FetchPodcastIndexEpisodesByItunesID(ctx, podcastID, PISnapshotMaxEpisodesPerPodcast)
	} else {
		newestPublishedAtUnix, newestErr := s.store.GetNewestEpisodePublishedAtUnix(ctx, podcastID)
		if newestErr != nil {
			return nil, newestErr
		}
		sinceUnix := newestPublishedAtUnix
		if sinceUnix > 0 {
			sinceUnix--
		}
		items, err = s.discovery.FetchPodcastIndexEpisodesByItunesIDSince(ctx, podcastID, sinceUnix)
	}
	if err != nil {
		return nil, errors.Join(ErrUpstreamError, err)
	}

	refreshNotBefore := now.Add(piEpisodeRefreshFreshWindow)
	mapped, err := MapPodcastIndexResponsesToPISnapshot(ctx, *feed, podcastID, items, now, refreshNotBefore)
	if err != nil {
		return nil, err
	}

	cacheSnapshot := mapped.toEpisodeCacheSnapshot()
	if state == nil {
		return &piEpisodeRefreshPayload{Snapshot: &cacheSnapshot, RefreshNotBefore: refreshNotBefore}, nil
	}

	return &piEpisodeRefreshPayload{
		Incremental:         &cacheSnapshot,
		PreviouslyTruncated: state.IsTruncated,
		RefreshNotBefore:    refreshNotBefore,
	}, nil
}

func (s *PIEpisodeRefreshService) persistRefreshPayload(ctx context.Context, payload *piEpisodeRefreshPayload) error {
	if payload == nil {
		return errors.New("pi episode refresh payload is required")
	}
	if payload.Incremental != nil {
		return s.store.ApplyPodcastIncrementalRefreshTx(ctx, ApplyPodcastIncrementalRefreshParams{
			Snapshot:               *payload.Incremental,
			WasPreviouslyTruncated: payload.PreviouslyTruncated,
		})
	}
	if payload.Snapshot == nil {
		return errors.New("pi episode refresh payload missing snapshot")
	}
	return s.store.ReplacePodcastSnapshotTx(ctx, *payload.Snapshot)
}

func (s *PIEpisodeRefreshService) persistenceFallbackSnapshot(
	ctx context.Context,
	podcastID string,
	payload *piEpisodeRefreshPayload,
	now time.Time,
) *PIEpisodeCacheSnapshot {
	if payload == nil {
		return nil
	}
	if payload.Snapshot != nil {
		return payload.Snapshot
	}
	if payload.Incremental == nil {
		return nil
	}
	current, err := s.store.GetPodcastSnapshot(ctx, podcastID)
	if err != nil || current == nil {
		if err != nil {
			slog.WarnContext(ctx, "pi episode cache persistence fallback reload failed", "itunes_id", podcastID, "error", err)
		}
		return nil
	}
	merged := mergePIEpisodeCacheSnapshot(current, *payload.Incremental, now, payload.RefreshNotBefore)
	return &merged
}

func (s *PIEpisodeRefreshService) markFailure(
	ctx context.Context,
	podcastID string,
	state *PIEpisodeCacheRefreshState,
	now time.Time,
	refreshErr error,
) error {
	failCount := 1
	if state != nil {
		failCount = state.FetchFailCount + 1
	}
	refreshNotBefore := now.Add(piEpisodeRefreshFailureBackoff(failCount))
	return s.store.MarkRefreshFailure(
		ctx,
		podcastID,
		UnixPISnapshotTime(now),
		UnixPISnapshotTime(refreshNotBefore),
		failCount,
		piEpisodeRefreshErrorClass(refreshErr),
	)
}

func piEpisodeRefreshErrorClass(err error) string {
	if errors.Is(err, ErrRateLimited) {
		return "rate_limit"
	}
	if errors.Is(err, ErrUpstreamError) {
		return "upstream"
	}
	var invalidResponseErr *PodcastIndexInvalidResponseError
	if errors.As(err, &invalidResponseErr) {
		return "upstream"
	}
	return "unknown"
}

func (s *PIEpisodeRefreshService) nowUTC() time.Time {
	if s.now == nil {
		return time.Now().UTC()
	}
	return s.now().UTC()
}

func piEpisodeRefreshFailureBackoff(failCount int) time.Duration {
	switch {
	case failCount <= 1:
		return 5 * time.Minute
	case failCount == 2:
		return 15 * time.Minute
	case failCount == 3:
		return time.Hour
	default:
		return 6 * time.Hour
	}
}

func mergePIEpisodeCacheSnapshot(
	current *PIEpisodeCacheSnapshot,
	incremental PIEpisodeCacheSnapshot,
	now time.Time,
	refreshNotBefore time.Time,
) PIEpisodeCacheSnapshot {
	timestamp := UnixPISnapshotTime(now)
	byGUID := make(map[string]PIEpisodeCacheEpisode, len(current.Episodes)+len(incremental.Episodes))
	for _, episode := range current.Episodes {
		byGUID[episode.EpisodeGUID] = episode
	}
	for _, episode := range incremental.Episodes {
		if existing, exists := byGUID[episode.EpisodeGUID]; exists {
			episode.CreatedAtUnix = existing.CreatedAtUnix
		} else {
			episode.CreatedAtUnix = timestamp
		}
		episode.UpdatedAtUnix = timestamp
		byGUID[episode.EpisodeGUID] = episode
	}

	episodes := make([]PIEpisodeCacheEpisode, 0, len(byGUID))
	for _, episode := range byGUID {
		episodes = append(episodes, episode)
	}
	sort.Slice(episodes, func(i, j int) bool {
		left := episodes[i]
		right := episodes[j]
		if left.PublishedAtUnix != right.PublishedAtUnix {
			return left.PublishedAtUnix > right.PublishedAtUnix
		}
		if left.EpisodeGUID != right.EpisodeGUID {
			return left.EpisodeGUID < right.EpisodeGUID
		}
		if left.Title != right.Title {
			return left.Title < right.Title
		}
		if left.EnclosureURL != right.EnclosureURL {
			return left.EnclosureURL < right.EnclosureURL
		}
		if left.Description != right.Description {
			return left.Description < right.Description
		}
		return left.PublishedAtUnix > right.PublishedAtUnix
	})

	clipped := len(episodes) > PISnapshotMaxEpisodesPerPodcast
	if clipped {
		episodes = episodes[:PISnapshotMaxEpisodesPerPodcast]
	}

	podcast := current.Podcast
	podcast.Title = incremental.Podcast.Title
	podcast.Description = incremental.Podcast.Description
	podcast.Author = incremental.Podcast.Author
	podcast.Image = incremental.Podcast.Image
	podcast.FeedURL = incremental.Podcast.FeedURL
	podcast.Language = incremental.Podcast.Language
	podcast.CategoriesJSON = incremental.Podcast.CategoriesJSON
	podcast.EpisodeCountHint = incremental.Podcast.EpisodeCountHint
	podcast.FeedLastUpdateTimeUnix = incremental.Podcast.FeedLastUpdateTimeUnix
	podcast.StoredEpisodeCount = len(episodes)
	podcast.IsTruncated = clipped ||
		current.Podcast.IsTruncated ||
		(incremental.Podcast.EpisodeCountHint > int64(len(episodes)))
	podcast.LastSuccessfulFetchAt = timestamp
	podcast.LastAttemptedFetchAt = timestamp
	podcast.RefreshNotBefore = UnixPISnapshotTime(refreshNotBefore)
	podcast.FetchFailCount = 0
	podcast.LastErrorClass = ""
	podcast.LastAccessedAt = timestamp

	merged := PIEpisodeCacheSnapshot{
		Podcast:  podcast,
		Episodes: episodes,
	}
	merged.Podcast.ApproxBytes = estimatePIEpisodeCacheApproxBytes(merged)
	return merged
}

func estimatePIEpisodeCacheApproxBytes(snapshot PIEpisodeCacheSnapshot) int64 {
	size := int64(PISnapshotPodcastRowOverhead)
	size += int64(len(snapshot.Podcast.PodcastItunesID) + len(snapshot.Podcast.Title) + len(snapshot.Podcast.Description) + len(snapshot.Podcast.Author))
	size += int64(len(snapshot.Podcast.Image) + len(snapshot.Podcast.FeedURL) + len(snapshot.Podcast.Language) + len(snapshot.Podcast.CategoriesJSON))
	for _, episode := range snapshot.Episodes {
		size += int64(PISnapshotEpisodeRowOverhead)
		size += int64(len(episode.PodcastItunesID) + len(episode.EpisodeGUID) + len(episode.Title))
		size += int64(len(episode.Description) + len(episode.EnclosureURL) + len(episode.Image))
		size += int64(len(episode.EpisodeType) + len(episode.Link) + len(episode.TranscriptURL))
	}
	return size
}
