package podcastindex

import (
	"context"
	"errors"
	"github.com/stretchr/testify/require"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMapPodcastIndexSnapshotCanonicalOrderingAndRetention(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	episodeCount := int64(1005)
	feed := piSnapshotPodcastFeedFixture("123", episodeCount)
	items := make([]PodcastIndexEpisodeItem, 0, 1005)
	for i := 0; i < 1005; i++ {
		item := piSnapshotEpisodeItemFixture("episode-"+strconv.Itoa(i), now.Add(-time.Duration(i)*time.Minute).Unix())
		items = append(items, item)
	}
	reversePodcastIndexEpisodeItems(items)

	snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
	require.NoError(t, err)

	require.Len(t, snapshot.Episodes, PISnapshotMaxEpisodesPerPodcast)
	require.Equal(t, PISnapshotMaxEpisodesPerPodcast, snapshot.StoredEpisodeCount)
	require.True(t, snapshot.IsTruncated)
	require.Equal(t, "episode-0", snapshot.Episodes[0].EpisodeGUID)
	require.Equal(t, "episode-999", snapshot.Episodes[999].EpisodeGUID)
}

func TestMapPodcastIndexSnapshotOrdersByDateThenGUIDIndependentlyOfUpstreamOrder(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 3)
	items := []PodcastIndexEpisodeItem{
		piSnapshotEpisodeItemFixture("guid-b", 2000),
		piSnapshotEpisodeItemFixture("guid-newest", 3000),
		piSnapshotEpisodeItemFixture("guid-a", 2000),
	}
	reversed := append([]PodcastIndexEpisodeItem(nil), items...)
	reversePodcastIndexEpisodeItems(reversed)

	first, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
	require.NoError(t, err)
	second, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", reversed, now, now.Add(2*time.Hour))
	require.NoError(t, err)

	got := piSnapshotEpisodeGUIDs(first.Episodes)
	want := []string{"guid-newest", "guid-a", "guid-b"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("episode order = %#v, want %#v", got, want)
	}
	if !reflect.DeepEqual(got, piSnapshotEpisodeGUIDs(second.Episodes)) {
		t.Fatalf("episode order depends on upstream order: first=%#v second=%#v", got, piSnapshotEpisodeGUIDs(second.Episodes))
	}
}

func TestMapPodcastIndexSnapshotTruncationEvidence(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	items := make([]PodcastIndexEpisodeItem, 0, PISnapshotMaxEpisodesPerPodcast)
	for i := 0; i < PISnapshotMaxEpisodesPerPodcast; i++ {
		items = append(items, piSnapshotEpisodeItemFixture("episode-"+strconv.Itoa(i), int64(3000-i)))
	}

	tests := []struct {
		name        string
		episodeHint *int64
		want        bool
	}{
		{name: "missing episode count is conservative", episodeHint: nil, want: false},
		{name: "equal episode count is not truncated", episodeHint: int64Ptr(PISnapshotMaxEpisodesPerPodcast), want: false},
		{name: "greater episode count truncates only when window is full", episodeHint: int64Ptr(PISnapshotMaxEpisodesPerPodcast + 1), want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			feed := piSnapshotPodcastFeedFixture("123", 0)
			feed.EpisodeCount = tt.episodeHint
			snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
			require.NoError(t, err)
			require.Equal(t, tt.want, snapshot.IsTruncated)
		})
	}
}

func TestMapPodcastIndexSnapshotTruncationEvidenceBelowMax(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	const count = 500
	items := make([]PodcastIndexEpisodeItem, 0, count)
	for i := 0; i < count; i++ {
		items = append(items, piSnapshotEpisodeItemFixture("episode-"+strconv.Itoa(i), int64(3000-i)))
	}

	tests := []struct {
		name        string
		episodeHint *int64
		want        bool
	}{
		{name: "missing episode count is not truncated below max", episodeHint: nil, want: false},
		{name: "equal episode count is not truncated below max", episodeHint: int64Ptr(count), want: false},
		{name: "greater episode count is truncated below max", episodeHint: int64Ptr(count + 1), want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			feed := piSnapshotPodcastFeedFixture("123", 0)
			feed.EpisodeCount = tt.episodeHint
			snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
			require.NoError(t, err)
			require.Equal(t, tt.want, snapshot.IsTruncated)
		})
	}
}

func TestMapPodcastIndexSnapshotStableApproxBytes(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 2)
	items := []PodcastIndexEpisodeItem{
		piSnapshotEpisodeItemFixture("guid-b", 2000),
		piSnapshotEpisodeItemFixture("guid-a", 3000),
	}
	reversed := append([]PodcastIndexEpisodeItem(nil), items...)
	reversePodcastIndexEpisodeItems(reversed)

	first, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
	require.NoError(t, err)
	second, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", reversed, now, now.Add(2*time.Hour))
	require.NoError(t, err)

	if first.ApproxBytes <= int64(len(feed.Title)+len(feed.Description)+len(items[0].Title)+len(items[1].Title)) {
		t.Fatalf("approx bytes = %d, want text size plus row overhead", first.ApproxBytes)
	}
	require.Equal(t, second.ApproxBytes, first.ApproxBytes)
}

func TestMapPodcastIndexSnapshotDurationAndOptionalFields(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 1)
	item := piSnapshotEpisodeItemFixture("guid-1", 2000)
	duration := int64(54)
	item.Duration = &duration
	item.Episode = int64Ptr(19)
	item.Season = int64Ptr(3)
	item.EpisodeType = piStringPtr("TRAILER")
	item.TranscriptURL = piStringPtr(" https://example.com/transcript.vtt ")
	item.Link = " https://example.com/episode "

	snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{item}, now, now.Add(2*time.Hour))
	require.NoError(t, err)

	episode := snapshot.Episodes[0]
	require.Equal(t, int64(54), episode.DurationSeconds)
	require.NotNil(t, episode.EpisodeNumber)
	require.Equal(t, int64(19), *episode.EpisodeNumber)
	require.NotNil(t, episode.SeasonNumber)
	require.Equal(t, int64(3), *episode.SeasonNumber)
	require.Equal(t, "trailer", episode.EpisodeType)
	require.Equal(t, "https://example.com/transcript.vtt", episode.TranscriptURL)
	require.Equal(t, "https://example.com/episode", episode.Link)

	t.Run("nil duration is retained as unknown", func(t *testing.T) {
		unknownDuration := piSnapshotEpisodeItemFixture("unknown-duration", 3000)
		unknownDuration.Duration = nil

		snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{unknownDuration}, now, now.Add(2*time.Hour))
		require.NoError(t, err)
		require.Len(t, snapshot.Episodes, 1)
		require.Equal(t, int64(0), snapshot.Episodes[0].DurationSeconds)
	})

	t.Run("negative duration is skipped", func(t *testing.T) {
		negativeDuration := piSnapshotEpisodeItemFixture("negative-duration", 3000)
		negativeDuration.Duration = int64Ptr(-1)

		snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{negativeDuration}, now, now.Add(2*time.Hour))
		require.NoError(t, err)
		require.Empty(t, snapshot.Episodes)
	})

	t.Run("non-positive enclosure length is skipped", func(t *testing.T) {
		zeroLength := piSnapshotEpisodeItemFixture("zero-length", 3000)
		zeroLength.EnclosureLength = int64Ptr(0)
		negativeLength := piSnapshotEpisodeItemFixture("negative-length", 2000)
		negativeLength.EnclosureLength = int64Ptr(-1)

		snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{zeroLength, negativeLength}, now, now.Add(2*time.Hour))
		require.NoError(t, err)
		require.Empty(t, snapshot.Episodes)
	})
}

func TestMapPodcastIndexSnapshotDuplicateGUIDWinnerIsDeterministic(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 2)
	alpha := piSnapshotEpisodeItemFixture("duplicate-guid", 2000)
	alpha.Title = "Alpha Title"
	zulu := piSnapshotEpisodeItemFixture("duplicate-guid", 2000)
	zulu.Title = "Zulu Title"

	first, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{zulu, alpha}, now, now.Add(2*time.Hour))
	require.NoError(t, err)
	second, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{alpha, zulu}, now, now.Add(2*time.Hour))
	require.NoError(t, err)

	require.Len(t, first.Episodes, 1)
	require.Equal(t, "Alpha Title", first.Episodes[0].Title)
	if !reflect.DeepEqual(first.Episodes, second.Episodes) {
		t.Fatalf("duplicate winner depends on upstream order:\nfirst=%#v\nsecond=%#v", first.Episodes, second.Episodes)
	}
}

func TestMapPodcastIndexSnapshotDuplicateGUIDWinnerUsesAllPersistedFields(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 2)
	plain := piSnapshotEpisodeItemFixture("duplicate-guid", 2000)
	plain.Title = "Same Title"
	plain.Description = "Same Description"
	plain.EnclosureURL = "https://example.com/audio/same.mp3"
	plain.Image = "https://example.com/art/same.jpg"
	plain.Explicit = 1
	withTranscript := plain
	withTranscript.TranscriptURL = piStringPtr("https://example.com/transcript.vtt")

	first, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{withTranscript, plain}, now, now.Add(2*time.Hour))
	require.NoError(t, err)
	second, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{plain, withTranscript}, now, now.Add(2*time.Hour))
	require.NoError(t, err)

	require.Len(t, first.Episodes, 1)
	require.Equal(t, "", first.Episodes[0].TranscriptURL)
	if !reflect.DeepEqual(first.Episodes, second.Episodes) {
		t.Fatalf("duplicate winner depends on upstream order:\nfirst=%#v\nsecond=%#v", first.Episodes, second.Episodes)
	}
}

func TestMapPodcastIndexSnapshotInvalidAudioAndArtworkSemantics(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 2)
	valid := piSnapshotEpisodeItemFixture("valid-guid", 2000)
	missingArtwork := piSnapshotEpisodeItemFixture("missing-artwork-guid", 4000)
	missingArtwork.Image = ""
	blankArtwork := piSnapshotEpisodeItemFixture("blank-artwork-guid", 3500)
	blankArtwork.Image = "   "
	invalidArtwork := piSnapshotEpisodeItemFixture("invalid-artwork-guid", 3000)
	invalidArtwork.Image = "javascript:alert(1)"

	snapshot, err := MapPodcastIndexResponsesToPISnapshot(
		context.Background(),
		feed,
		"123",
		[]PodcastIndexEpisodeItem{missingArtwork, blankArtwork, invalidArtwork, valid},
		now,
		now.Add(2*time.Hour),
	)
	require.NoError(t, err)
	if got := piSnapshotEpisodeGUIDs(snapshot.Episodes); !reflect.DeepEqual(got, []string{"missing-artwork-guid", "blank-artwork-guid", "valid-guid"}) {
		t.Fatalf("episode GUIDs after artwork normalization = %#v", got)
	}
	require.Equal(t, "", snapshot.Episodes[0].Image)
	require.Equal(t, "", snapshot.Episodes[1].Image)
	require.Equal(t, "https://example.com/art/valid-guid.jpg", snapshot.Episodes[2].Image)

	invalidAudio := piSnapshotEpisodeItemFixture("invalid-audio-guid", 3000)
	invalidAudio.EnclosureURL = "ftp://example.com/audio.mp3"
	_, err = MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", []PodcastIndexEpisodeItem{invalidAudio, valid}, now, now.Add(2*time.Hour))
	var invalidResponseErr *PodcastIndexInvalidResponseError
	if !errors.As(err, &invalidResponseErr) {
		t.Fatalf("invalid required audio error = %T %v, want PodcastIndexInvalidResponseError", err, err)
	}
}

func TestPIEpisodeGUIDLogHashDoesNotExposeRawGUID(t *testing.T) {
	rawGUID := strings.Repeat("very-sensitive-guid-", 80)

	got := piEpisodeGUIDLogHash(rawGUID)

	require.Len(t, got, 12)
	require.NotContains(t, rawGUID, got)
	require.NotContains(t, got, "very-sensitive-guid")
	require.Equal(t, "", piEpisodeGUIDLogHash(""))
}

func TestMapPodcastIndexSnapshotUsesRequestItunesIDWhenFeedItunesIDMissing(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	items := []PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("valid-guid", 2000)}

	for _, feedID := range []int64{0, -1} {
		t.Run(strconv.FormatInt(feedID, 10), func(t *testing.T) {
			feed := piSnapshotPodcastFeedFixture("123", 1)
			feed.ItunesID = feedID
			snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
			require.NoError(t, err)
			require.Equal(t, "123", snapshot.PodcastItunesID)
		})
	}
}

func TestMapPodcastIndexSnapshotRejectsPositivePodcastItunesIDMismatch(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	items := []PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("valid-guid", 2000)}

	feed := piSnapshotPodcastFeedFixture("123", 1)
	feed.ItunesID = 456
	_, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
	var invalidResponseErr *PodcastIndexInvalidResponseError
	if !errors.As(err, &invalidResponseErr) {
		t.Fatalf("error = %T %v, want PodcastIndexInvalidResponseError", err, err)
	}
	require.Contains(t, err.Error(), "does not match requested itunes id")
}

func TestMapPodcastIndexSnapshotRejectsOversizedPodcastCoreTextAndURL(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	items := []PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("valid-guid", 2000)}

	tests := []struct {
		name   string
		mutate func(*PodcastIndexPodcastFeed)
	}{
		{
			name: "huge podcast description",
			mutate: func(feed *PodcastIndexPodcastFeed) {
				feed.Description = strings.Repeat("d", PISnapshotMaxPodcastDescriptionBytes+1)
			},
		},
		{
			name: "huge podcast artwork url",
			mutate: func(feed *PodcastIndexPodcastFeed) {
				feed.Artwork = "https://example.com/" + strings.Repeat("a", PISnapshotMaxURLBytes)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			feed := piSnapshotPodcastFeedFixture("123", 1)
			tt.mutate(&feed)
			_, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
			var invalidResponseErr *PodcastIndexInvalidResponseError
			if !errors.As(err, &invalidResponseErr) {
				t.Fatalf("error = %T %v, want PodcastIndexInvalidResponseError", err, err)
			}
		})
	}
}

func TestMapPodcastIndexSnapshotCapsCategoriesDeterministically(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 1)
	feed.Categories = make(PodcastIndexCategoryNames, 0, PISnapshotMaxPodcastCategories+2)
	for i := 0; i < PISnapshotMaxPodcastCategories+2; i++ {
		feed.Categories = append(feed.Categories, "category-"+strconv.Itoa(i))
	}
	feed.Categories = append(feed.Categories, strings.Repeat("x", PISnapshotMaxCategoryBytes+1))

	snapshot, err := MapPodcastIndexResponsesToPISnapshot(
		context.Background(),
		feed,
		"123",
		[]PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("valid-guid", 2000)},
		now,
		now.Add(2*time.Hour),
	)
	require.NoError(t, err)
	require.Len(t, snapshot.Categories, PISnapshotMaxPodcastCategories)
	for _, category := range snapshot.Categories {
		if len(category) > PISnapshotMaxCategoryBytes {
			t.Fatalf("oversized category was retained: len=%d", len(category))
		}
	}
}

func TestMapPodcastIndexSnapshotSkipsOversizedEpisodes(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 3)
	valid := piSnapshotEpisodeItemFixture("valid-guid", 2000)
	hugeDescription := piSnapshotEpisodeItemFixture("huge-description-guid", 3000)
	hugeDescription.Description = strings.Repeat("d", PISnapshotMaxEpisodeDescriptionBytes+1)
	hugeAudioURL := piSnapshotEpisodeItemFixture("huge-audio-url-guid", 4000)
	hugeAudioURL.EnclosureURL = "https://example.com/" + strings.Repeat("a", PISnapshotMaxURLBytes)

	snapshot, err := MapPodcastIndexResponsesToPISnapshot(
		context.Background(),
		feed,
		"123",
		[]PodcastIndexEpisodeItem{hugeAudioURL, hugeDescription, valid},
		now,
		now.Add(2*time.Hour),
	)
	require.NoError(t, err)
	if got := piSnapshotEpisodeGUIDs(snapshot.Episodes); !reflect.DeepEqual(got, []string{"valid-guid"}) {
		t.Fatalf("episode GUIDs after oversized skips = %#v, want valid only", got)
	}
}

func TestMapPodcastIndexSnapshotMapsLargeBoundedSnapshotWithoutApproxBytesRejection(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", int64(PISnapshotMaxEpisodesPerPodcast))
	items := make([]PodcastIndexEpisodeItem, 0, PISnapshotMaxEpisodesPerPodcast)
	for i := 0; i < PISnapshotMaxEpisodesPerPodcast; i++ {
		item := piSnapshotEpisodeItemFixture("episode-"+strconv.Itoa(i), int64(5000-i))
		item.Description = strings.Repeat("d", PISnapshotMaxEpisodeDescriptionBytes)
		items = append(items, item)
	}

	snapshot, err := MapPodcastIndexResponsesToPISnapshot(context.Background(), feed, "123", items, now, now.Add(2*time.Hour))
	require.NoError(t, err)
	require.Len(t, snapshot.Episodes, PISnapshotMaxEpisodesPerPodcast)
	if snapshot.ApproxBytes <= 8*1024*1024 {
		t.Fatalf("approx bytes = %d, want large snapshot estimate above former hard rejection threshold", snapshot.ApproxBytes)
	}
}

func TestPISnapshotConvertsToEpisodeCacheSnapshotRows(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	feed := piSnapshotPodcastFeedFixture("123", 1)
	snapshot, err := MapPodcastIndexResponsesToPISnapshot(
		context.Background(),
		feed,
		"123",
		[]PodcastIndexEpisodeItem{piSnapshotEpisodeItemFixture("guid-1", 2000)},
		now,
		now.Add(2*time.Hour),
	)
	require.NoError(t, err)

	cacheSnapshot := snapshot.toEpisodeCacheSnapshot()
	require.Equal(t, "123", cacheSnapshot.Podcast.PodcastItunesID)
	require.Equal(t, 1, cacheSnapshot.Podcast.StoredEpisodeCount)
	require.Equal(t, snapshot.ApproxBytes, cacheSnapshot.Podcast.ApproxBytes)
	require.Equal(t, snapshot.FeedLastUpdateTimeUnix, cacheSnapshot.Podcast.FeedLastUpdateTimeUnix)
	require.Len(t, cacheSnapshot.Episodes, 1)
	require.Equal(t, int64(60), cacheSnapshot.Episodes[0].DurationSeconds)
	require.Equal(t, int64(2000), cacheSnapshot.Episodes[0].PublishedAtUnix)
}

func piSnapshotPodcastFeedFixture(itunesID string, episodeCount int64) PodcastIndexPodcastFeed {
	lastUpdate := int64(1700000000)
	parsedID, _ := strconv.ParseInt(itunesID, 10, 64)
	return PodcastIndexPodcastFeed{
		Title:          "Fixture Show",
		URL:            "https://example.com/feed.xml",
		Description:    "Fixture show description",
		Author:         "Fixture Author",
		Artwork:        "https://example.com/show.jpg",
		LastUpdateTime: &lastUpdate,
		ItunesID:       parsedID,
		Language:       "en",
		EpisodeCount:   &episodeCount,
		Categories:     PodcastIndexCategoryNames{"Technology", "News"},
	}
}

func piSnapshotEpisodeItemFixture(guid string, publishedAt int64) PodcastIndexEpisodeItem {
	duration := int64(60)
	enclosureLength := int64(1024)
	return PodcastIndexEpisodeItem{
		Title:           "Episode " + guid,
		Link:            "https://example.com/episodes/" + guid,
		Description:     "Episode description " + guid,
		GUID:            guid,
		DatePublished:   publishedAt,
		EnclosureURL:    "https://example.com/audio/" + guid + ".mp3",
		EnclosureLength: &enclosureLength,
		Explicit:        1,
		Image:           "https://example.com/art/" + guid + ".jpg",
		Duration:        &duration,
		EpisodeType:     piStringPtr("full"),
	}
}

func piSnapshotEpisodeGUIDs(episodes []PIEpisodeSnapshot) []string {
	guids := make([]string, 0, len(episodes))
	for _, episode := range episodes {
		guids = append(guids, episode.EpisodeGUID)
	}
	return guids
}

func reversePodcastIndexEpisodeItems(items []PodcastIndexEpisodeItem) {
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
}

func piStringPtr(value string) *string {
	return &value
}
