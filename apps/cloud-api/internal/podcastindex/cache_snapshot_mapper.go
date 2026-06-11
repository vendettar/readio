package podcastindex

import "encoding/json"

func (s PIPodcastSnapshot) toEpisodeCacheSnapshot() PIEpisodeCacheSnapshot {
	timestamp := UnixPISnapshotTime(s.LastSuccessfulFetchAt)
	podcast := PIEpisodeCachePodcastRecord{
		PIEpisodeCachePodcastMetadata: PIEpisodeCachePodcastMetadata{
			PodcastItunesID:        s.PodcastItunesID,
			Title:                  s.Title,
			Description:            s.Description,
			Author:                 s.Author,
			Image:                  s.Image,
			FeedURL:                s.FeedURL,
			Language:               s.Language,
			CategoriesJSON:         categoriesJSON(s.Categories),
			EpisodeCountHint:       s.EpisodeCountHint,
			FeedLastUpdateTimeUnix: s.FeedLastUpdateTimeUnix,
			CreatedAtUnix:          timestamp,
			UpdatedAtUnix:          timestamp,
		},
		PIEpisodeCachePodcastState: PIEpisodeCachePodcastState{
			StoredEpisodeCount:    s.StoredEpisodeCount,
			IsTruncated:           s.IsTruncated,
			LastSuccessfulFetchAt: timestamp,
			LastAttemptedFetchAt:  timestamp,
			RefreshNotBefore:      UnixPISnapshotTime(s.RefreshNotBefore),
			ApproxBytes:           s.ApproxBytes,
			LastAccessedAt:        timestamp,
		},
	}

	episodes := make([]PIEpisodeCacheEpisode, 0, len(s.Episodes))
	for _, episode := range s.Episodes {
		episodes = append(episodes, normalizedEpisodeToCacheEpisode(episode, timestamp))
	}

	return PIEpisodeCacheSnapshot{
		Podcast:  podcast,
		Episodes: episodes,
	}
}

func normalizedEpisodeToCacheEpisode(episode PIEpisodeSnapshot, timestamp int64) PIEpisodeCacheEpisode {
	return PIEpisodeCacheEpisode{
		PodcastItunesID: episode.PodcastItunesID,
		EpisodeGUID:     episode.EpisodeGUID,
		Title:           episode.Title,
		Description:     episode.Description,
		EnclosureURL:    episode.EnclosureURL,
		PublishedAtUnix: episode.PublishedAtUnix,
		DurationSeconds: episode.DurationSeconds,
		Image:           episode.Image,
		EpisodeNumber:   cloneInt64Ptr(episode.EpisodeNumber),
		SeasonNumber:    cloneInt64Ptr(episode.SeasonNumber),
		EpisodeType:     episode.EpisodeType,
		Explicit:        cloneBoolPtr(episode.Explicit),
		Link:            episode.Link,
		EnclosureLength: cloneInt64Ptr(episode.EnclosureLength),
		TranscriptURL:   episode.TranscriptURL,
		CreatedAtUnix:   timestamp,
		UpdatedAtUnix:   timestamp,
	}
}

func categoriesJSON(categories []string) string {
	if len(categories) == 0 {
		return ""
	}
	encoded, err := json.Marshal(categories)
	if err != nil {
		return ""
	}
	return string(encoded)
}
