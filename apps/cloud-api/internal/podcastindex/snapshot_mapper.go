package podcastindex

import (
	"context"
	"crypto/sha1"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	PISnapshotMaxEpisodesPerPodcast      = 1000
	PISnapshotMaxPodcastTitleBytes       = 512
	PISnapshotMaxPodcastAuthorBytes      = 512
	PISnapshotMaxPodcastLanguageBytes    = 64
	PISnapshotMaxPodcastDescriptionBytes = 128 * 1024
	PISnapshotMaxPodcastCategories       = 64
	PISnapshotMaxCategoryBytes           = 128
	PISnapshotMaxEpisodeGUIDBytes        = 1024
	PISnapshotMaxEpisodeTitleBytes       = 1024
	PISnapshotMaxEpisodeDescriptionBytes = 64 * 1024
	PISnapshotMaxURLBytes                = 4096
	PISnapshotPodcastRowOverhead         = 256
	PISnapshotEpisodeRowOverhead         = 384
)

type PodcastIndexInvalidResponseError struct {
	Message string
}

func (e *PodcastIndexInvalidResponseError) Error() string {
	return e.Message
}

// PIPodcastSnapshot is the canonical normalized PodcastIndex model for the
// episode cache. It intentionally excludes persistence row fields such as
// created/updated timestamps while keeping bounded-window metadata.
type PIPodcastSnapshot struct {
	PodcastItunesID        string
	Title                  string
	Description            string
	Author                 string
	Image                  string
	FeedURL                string
	Language               string
	Categories             []string
	EpisodeCountHint       int64
	FeedLastUpdateTimeUnix int64
	StoredEpisodeCount     int
	IsTruncated            bool
	ApproxBytes            int64
	LastSuccessfulFetchAt  time.Time
	RefreshNotBefore       time.Time
	Episodes               []PIEpisodeSnapshot
}

// PIEpisodeSnapshot is the normalized episode model produced from PodcastIndex
// responses before persistence-specific cache fields are attached.
type PIEpisodeSnapshot struct {
	PodcastItunesID string
	EpisodeGUID     string
	Title           string
	Description     string
	EnclosureURL    string
	PublishedAt     time.Time
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
}

type normalizedPISnapshotEpisode struct {
	item     PodcastIndexEpisodeItem
	response piEpisodeResponse
}

type piEpisodeResponse struct {
	GUID          string `json:"guid"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	AudioURL      string `json:"audioUrl"`
	PubDate       int64  `json:"pubDate"`
	ArtworkURL    string `json:"artworkUrl"`
	FileSize      int64  `json:"fileSize"`
	Duration      int64  `json:"duration"`
	Explicit      bool   `json:"explicit"`
	Link          string `json:"link,omitempty"`
	SeasonNumber  *int64 `json:"seasonNumber,omitempty"`
	EpisodeNumber *int64 `json:"episodeNumber,omitempty"`
	EpisodeType   string `json:"episodeType,omitempty"`
	TranscriptURL string `json:"transcriptUrl,omitempty"`
}

var errSkipPodcastIndexEpisode = errors.New("skip podcastindex episode")

func MapPodcastIndexResponsesToPISnapshot(
	ctx context.Context,
	feed PodcastIndexPodcastFeed,
	podcastItunesID string,
	items []PodcastIndexEpisodeItem,
	lastSuccessfulFetchAt time.Time,
	refreshNotBefore time.Time,
) (PIPodcastSnapshot, error) {
	podcastID, err := normalizeItunesID(podcastItunesID)
	if err != nil {
		return PIPodcastSnapshot{}, fmt.Errorf("podcastindex snapshot: invalid itunes id: %w", err)
	}

	podcast, err := mapPodcastIndexFeedToPISnapshot(ctx, feed, podcastID)
	if err != nil {
		return PIPodcastSnapshot{}, err
	}
	podcast.LastSuccessfulFetchAt = lastSuccessfulFetchAt.UTC()
	podcast.RefreshNotBefore = refreshNotBefore.UTC()

	normalizedEpisodes := make([]normalizedPISnapshotEpisode, 0, len(items))
	for _, item := range items {
		mapped, err := mapPodcastIndexEpisodeToPIEpisode(ctx, item)
		if err != nil {
			if errors.Is(err, errSkipPodcastIndexEpisode) {
				continue
			}
			return PIPodcastSnapshot{}, err
		}
		mapped, ok := boundPIEpisodeSnapshotResponse(ctx, mapped)
		if !ok {
			continue
		}
		normalizedEpisodes = append(normalizedEpisodes, normalizedPISnapshotEpisode{
			item:     item,
			response: mapped,
		})
	}

	sort.Slice(normalizedEpisodes, func(i, j int) bool {
		left := normalizedEpisodes[i]
		right := normalizedEpisodes[j]
		if left.item.DatePublished != right.item.DatePublished {
			return left.item.DatePublished > right.item.DatePublished
		}
		if left.response.GUID != right.response.GUID {
			return left.response.GUID < right.response.GUID
		}
		if left.response.Title != right.response.Title {
			return left.response.Title < right.response.Title
		}
		if left.response.AudioURL != right.response.AudioURL {
			return left.response.AudioURL < right.response.AudioURL
		}
		if left.response.Description != right.response.Description {
			return left.response.Description < right.response.Description
		}
		if left.response.PubDate != right.response.PubDate {
			return left.response.PubDate < right.response.PubDate
		}
		return piSnapshotEpisodeFingerprint(left.response) < piSnapshotEpisodeFingerprint(right.response)
	})

	seenGUIDs := make(map[string]struct{}, len(normalizedEpisodes))
	episodes := make([]PIEpisodeSnapshot, 0, min(len(normalizedEpisodes), PISnapshotMaxEpisodesPerPodcast))
	for _, normalized := range normalizedEpisodes {
		if _, seen := seenGUIDs[normalized.response.GUID]; seen {
			continue
		}
		seenGUIDs[normalized.response.GUID] = struct{}{}
		if len(episodes) >= PISnapshotMaxEpisodesPerPodcast {
			continue
		}
		episodes = append(episodes, mapPIEpisodeResponseToSnapshot(podcastID, normalized.response, normalized.item.DatePublished))
	}

	podcast.Episodes = episodes
	podcast.StoredEpisodeCount = len(episodes)
	podcast.IsTruncated = len(normalizedEpisodes) > len(episodes) ||
		(feed.EpisodeCount != nil && *feed.EpisodeCount > int64(len(episodes)))
	podcast.ApproxBytes = estimatePISnapshotApproxBytes(podcast)

	return podcast, nil
}

func mapPodcastIndexFeedToPISnapshot(ctx context.Context, feed PodcastIndexPodcastFeed, podcastItunesID string) (PIPodcastSnapshot, error) {
	if feed.ItunesID > 0 && strconv.FormatInt(feed.ItunesID, 10) != podcastItunesID {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "feed itunes id does not match requested itunes id")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed does not match requested itunes id"}
	}
	if feed.Dead != 0 {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "feed is marked as dead")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed is marked as dead"}
	}
	if feed.LastUpdateTime == nil {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "missing last update time")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed is missing last update time"}
	}

	title, ok := trimBoundedPIString(feed.Title, PISnapshotMaxPodcastTitleBytes)
	if !ok {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "oversized title")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed title is too large"}
	}
	author, ok := trimBoundedPIString(feed.Author, PISnapshotMaxPodcastAuthorBytes)
	if !ok {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "oversized author")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed author is too large"}
	}
	description, ok := trimBoundedPIString(feed.Description, PISnapshotMaxPodcastDescriptionBytes)
	if !ok {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "oversized description")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed description is too large"}
	}
	language, ok := trimBoundedPIString(feed.Language, PISnapshotMaxPodcastLanguageBytes)
	if !ok {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "oversized language")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed language is too large"}
	}
	feedURL := strings.TrimSpace(feed.URL)
	if len(feedURL) > PISnapshotMaxURLBytes {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "oversized feed url")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed url is too large"}
	}
	image, ok := normalizeRequiredHTTPURL(feed.Artwork)
	if !ok {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "invalid artwork url")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed has invalid artwork url"}
	}
	if len(image) > PISnapshotMaxURLBytes {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "oversized artwork url")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed artwork url is too large"}
	}

	if title == "" || author == "" || description == "" || podcastItunesID == "" {
		slogSkipPodcastSnapshot(ctx, podcastItunesID, "missing required fields")
		return PIPodcastSnapshot{}, &PodcastIndexInvalidResponseError{Message: "podcastindex snapshot feed is missing required fields"}
	}

	categories := make([]string, 0, len(feed.Categories))
	for _, category := range feed.Categories {
		category, ok = trimBoundedPIString(category, PISnapshotMaxCategoryBytes)
		if ok && category != "" {
			categories = append(categories, category)
		}
	}
	sort.Strings(categories)
	if len(categories) > PISnapshotMaxPodcastCategories {
		categories = categories[:PISnapshotMaxPodcastCategories]
	}

	var episodeCountHint int64
	if feed.EpisodeCount != nil && *feed.EpisodeCount > 0 {
		episodeCountHint = *feed.EpisodeCount
	}

	return PIPodcastSnapshot{
		PodcastItunesID:        podcastItunesID,
		Title:                  title,
		Description:            description,
		Author:                 author,
		Image:                  image,
		FeedURL:                feedURL,
		Language:               language,
		Categories:             categories,
		EpisodeCountHint:       episodeCountHint,
		FeedLastUpdateTimeUnix: *feed.LastUpdateTime,
	}, nil
}

func mapPodcastIndexEpisodeToPIEpisode(ctx context.Context, item PodcastIndexEpisodeItem) (piEpisodeResponse, error) {
	title := strings.TrimSpace(item.Title)
	description := strings.TrimSpace(item.Description)
	guid := strings.TrimSpace(item.GUID)
	image := strings.TrimSpace(item.Image)
	if title == "" || guid == "" || item.DatePublished <= 0 || item.EnclosureLength == nil {
		slogSkipPodcastIndexEpisode(ctx, guid, "missing base fields")
		return piEpisodeResponse{}, errSkipPodcastIndexEpisode
	}

	audioURL, ok := normalizeRequiredHTTPURL(item.EnclosureURL)
	if !ok {
		return piEpisodeResponse{}, &PodcastIndexInvalidResponseError{
			Message: "podcastindex episode item has invalid audio url",
		}
	}

	link, _ := normalizeRequiredHTTPURL(item.Link)
	artworkURL, ok := normalizeOptionalEpisodeArtworkURL(image)
	if !ok {
		slogSkipPodcastIndexEpisode(ctx, guid, "invalid artwork url")
		return piEpisodeResponse{}, errSkipPodcastIndexEpisode
	}

	var duration int64
	if item.Duration != nil {
		if *item.Duration < 0 {
			slogSkipPodcastIndexEpisode(ctx, guid, "negative duration")
			return piEpisodeResponse{}, errSkipPodcastIndexEpisode
		}
		duration = *item.Duration
	}
	fileSize := *item.EnclosureLength
	if fileSize <= 0 {
		slogSkipPodcastIndexEpisode(ctx, guid, "non-positive enclosure length")
		return piEpisodeResponse{}, errSkipPodcastIndexEpisode
	}

	var seasonNumber *int64
	if item.Season != nil && *item.Season >= 0 {
		season := *item.Season
		seasonNumber = &season
	}

	var episodeNumber *int64
	if item.Episode != nil && *item.Episode >= 0 {
		episode := *item.Episode
		episodeNumber = &episode
	}

	episodeType := normalizePodcastIndexEpisodeType(item.EpisodeType)
	transcriptURL := normalizeOptionalHTTPURL(item.TranscriptURL)

	return piEpisodeResponse{
		GUID:          guid,
		Title:         title,
		Description:   description,
		AudioURL:      audioURL,
		PubDate:       item.DatePublished,
		ArtworkURL:    artworkURL,
		FileSize:      fileSize,
		Duration:      duration,
		Explicit:      item.Explicit != 0,
		Link:          link,
		SeasonNumber:  seasonNumber,
		EpisodeNumber: episodeNumber,
		EpisodeType:   episodeType,
		TranscriptURL: transcriptURL,
	}, nil
}

func boundPIEpisodeSnapshotResponse(ctx context.Context, response piEpisodeResponse) (piEpisodeResponse, bool) {
	if !isBoundedPIString(response.GUID, PISnapshotMaxEpisodeGUIDBytes) {
		slogSkipPodcastIndexEpisode(ctx, response.GUID, "oversized guid")
		return piEpisodeResponse{}, false
	}
	if !isBoundedPIString(response.Title, PISnapshotMaxEpisodeTitleBytes) {
		slogSkipPodcastIndexEpisode(ctx, response.GUID, "oversized title")
		return piEpisodeResponse{}, false
	}
	if !isBoundedPIString(response.Description, PISnapshotMaxEpisodeDescriptionBytes) {
		slogSkipPodcastIndexEpisode(ctx, response.GUID, "oversized description")
		return piEpisodeResponse{}, false
	}
	if !isBoundedPIString(response.AudioURL, PISnapshotMaxURLBytes) {
		slogSkipPodcastIndexEpisode(ctx, response.GUID, "oversized audio url")
		return piEpisodeResponse{}, false
	}
	if !isBoundedPIString(response.ArtworkURL, PISnapshotMaxURLBytes) {
		slogSkipPodcastIndexEpisode(ctx, response.GUID, "oversized artwork url")
		return piEpisodeResponse{}, false
	}
	if !isBoundedPIString(response.Link, PISnapshotMaxURLBytes) {
		response.Link = ""
	}
	if !isBoundedPIString(response.TranscriptURL, PISnapshotMaxURLBytes) {
		response.TranscriptURL = ""
	}
	return response, true
}

func piSnapshotEpisodeFingerprint(response piEpisodeResponse) string {
	var b strings.Builder
	appendPIFingerprintPart(&b, response.GUID)
	appendPIFingerprintPart(&b, response.Title)
	appendPIFingerprintPart(&b, response.Description)
	appendPIFingerprintPart(&b, response.AudioURL)
	appendPIFingerprintPart(&b, strconv.FormatInt(response.PubDate, 10))
	appendPIFingerprintPart(&b, response.ArtworkURL)
	appendPIFingerprintPart(&b, strconv.FormatInt(response.FileSize, 10))
	appendPIFingerprintPart(&b, strconv.FormatInt(response.Duration, 10))
	appendPIFingerprintPart(&b, strconv.FormatBool(response.Explicit))
	appendPIFingerprintPart(&b, response.Link)
	appendPIFingerprintInt64Ptr(&b, response.SeasonNumber)
	appendPIFingerprintInt64Ptr(&b, response.EpisodeNumber)
	appendPIFingerprintPart(&b, response.EpisodeType)
	appendPIFingerprintPart(&b, response.TranscriptURL)
	return b.String()
}

func appendPIFingerprintInt64Ptr(b *strings.Builder, value *int64) {
	if value == nil {
		appendPIFingerprintPart(b, "")
		return
	}
	appendPIFingerprintPart(b, strconv.FormatInt(*value, 10))
}

func appendPIFingerprintPart(b *strings.Builder, value string) {
	b.WriteString(strconv.Itoa(len(value)))
	b.WriteByte(':')
	b.WriteString(value)
	b.WriteByte('|')
}

func mapPIEpisodeResponseToSnapshot(podcastItunesID string, response piEpisodeResponse, publishedAtUnix int64) PIEpisodeSnapshot {
	publishedAt := time.Unix(publishedAtUnix, 0).UTC()
	explicit := response.Explicit
	return PIEpisodeSnapshot{
		PodcastItunesID: podcastItunesID,
		EpisodeGUID:     response.GUID,
		Title:           response.Title,
		Description:     response.Description,
		EnclosureURL:    response.AudioURL,
		PublishedAt:     publishedAt,
		PublishedAtUnix: publishedAtUnix,
		DurationSeconds: response.Duration,
		Image:           response.ArtworkURL,
		EpisodeNumber:   cloneInt64Ptr(response.EpisodeNumber),
		SeasonNumber:    cloneInt64Ptr(response.SeasonNumber),
		EpisodeType:     response.EpisodeType,
		Explicit:        &explicit,
		Link:            response.Link,
		EnclosureLength: cloneInt64Ptr(&response.FileSize),
		TranscriptURL:   response.TranscriptURL,
	}
}

func trimBoundedPIString(value string, maxBytes int) (string, bool) {
	trimmed := strings.TrimSpace(value)
	return trimmed, len(trimmed) <= maxBytes
}

func isBoundedPIString(value string, maxBytes int) bool {
	return len(value) <= maxBytes
}

func estimatePISnapshotApproxBytes(snapshot PIPodcastSnapshot) int64 {
	size := int64(PISnapshotPodcastRowOverhead)
	size += int64(len(snapshot.PodcastItunesID) + len(snapshot.Title) + len(snapshot.Description) + len(snapshot.Author))
	size += int64(len(snapshot.Image) + len(snapshot.FeedURL) + len(snapshot.Language))
	for _, category := range snapshot.Categories {
		size += int64(len(category))
	}

	for _, episode := range snapshot.Episodes {
		size += int64(PISnapshotEpisodeRowOverhead)
		size += int64(len(episode.PodcastItunesID) + len(episode.EpisodeGUID) + len(episode.Title))
		size += int64(len(episode.Description) + len(episode.EnclosureURL) + len(episode.Image))
		size += int64(len(episode.EpisodeType) + len(episode.Link) + len(episode.TranscriptURL))
	}
	return size
}

func UnixPISnapshotTime(value time.Time) int64 {
	if value.IsZero() {
		return 0
	}
	return value.UTC().Unix()
}

func cloneInt64Ptr(value *int64) *int64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneBoolPtr(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func slogSkipPodcastSnapshot(ctx context.Context, podcastItunesID string, reason string) {
	slog.DebugContext(ctx, "skipping podcast snapshot", "itunes_id", podcastItunesID, "reason", reason)
}

func slogSkipPodcastIndexEpisode(ctx context.Context, guid string, reason string) {
	slog.DebugContext(ctx, "skipping episode",
		"guid_len", len(guid),
		"guid_sha1", piEpisodeGUIDLogHash(guid),
		"reason", reason,
	)
}

func piEpisodeGUIDLogHash(guid string) string {
	if guid == "" {
		return ""
	}
	sum := sha1.Sum([]byte(guid))
	return fmt.Sprintf("%x", sum)[:12]
}

func normalizePodcastIndexEpisodeType(raw *string) string {
	if raw == nil {
		return ""
	}

	switch strings.ToLower(strings.TrimSpace(*raw)) {
	case "full", "trailer", "bonus":
		return strings.ToLower(strings.TrimSpace(*raw))
	default:
		return ""
	}
}

func normalizeOptionalHTTPURL(raw *string) string {
	if raw == nil {
		return ""
	}

	normalized, ok := normalizeRequiredHTTPURL(*raw)
	if !ok {
		return ""
	}

	return normalized
}

func normalizeOptionalEpisodeArtworkURL(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", true
	}

	return normalizeRequiredHTTPURL(trimmed)
}

func normalizeRequiredHTTPURL(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", false
	}
	if parsed.Host == "" {
		return "", false
	}

	return parsed.String(), true
}

func normalizeItunesID(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", errors.New("itunesId query parameter is required")
	}
	value, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil || value == 0 {
		return "", errors.New("itunesId must be a valid numeric Apple podcast id")
	}
	return strconv.FormatUint(value, 10), nil
}
