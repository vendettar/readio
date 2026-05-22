package podcastindex

import (
	"encoding/json"
	"strings"
	"time"
)

type PodcastIndexCategoryNames []string

func (c *PodcastIndexCategoryNames) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*c = nil
		return nil
	}

	var raw map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	names := make([]string, 0, len(raw))
	for _, name := range raw {
		name = strings.TrimSpace(name)
		if name != "" {
			names = append(names, name)
		}
	}

	*c = names
	return nil
}

type PodcastIndexPodcastFeed struct {
	Title          string                    `json:"title"`
	URL            string                    `json:"url"`
	Description    string                    `json:"description"`
	Author         string                    `json:"author"`
	Artwork        string                    `json:"artwork"`
	LastUpdateTime *int64                    `json:"lastUpdateTime"`
	ItunesID       int64                     `json:"itunesId"`
	Language       string                    `json:"language"`
	EpisodeCount   *int64                    `json:"episodeCount"`
	Dead           int                       `json:"dead"`
	Categories     PodcastIndexCategoryNames `json:"categories"`
}

type PodcastIndexEpisodeItem struct {
	Title           string  `json:"title"`
	Link            string  `json:"link"`
	Description     string  `json:"description"`
	GUID            string  `json:"guid"`
	DatePublished   int64   `json:"datePublished"`
	EnclosureURL    string  `json:"enclosureUrl"`
	EnclosureLength *int64  `json:"enclosureLength"`
	Explicit        int     `json:"explicit"`
	Image           string  `json:"image"`
	Duration        *int64  `json:"duration"`
	Episode         *int64  `json:"episode"`
	EpisodeType     *string `json:"episodeType"`
	Season          *int64  `json:"season"`
	TranscriptURL   *string `json:"transcriptUrl"`
}

// Cache status constants for observability.
const (
	CacheStatusFreshHit            = "fresh_hit"
	CacheStatusRefreshed           = "refreshed"
	CacheStatusPersistenceFallback = "persistence_fallback"
	CacheStatusStaleFallback       = "stale_fallback"
	CacheStatusMissError           = "miss_error"
	CacheStatusUncached            = "uncached"
)

// Helper functions for refresh state.
func isPIEpisodeCacheRefreshStateFresh(state *PIEpisodeCacheRefreshState, now time.Time) bool {
	if state == nil || hasPIEpisodeRefreshStateFailure(state) {
		return false
	}
	return now.Unix() < state.RefreshNotBefore
}

func isPIEpisodeCacheRefreshStateInRetryBackoff(state *PIEpisodeCacheRefreshState, now time.Time) bool {
	if state == nil || !hasPIEpisodeRefreshStateFailure(state) {
		return false
	}
	return now.Unix() < state.RefreshNotBefore
}

func hasPIEpisodeRefreshStateFailure(state *PIEpisodeCacheRefreshState) bool {
	return state.FetchFailCount > 0 || state.LastErrorClass != ""
}
