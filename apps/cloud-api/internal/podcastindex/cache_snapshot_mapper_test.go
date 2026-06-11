package podcastindex

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPIPodcastSnapshotToEpisodeCacheSnapshotBindsPersistenceFields(t *testing.T) {
	fetchedAt := time.Date(2026, 5, 19, 10, 30, 0, 0, time.UTC)
	refreshNotBefore := fetchedAt.Add(2 * time.Hour)
	episodeNumber := int64(42)
	seasonNumber := int64(3)
	explicit := true
	enclosureLength := int64(987654)

	snapshot := PIPodcastSnapshot{
		PodcastItunesID:        "12345",
		Title:                  "Canonical Show",
		Description:            "Canonical description",
		Author:                 "Canonical Author",
		Image:                  "https://example.com/show.jpg",
		FeedURL:                "https://example.com/feed.xml",
		Language:               "en",
		Categories:             []string{"Technology", "News"},
		EpisodeCountHint:       200,
		FeedLastUpdateTimeUnix: fetchedAt.Add(-time.Hour).Unix(),
		StoredEpisodeCount:     1,
		IsTruncated:            true,
		ApproxBytes:            4096,
		LastSuccessfulFetchAt:  fetchedAt,
		RefreshNotBefore:       refreshNotBefore,
		Episodes: []PIEpisodeSnapshot{
			{
				PodcastItunesID: "12345",
				EpisodeGUID:     "episode-guid",
				Title:           "Episode title",
				Description:     "Episode description",
				EnclosureURL:    "https://example.com/audio.mp3",
				PublishedAtUnix: fetchedAt.Add(-24 * time.Hour).Unix(),
				DurationSeconds: 1800,
				Image:           "https://example.com/episode.jpg",
				EpisodeNumber:   &episodeNumber,
				SeasonNumber:    &seasonNumber,
				EpisodeType:     "full",
				Explicit:        &explicit,
				Link:            "https://example.com/episode",
				EnclosureLength: &enclosureLength,
				TranscriptURL:   "https://example.com/transcript.srt",
			},
		},
	}

	cacheSnapshot := snapshot.toEpisodeCacheSnapshot()

	require.Equal(t, "12345", cacheSnapshot.Podcast.PodcastItunesID)
	require.Equal(t, `["Technology","News"]`, cacheSnapshot.Podcast.CategoriesJSON)
	require.Equal(t, int64(200), cacheSnapshot.Podcast.EpisodeCountHint)
	require.Equal(t, 1, cacheSnapshot.Podcast.StoredEpisodeCount)
	require.True(t, cacheSnapshot.Podcast.IsTruncated)
	require.Equal(t, int64(4096), cacheSnapshot.Podcast.ApproxBytes)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), cacheSnapshot.Podcast.CreatedAtUnix)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), cacheSnapshot.Podcast.UpdatedAtUnix)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), cacheSnapshot.Podcast.LastSuccessfulFetchAt)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), cacheSnapshot.Podcast.LastAttemptedFetchAt)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), cacheSnapshot.Podcast.LastAccessedAt)
	require.Equal(t, UnixPISnapshotTime(refreshNotBefore), cacheSnapshot.Podcast.RefreshNotBefore)

	require.Len(t, cacheSnapshot.Episodes, 1)
	episode := cacheSnapshot.Episodes[0]
	require.Equal(t, "episode-guid", episode.EpisodeGUID)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), episode.CreatedAtUnix)
	require.Equal(t, UnixPISnapshotTime(fetchedAt), episode.UpdatedAtUnix)
	require.NotSame(t, &episodeNumber, episode.EpisodeNumber)
	require.NotSame(t, &seasonNumber, episode.SeasonNumber)
	require.NotSame(t, &explicit, episode.Explicit)
	require.NotSame(t, &enclosureLength, episode.EnclosureLength)

	episodeNumber = 100
	seasonNumber = 9
	explicit = false
	enclosureLength = 1
	require.Equal(t, int64(42), *episode.EpisodeNumber)
	require.Equal(t, int64(3), *episode.SeasonNumber)
	require.True(t, *episode.Explicit)
	require.Equal(t, int64(987654), *episode.EnclosureLength)
}
