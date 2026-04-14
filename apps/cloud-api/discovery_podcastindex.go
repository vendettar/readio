package main

import (
	"context"
	"crypto/sha1"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	podcastIndexBaseURL      = "https://api.podcastindex.org/api/1.0"
	podcastIndexAuthTimeout  = 5 * time.Second
	podcastIndexFetchTimeout = 15 * time.Second

	podcastIndexAPIKeyEnv    = "PODCAST_INDEX_API_KEY"
	podcastIndexAPISecretEnv = "PODCAST_INDEX_API_SECRET"
	podcastIndexUserAgentEnv = "PODCAST_INDEX_USER_AGENT"

	podcastIndexCacheTTLEpisodes = 4 * time.Hour
)

type podcastIndexConfig struct {
	apiKey    string
	apiSecret string
	userAgent string
}

type discoveryProviderConfigError struct {
	provider string
	message  string
}

func (e *discoveryProviderConfigError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func getPodcastIndexConfig() podcastIndexConfig {
	return podcastIndexConfig{
		apiKey:    strings.TrimSpace(os.Getenv(podcastIndexAPIKeyEnv)),
		apiSecret: strings.TrimSpace(os.Getenv(podcastIndexAPISecretEnv)),
		userAgent: strings.TrimSpace(os.Getenv(podcastIndexUserAgentEnv)),
	}
}

type podcastIndexEpisode struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	Link            string `json:"link,omitempty"`
	Description     string `json:"description,omitempty"`
	GUID            string `json:"guid,omitempty"`
	DatePublished   int64  `json:"datePublished"`
	EnclosureURL    string `json:"enclosureUrl,omitempty"`
	EnclosureType   string `json:"enclosureType,omitempty"`
	EnclosureLength int64  `json:"enclosureLength,omitempty"`
	Duration        int64  `json:"duration,omitempty"`
	Image           string `json:"image,omitempty"`
	Explicit        int    `json:"explicit,omitempty"`
	FeedID          int64  `json:"feedId,omitempty"`
	PodcastGUID     string `json:"podcastGuid,omitempty"`
	FeedItunesID    int64  `json:"feedItunesId,omitempty"`
	FeedLanguage    string `json:"feedLanguage,omitempty"`
	FeedTitle       string `json:"feedTitle,omitempty"`
	FeedImage       string `json:"feedImage,omitempty"`
	FeedURL         string `json:"feedUrl,omitempty"`
}

type podcastIndexEpisodesResponse struct {
	Status string                `json:"status"`
	Items  []podcastIndexEpisode `json:"items"`
	Count  int                   `json:"count"`
}

type podcastIndexEpisodeByGUIDItem struct {
	ID            int64  `json:"id"`
	Title         string `json:"title"`
	Link          string `json:"link,omitempty"`
	Description   string `json:"description,omitempty"`
	GUID          string `json:"guid,omitempty"`
	DatePublished int64  `json:"datePublished"`
	EnclosureURL  string `json:"enclosureUrl,omitempty"`
	Duration      int64  `json:"duration,omitempty"`
	Image         string `json:"image,omitempty"`
	Explicit      int    `json:"explicit,omitempty"`
	Episode       int64  `json:"episode,omitempty"`
	EpisodeType   string `json:"episodeType,omitempty"`
	Season        int64  `json:"season,omitempty"`
	FeedItunesID  int64  `json:"feedItunesId,omitempty"`
	FeedImage     string `json:"feedImage,omitempty"`
	FeedID        int64  `json:"feedId,omitempty"`
	FeedTitle     string `json:"feedTitle,omitempty"`
	FeedLanguage  string `json:"feedLanguage,omitempty"`
	ChaptersURL   string `json:"chaptersUrl,omitempty"`
	TranscriptURL string `json:"transcriptUrl,omitempty"`
}

type podcastIndexEpisodeByGUIDResponse struct {
	Status      string                        `json:"status"`
	ID          int64                         `json:"id,omitempty"`
	URL         string                        `json:"url,omitempty"`
	PodcastGUID string                        `json:"podcastGuid,omitempty"`
	GUID        string                        `json:"guid,omitempty"`
	Episode     podcastIndexEpisodeByGUIDItem `json:"episode"`
	Description string                        `json:"description,omitempty"`
}

type podcastIndexFeedItunes struct {
	ID           int64             `json:"id"`
	PodcastGUID  string            `json:"podcastGuid,omitempty"`
	Title        string            `json:"title"`
	URL          string            `json:"url"`
	OriginalURL  string            `json:"originalUrl,omitempty"`
	Link         string            `json:"link,omitempty"`
	Description  string            `json:"description,omitempty"`
	Author       string            `json:"author,omitempty"`
	OwnerName    string            `json:"ownerName,omitempty"`
	Image        string            `json:"image,omitempty"`
	Artwork      string            `json:"artwork,omitempty"`
	ItunesID     int64             `json:"itunesId,omitempty"`
	Language     string            `json:"language,omitempty"`
	EpisodeCount int64             `json:"episodeCount,omitempty"`
	Categories   map[string]string `json:"categories,omitempty"`
}

type podcastIndexPodcastResponse struct {
	Status      string                 `json:"status"`
	Query       map[string]string      `json:"query,omitempty"`
	Feed        podcastIndexFeedItunes `json:"feed"`
	Description string                 `json:"description,omitempty"`
}

type podcastIndexSearchResponse struct {
	Status string                   `json:"status"`
	Feeds  []podcastIndexFeedItunes `json:"feeds"`
	Count  int                      `json:"count"`
}

type podcastIndexBatchPodcastResponse struct {
	Status      string                   `json:"status"`
	AllFound    bool                     `json:"allFound"`
	Found       int                      `json:"found"`
	Feeds       []podcastIndexFeedItunes `json:"feeds"`
	Description string                   `json:"description,omitempty"`
}

const podcastIndexGUIDMaxLength = 1024

func normalizePositiveDecimalID(
	input string,
	missingCode string,
	missingMessage string,
	invalidCode string,
	invalidMessage string,
) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", &discoveryParamError{
			code:    missingCode,
			message: missingMessage,
		}
	}

	value, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil || value == 0 {
		return "", &discoveryParamError{
			code:    invalidCode,
			message: invalidMessage,
		}
	}

	return strconv.FormatUint(value, 10), nil
}

func normalizeItunesID(input string) (string, error) {
	return normalizePositiveDecimalID(
		input,
		"MISSING_ITUNES_ID",
		"itunesId query parameter is required",
		"INVALID_ITUNES_ID",
		"itunesId must be a valid numeric Apple podcast id",
	)
}

func normalizePodcastGUID(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", &discoveryParamError{
			code:    "MISSING_PODCAST_GUID",
			message: "guid query parameter is required",
		}
	}

	if len(trimmed) > podcastIndexGUIDMaxLength {
		return "", &discoveryParamError{
			code:    "INVALID_PODCAST_GUID",
			message: "guid query parameter is too long",
		}
	}

	return trimmed, nil
}

func normalizePodcastIndexFeedID(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", &discoveryParamError{
			code:    "MISSING_FEED_ID",
			message: "feedId query parameter is required",
		}
	}

	if _, err := strconv.ParseInt(trimmed, 10, 64); err != nil {
		return "", &discoveryParamError{
			code:    "INVALID_FEED_ID",
			message: "feedId must be a valid numeric Podcast Index feed id",
		}
	}

	return trimmed, nil
}

func normalizeEpisodeGUID(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", &discoveryParamError{
			code:    "MISSING_EPISODE_GUID",
			message: "guid query parameter is required",
		}
	}

	if len(trimmed) > podcastIndexGUIDMaxLength {
		return "", &discoveryParamError{
			code:    "INVALID_EPISODE_GUID",
			message: "guid query parameter is too long",
		}
	}

	return trimmed, nil
}

func normalizePodcastIndexID(id string, idType string) (string, error) {
	if idType == "itunesid" {
		return normalizeItunesID(id)
	}
	return normalizePodcastIndexFeedID(id)
}

func (s *discoveryService) fetchPodcastIndexEpisodes(ctx context.Context, itunesID string, max int) ([]podcastIndexEpisode, error) {
	cfg := s.podcastIndexConfig
	if cfg.apiKey == "" || cfg.apiSecret == "" {
		return nil, &discoveryProviderConfigError{
			provider: "podcastindex",
			message:  "podcastindex: missing API credentials",
		}
	}

	normalizedItunesID, err := normalizeItunesID(itunesID)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: invalid itunes id: %w", err)
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	authHash := fmt.Sprintf("%s%s%s", cfg.apiKey, cfg.apiSecret, timestamp)
	authHash = fmt.Sprintf("%x", sha1.Sum([]byte(authHash)))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, podcastIndexBaseURL+"/episodes/byitunesid", nil)
	if err != nil {
		return nil, err
	}

	q := req.URL.Query()
	q.Set("id", normalizedItunesID)
	q.Set("max", strconv.Itoa(max))
	req.URL.RawQuery = q.Encode()

	req.Header.Set("User-Agent", cfg.userAgent)
	req.Header.Set("X-Auth-Key", cfg.apiKey)
	req.Header.Set("X-Auth-Date", timestamp)
	req.Header.Set("Authorization", authHash)

	var result podcastIndexEpisodesResponse
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	return result.Items, nil
}

func (s *discoveryService) fetchPodcastIndexEpisodeByGUID(
	ctx context.Context,
	id string,
	episodeGUID string,
	idType string,
) (*podcastIndexEpisodeByGUIDResponse, error) {
	cfg := s.podcastIndexConfig
	if cfg.apiKey == "" || cfg.apiSecret == "" {
		return nil, &discoveryProviderConfigError{
			provider: "podcastindex",
			message:  "podcastindex: missing API credentials",
		}
	}

	normalizedID, err := normalizePodcastIndexID(id, idType)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: invalid %s: %w", idType, err)
	}

	normalizedEpisodeGUID, err := normalizeEpisodeGUID(episodeGUID)
	if err != nil {
		return nil, err
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	authHash := fmt.Sprintf("%s%s%s", cfg.apiKey, cfg.apiSecret, timestamp)
	authHash = fmt.Sprintf("%x", sha1.Sum([]byte(authHash)))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, podcastIndexBaseURL+"/episodes/byguid", nil)
	if err != nil {
		return nil, err
	}

	q := req.URL.Query()
	q.Set("guid", normalizedEpisodeGUID)
	if idType == "itunesid" {
		q.Set("itunesid", normalizedID)
	} else {
		q.Set("feedid", normalizedID)
	}
	req.URL.RawQuery = q.Encode()

	req.Header.Set("User-Agent", cfg.userAgent)
	req.Header.Set("X-Auth-Key", cfg.apiKey)
	req.Header.Set("X-Auth-Date", timestamp)
	req.Header.Set("Authorization", authHash)

	var result podcastIndexEpisodeByGUIDResponse
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (s *discoveryService) fetchPodcastIndexPodcastByItunesID(ctx context.Context, itunesID string) (*podcastIndexFeedItunes, error) {
	cfg := s.podcastIndexConfig
	if cfg.apiKey == "" || cfg.apiSecret == "" {
		return nil, &discoveryProviderConfigError{
			provider: "podcastindex",
			message:  "podcastindex: missing API credentials",
		}
	}

	normalizedItunesID, err := normalizeItunesID(itunesID)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: invalid itunes id: %w", err)
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	authHash := fmt.Sprintf("%s%s%s", cfg.apiKey, cfg.apiSecret, timestamp)
	authHash = fmt.Sprintf("%x", sha1.Sum([]byte(authHash)))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, podcastIndexBaseURL+"/podcasts/byitunesid", nil)
	if err != nil {
		return nil, err
	}

	q := req.URL.Query()
	q.Set("id", normalizedItunesID)
	req.URL.RawQuery = q.Encode()

	req.Header.Set("User-Agent", cfg.userAgent)
	req.Header.Set("X-Auth-Key", cfg.apiKey)
	req.Header.Set("X-Auth-Date", timestamp)
	req.Header.Set("Authorization", authHash)

	var result podcastIndexPodcastResponse
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	return &result.Feed, nil
}

func (s *discoveryService) fetchPodcastIndexPodcastsBatchByGUID(ctx context.Context, guids []string) ([]podcastIndexFeedItunes, error) {
	cfg := s.podcastIndexConfig
	if cfg.apiKey == "" || cfg.apiSecret == "" {
		return nil, &discoveryProviderConfigError{
			provider: "podcastindex",
			message:  "podcastindex: missing API credentials",
		}
	}

	body, err := json.Marshal(guids)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: encode guid batch: %w", err)
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	authHash := fmt.Sprintf("%s%s%s", cfg.apiKey, cfg.apiSecret, timestamp)
	authHash = fmt.Sprintf("%x", sha1.Sum([]byte(authHash)))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, podcastIndexBaseURL+"/podcasts/batch/byguid", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", cfg.userAgent)
	req.Header.Set("X-Auth-Key", cfg.apiKey)
	req.Header.Set("X-Auth-Date", timestamp)
	req.Header.Set("Authorization", authHash)

	var result podcastIndexBatchPodcastResponse
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	return result.Feeds, nil
}

type podcastIndexEpisodesResponseJSON struct {
	Episodes []episodeLookupResponse `json:"episodes"`
}

func (s *discoveryService) handlePodcastIndexEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastIndexEpisodesRoute

	guid := strings.TrimSpace(r.URL.Query().Get("guid"))
	itunesIDFromQuery := strings.TrimSpace(r.URL.Query().Get("podcastItunesId"))

	// Singular Episode Resolution (Podcast Index /episodes/byguid)
	if guid != "" && itunesIDFromQuery != "" {
		normalizedGUID, err := normalizeEpisodeGUID(guid)
		if err != nil {
			writeDiscoveryMappedError(w, err)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}

		normalizedID, err := normalizePodcastIndexID(itunesIDFromQuery, "itunesid")
		if err != nil {
			writeDiscoveryMappedError(w, err)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}

		cacheKey := fmt.Sprintf("podcastindex-episode:guid:%s:itunesid:%s", normalizedGUID, normalizedID)
		ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
		defer cancel()

		fetch := func(ctx context.Context) (any, error) {
			result, err := s.fetchPodcastIndexEpisodeByGUID(ctx, normalizedID, normalizedGUID, "itunesid")
			if err != nil {
				return nil, errors.Join(errDiscoveryUpstreamError, err)
			}
			if result == nil {
				return nil, nil
			}

			duration := float64(result.Episode.Duration)
			itunesID := ""
			if result.Episode.FeedItunesID > 0 {
				itunesID = strconv.FormatInt(result.Episode.FeedItunesID, 10)
			}
			resolvedFeedID := result.Episode.FeedID
			if resolvedFeedID <= 0 {
				resolvedFeedID = result.ID
			}
			episode := episodeLookupResponse{
				ID:          firstNonEmpty(strings.TrimSpace(result.Episode.GUID), strconv.FormatInt(result.Episode.ID, 10)),
				Title:       strings.TrimSpace(result.Episode.Title),
				Description: strings.TrimSpace(result.Episode.Description),
				AudioURL:    strings.TrimSpace(result.Episode.EnclosureURL),
				PubDate:     formatUnixTimestamp(result.Episode.DatePublished),
				ArtworkURL:  firstNonEmpty(strings.TrimSpace(result.Episode.Image), strings.TrimSpace(result.Episode.FeedImage)),
				Duration:    &duration,
				FeedURL:     strings.TrimSpace(result.URL),
				FeedID:      strconv.FormatInt(resolvedFeedID, 10),
				PodcastGUID: strings.TrimSpace(result.PodcastGUID),
				PodcastItunesID: itunesID,
				EpisodeGUID: strings.TrimSpace(result.Episode.GUID),
				Language:    strings.TrimSpace(result.Episode.FeedLanguage),
			}
			return episode, nil
		}

		data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, podcastIndexCacheTTLEpisodes, fetch)
		if err != nil {
			var configErr *discoveryProviderConfigError
			if errors.As(err, &configErr) {
				slog.Error("podcastindex episode-byguid lookup unavailable", "error", err, "provider", configErr.provider)
				writeDiscoveryError(
					w,
					http.StatusServiceUnavailable,
					"DISCOVERY_PROVIDER_NOT_CONFIGURED",
					"podcastindex provider is not configured",
				)
				logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
				return
			}

			slog.Warn("podcastindex episode-byguid lookup failed", "error", err)
			writeDiscoveryMappedError(w, err)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
			return
		}

		writeDiscoveryJSON(w, http.StatusOK, data)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
		return
	}

	itunesID := itunesIDFromQuery
	if itunesID == "" {
		writeDiscoveryError(w, http.StatusBadRequest, "MISSING_IDENTIFIER", "podcastItunesId query parameter is required")
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("missing identifier"), CacheStatusMissError)
		return
	}

	normalizedItunesID, err := normalizeItunesID(itunesID)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	itunesID = normalizedItunesID

	limit, err := parseDiscoveryLimit(
		r.URL.Query(),
		"limit",
		defaultDiscoveryLookupEpisodesLimit,
		maxDiscoveryLookupEpisodesLimit,
	)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("podcastindex-episodes:itunes:%s:%d", itunesID, limit)
	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) (any, error) {
		items, err := s.fetchPodcastIndexEpisodes(ctx, itunesID, limit)

		if err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}

		episodes := make([]episodeLookupResponse, 0, len(items))
		for _, item := range items {
			duration := float64(item.Duration)
			id := firstNonEmpty(strings.TrimSpace(item.GUID), strconv.FormatInt(item.ID, 10))
			itunesIDForMeta := itunesID
			if item.FeedItunesID > 0 {
				itunesIDForMeta = strconv.FormatInt(item.FeedItunesID, 10)
			}
			episodes = append(episodes, episodeLookupResponse{
				ID:          id,
				Title:       item.Title,
				Description: item.Description,
				AudioURL:    item.EnclosureURL,
				PubDate:     formatUnixTimestamp(item.DatePublished),
				ArtworkURL:  item.Image,
				Duration:    &duration,
				FeedID:      strconv.FormatInt(item.FeedID, 10),
				PodcastGUID: item.PodcastGUID,
				PodcastItunesID: itunesIDForMeta,
				EpisodeGUID: strings.TrimSpace(item.GUID),
			})
		}
		return podcastIndexEpisodesResponseJSON{Episodes: episodes}, nil
	}

	data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, podcastIndexCacheTTLEpisodes, fetch)
	if err != nil {
		var configErr *discoveryProviderConfigError
		if errors.As(err, &configErr) {
			slog.Error("podcastindex supplementary lookup unavailable", "error", err, "provider", configErr.provider)
			writeDiscoveryError(
				w,
				http.StatusServiceUnavailable,
				"DISCOVERY_PROVIDER_NOT_CONFIGURED",
				"podcastindex provider is not configured",
			)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
			return
		}

		slog.Warn("podcastindex supplementary lookup failed", "error", err)
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	resp, ok := data.(podcastIndexEpisodesResponseJSON)
	if !ok {
		writeDiscoveryError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "invalid response type")
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("invalid response type"), CacheStatusMissError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp.Episodes); err != nil {
		slog.Warn("podcastindex: failed to encode response", "error", err)
	}
	logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handlePodcastIndexPodcastsBatchByGUID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastIndexPodcastsBatchByGUIDRoute

	if r.Method != http.MethodPost {
		writeDiscoveryError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("method not allowed"), CacheStatusMissError)
		return
	}

	var input []string
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, "INVALID_GUID_BATCH", "request body must be a JSON array of podcast GUIDs")
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	if len(input) == 0 {
		writeDiscoveryJSON(w, http.StatusOK, []discoveryPodcastResponse{})
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusUncached)
		return
	}

	normalizedGUIDs := make([]string, 0, len(input))
	for _, guid := range input {
		normalizedGUID, err := normalizePodcastGUID(guid)
		if err != nil {
			writeDiscoveryMappedError(w, err)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}
		normalizedGUIDs = append(normalizedGUIDs, normalizedGUID)
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	feeds, err := s.fetchPodcastIndexPodcastsBatchByGUID(ctx, normalizedGUIDs)
	if err != nil {
		var configErr *discoveryProviderConfigError
		if errors.As(err, &configErr) {
			slog.Error("podcastindex guid batch unavailable", "error", err, "provider", configErr.provider)
			writeDiscoveryError(
				w,
				http.StatusServiceUnavailable,
				"DISCOVERY_PROVIDER_NOT_CONFIGURED",
				"podcastindex provider is not configured",
			)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}

		slog.Warn("podcastindex guid batch failed", "error", err)
		writeDiscoveryMappedError(w, errors.Join(errDiscoveryUpstreamError, err))
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	byGUID := make(map[string]podcastIndexFeedSummaryResponse, len(feeds))
	for _, feed := range feeds {
		mapped, ok := mapPodcastIndexFeedToSummaryResponse(feed, feed.PodcastGUID)
		if !ok {
			continue
		}
		byGUID[mapped.PodcastGUID] = mapped
	}

	resp := make([]podcastIndexFeedSummaryResponse, 0, len(normalizedGUIDs))
	for _, guid := range normalizedGUIDs {
		if mapped, ok := byGUID[guid]; ok {
			resp = append(resp, mapped)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, resp)
	logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handlePodcastIndexPodcastByItunesID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastIndexPodcastByItunesIDRoute

	podcastItunesID, err := normalizeItunesID(r.URL.Query().Get("podcastItunesId"))
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("podcastindex-podcast-itunes:%s", podcastItunesID)

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) (any, error) {
		feed, err := s.fetchPodcastIndexPodcastByItunesID(ctx, podcastItunesID)
		if err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}
		if feed == nil || feed.ID == 0 {
			return nil, nil
		}
		parsedID, _ := strconv.ParseInt(podcastItunesID, 10, 64)
		mapped, ok := mapPodcastIndexPodcastToDiscoveryPodcast(*feed, parsedID)
		if !ok {
			return nil, nil
		}
		return mapped, nil
	}

	data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, discoveryCacheTTLLookup, fetch)
	if err != nil {
		var configErr *discoveryProviderConfigError
		if errors.As(err, &configErr) {
			slog.Error("podcastindex itunesId lookup unavailable", "error", err, "provider", configErr.provider)
			writeDiscoveryError(
				w,
				http.StatusServiceUnavailable,
				"DISCOVERY_PROVIDER_NOT_CONFIGURED",
				"podcastindex provider is not configured",
			)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
			return
		}

		slog.Warn("podcastindex itunesId lookup failed", "error", err)
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	if data == nil {
		writeDiscoveryJSON(w, http.StatusOK, nil)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
		return
	}

	resp, ok := data.(discoveryPodcastResponse)
	if !ok {
		writeDiscoveryError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "invalid response type")
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("invalid response type"), CacheStatusMissError)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, resp)
	logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
}

func mapPodcastIndexPodcastToDiscoveryPodcast(feed podcastIndexFeedItunes, itunesID int64) (discoveryPodcastResponse, bool) {
	id := itunesID
	if id == 0 {
		id = feed.ItunesID
	}
	if id == 0 && feed.ID == 0 {
		return discoveryPodcastResponse{}, false
	}

	genres := make([]discoveryGenre, 0, len(feed.Categories))
	for catID, name := range feed.Categories {
		name = strings.TrimSpace(name)
		if name != "" {
			genres = append(genres, discoveryGenre{GenreID: catID, Name: name})
		}
	}

	var itunesIDStr string
	if id > 0 {
		itunesIDStr = strconv.FormatInt(id, 10)
	}

	return discoveryPodcastResponse{
		ID:              strconv.FormatInt(feed.ID, 10),
		Title:           feed.Title,
		URL:             feed.Link,
		FeedURL:         strings.TrimSpace(feed.URL),
		Genres:          genres,
		Description:     strings.TrimSpace(feed.Description),
		PodcastItunesID: itunesIDStr,
		FeedID:          strconv.FormatInt(feed.ID, 10),
		PodcastGUID:     strings.TrimSpace(feed.PodcastGUID),
		Language:        strings.TrimSpace(feed.Language),
		EpisodeCount:    asOptionalInt64(feed.EpisodeCount),
	}, true
}

func mapPodcastIndexFeedToSummaryResponse(feed podcastIndexFeedItunes, fallbackGUID string) (podcastIndexFeedSummaryResponse, bool) {
	podcastGUID := strings.TrimSpace(feed.PodcastGUID)
	if podcastGUID == "" {
		podcastGUID = strings.TrimSpace(fallbackGUID)
	}
	if feed.ID <= 0 || podcastGUID == "" || strings.TrimSpace(feed.Title) == "" {
		return podcastIndexFeedSummaryResponse{}, false
	}

	categories := make(map[string]string, len(feed.Categories))
	for key, name := range feed.Categories {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		categories[key] = name
	}

	var itunesID *int64
	if feed.ItunesID > 0 {
		itunesID = &feed.ItunesID
	}

	return podcastIndexFeedSummaryResponse{
		ID:              feed.ID,
		Title:           strings.TrimSpace(feed.Title),
		URL:             strings.TrimSpace(feed.URL),
		OriginalURL:     strings.TrimSpace(feed.OriginalURL),
		Link:            strings.TrimSpace(feed.Link),
		Description:     strings.TrimSpace(feed.Description),
		Author:          strings.TrimSpace(feed.Author),
		OwnerName:       strings.TrimSpace(feed.OwnerName),
		Image:           strings.TrimSpace(feed.Image),
		Artwork:         strings.TrimSpace(feed.Artwork),
		PodcastItunesID: itunesID,
		Language:        strings.TrimSpace(feed.Language),
		Categories:      categories,
		PodcastGUID:     podcastGUID,
		EpisodeCount:    asOptionalInt64(feed.EpisodeCount),
	}, true
}

func formatUnixTimestamp(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).UTC().Format(time.RFC3339)
}
