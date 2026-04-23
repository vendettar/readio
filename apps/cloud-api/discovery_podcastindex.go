package main

import (
	"context"
	"crypto/sha1"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	podcastIndexBaseURL          = "https://api.podcastindex.org/api/1.0"
	podcastIndexAuthTimeout      = 5 * time.Second
	podcastIndexFetchTimeout     = 15 * time.Second
	podcastIndexAPIKeyEnv        = "PODCAST_INDEX_API_KEY"
	podcastIndexAPISecretEnv     = "PODCAST_INDEX_API_SECRET"
	podcastIndexUserAgentEnv     = "PODCAST_INDEX_USER_AGENT"
	podcastIndexMaxBatchGUIDs    = 100
	podcastIndexMaxBatchBodySize = 10 * 1024
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

func (s *discoveryService) buildPodcastIndexRequest(ctx context.Context, method, urlPath string, body io.Reader) (*http.Request, error) {
	cfg := s.podcastIndexConfig
	if cfg.apiKey == "" || cfg.apiSecret == "" {
		return nil, &discoveryProviderConfigError{
			provider: "podcastindex",
			message:  "podcastindex: missing API credentials",
		}
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	authHash := fmt.Sprintf("%s%s%s", cfg.apiKey, cfg.apiSecret, timestamp)
	authHash = fmt.Sprintf("%x", sha1.Sum([]byte(authHash)))

	req, err := http.NewRequestWithContext(ctx, method, podcastIndexBaseURL+urlPath, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", cfg.userAgent)
	req.Header.Set("X-Auth-Key", cfg.apiKey)
	req.Header.Set("X-Auth-Date", timestamp)
	req.Header.Set("Authorization", authHash)

	return req, nil
}

type podcastIndexInvalidResponseError struct {
	message string
}

func (e *podcastIndexInvalidResponseError) Error() string {
	return e.message
}

type podcastIndexCategoryNames []string

func (c *podcastIndexCategoryNames) UnmarshalJSON(data []byte) error {
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

type podcastIndexPodcastFeed struct {
	Title          string                    `json:"title"`
	URL            string                    `json:"url"`
	Description    string                    `json:"description"`
	Author         string                    `json:"author"`
	Artwork        string                    `json:"artwork"`
	LastUpdateTime int64                     `json:"lastUpdateTime"`
	ItunesID       int64                     `json:"itunesId"`
	Language       string                    `json:"language"`
	EpisodeCount   int64                     `json:"episodeCount"`
	Dead           int                       `json:"dead"`
	Categories     podcastIndexCategoryNames `json:"categories"`
}

type podcastIndexPodcastResponse struct {
	Feed podcastIndexPodcastFeed `json:"feed"`
}

type podcastIndexBatchFeed struct {
	PodcastGUID string `json:"podcastGuid,omitempty"`
	podcastIndexPodcastFeed
}

type podcastIndexBatchPodcastResponse struct {
	Feeds []podcastIndexBatchFeed `json:"feeds"`
}

// Route-local bridge for batch-by-guid only.
// orderingGUID stays backend-internal for response ordering;
// response is the final cloud DTO emitted to the frontend.
type podcastIndexBatchFeedBridge struct {
	orderingGUID string
	response     piPodcastResponse
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

func (s *discoveryService) fetchPodcastIndexPodcastByItunesID(ctx context.Context, itunesID string) (*podcastIndexPodcastFeed, error) {
	normalizedItunesID, err := normalizeItunesID(itunesID)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: invalid itunes id: %w", err)
	}

	req, err := s.buildPodcastIndexRequest(ctx, http.MethodGet, "/podcasts/byitunesid", nil)
	if err != nil {
		return nil, err
	}

	q := req.URL.Query()
	q.Set("id", normalizedItunesID)
	req.URL.RawQuery = q.Encode()

	var result podcastIndexPodcastResponse
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	return &result.Feed, nil
}

func (s *discoveryService) fetchPodcastIndexPodcastsBatchByGUID(ctx context.Context, guids []string) ([]podcastIndexBatchFeed, error) {
	seen := make(map[string]bool, len(guids))
	uniqueGUIDs := make([]string, 0, len(guids))
	for _, g := range guids {
		if !seen[g] {
			seen[g] = true
			uniqueGUIDs = append(uniqueGUIDs, g)
		}
	}

	if len(uniqueGUIDs) > podcastIndexMaxBatchGUIDs {
		return nil, fmt.Errorf("podcastindex: too many GUIDs (max %d)", podcastIndexMaxBatchGUIDs)
	}

	body, err := json.Marshal(uniqueGUIDs)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: encode guid batch: %w", err)
	}

	if len(body) > podcastIndexMaxBatchBodySize {
		return nil, fmt.Errorf("podcastindex: request body too large (max %d bytes)", podcastIndexMaxBatchBodySize)
	}

	req, err := s.buildPodcastIndexRequest(ctx, http.MethodPost, "/podcasts/batch/byguid", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	var result podcastIndexBatchPodcastResponse
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	return result.Feeds, nil
}

func (s *discoveryService) handlePodcastIndexPodcastsBatchByGUID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastIndexPodcastsBatchByGUIDRoute

	if r.Method != http.MethodPost {
		writeDiscoveryErrorSpec(w, http.StatusMethodNotAllowed, discoveryErrSimpleMethodNotAllowed)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("method not allowed"), CacheStatusMissError)
		return
	}

	if !s.allowPodcastIndexRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	if r.ContentLength > podcastIndexMaxBatchBodySize {
		writeDiscoveryErrorSpec(w, http.StatusRequestEntityTooLarge, discoveryErrBodyTooLarge)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("body too large"), CacheStatusMissError)
		return
	}

	bodyReader := r.Body
	if r.ContentLength == -1 {
		bodyReader = http.MaxBytesReader(w, r.Body, podcastIndexMaxBatchBodySize)
	}

	var input []string
	if err := json.NewDecoder(bodyReader).Decode(&input); err != nil {
		writeDiscoveryErrorSpec(w, http.StatusBadRequest, discoveryErrInvalidGuidBatch)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	if len(input) == 0 {
		writeDiscoveryJSON(w, http.StatusOK, []piPodcastResponse{})
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusUncached)
		return
	}

	normalizedGUIDs := make([]string, 0, len(input))
	seen := make(map[string]struct{}, len(input))
	for _, guid := range input {
		normalizedGUID, err := normalizePodcastGUID(guid)
		if err != nil {
			writeDiscoveryMappedError(w, err)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}
		if _, dup := seen[normalizedGUID]; dup {
			continue
		}
		seen[normalizedGUID] = struct{}{}
		normalizedGUIDs = append(normalizedGUIDs, normalizedGUID)
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	feeds, err := s.fetchPodcastIndexPodcastsBatchByGUID(ctx, normalizedGUIDs)
	if err != nil {
		var configErr *discoveryProviderConfigError
		if errors.As(err, &configErr) {
			slog.Error("podcastindex guid batch unavailable", "error", err, "provider", configErr.provider)
			writeDiscoveryErrorSpec(w, http.StatusServiceUnavailable, discoveryErrProviderNotConfigured)
			logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}

		slog.Warn("podcastindex guid batch failed", "error", err)
		writeDiscoveryMappedError(w, errors.Join(errDiscoveryUpstreamError, err))
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	bridges := make([]podcastIndexBatchFeedBridge, 0, len(feeds))
	for _, feed := range feeds {
		bridge, ok := mapPodcastIndexBatchFeedBridge(feed)
		if !ok {
			continue
		}
		bridges = append(bridges, bridge)
	}

	guidToIndex := make(map[string]int, len(bridges))
	for i, bridge := range bridges {
		guidToIndex[bridge.orderingGUID] = i
	}

	resp := make([]piPodcastResponse, 0, len(normalizedGUIDs))
	for _, guid := range normalizedGUIDs {
		if idx, ok := guidToIndex[guid]; ok {
			resp = append(resp, bridges[idx].response)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, resp)
	logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handlePodcastIndexPodcastByItunesID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastIndexPodcastByItunesIDRoute

	if !s.allowPodcastIndexRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	podcastItunesID, err := normalizeItunesID(r.URL.Query().Get("podcastItunesId"))
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("podcastindex-podcast-itunes:%s", podcastItunesID)

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) (*piPodcastResponse, error) {
		feed, err := s.fetchPodcastIndexPodcastByItunesID(ctx, podcastItunesID)
		if err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}
		if feed == nil {
			return nil, nil
		}
		mapped, ok := mapPodcastIndexPodcastToPIPodcast(*feed, podcastItunesID)
		if !ok {
			return nil, nil
		}
		return &mapped, nil
	}

	data, cacheStatus, err := getWithGracefulDegradation(s, ctx, cacheKey, discoveryCacheTTLLookup, fetch)
	if err != nil {
		var configErr *discoveryProviderConfigError
		if errors.As(err, &configErr) {
			slog.Error("podcastindex itunesId lookup unavailable", "error", err, "provider", configErr.provider)
			writeDiscoveryErrorSpec(w, http.StatusServiceUnavailable, discoveryErrProviderNotConfigured)
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

	writeDiscoveryJSON(w, http.StatusOK, data)
	logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
}

func mapPodcastIndexBatchFeedBridge(feed podcastIndexBatchFeed) (podcastIndexBatchFeedBridge, bool) {
	orderingGUID := strings.TrimSpace(feed.PodcastGUID)
	if orderingGUID == "" {
		return podcastIndexBatchFeedBridge{}, false
	}

	podcast, ok := mapPodcastIndexPodcastToPIPodcast(
		feed.podcastIndexPodcastFeed,
		strconv.FormatInt(feed.ItunesID, 10),
	)
	if !ok {
		return podcastIndexBatchFeedBridge{}, false
	}

	return podcastIndexBatchFeedBridge{
		orderingGUID: orderingGUID,
		response:     podcast,
	}, true
}

func mapPodcastIndexPodcastToPIPodcast(feed podcastIndexPodcastFeed, podcastItunesID string) (piPodcastResponse, bool) {
	if feed.Dead != 0 {
		return piPodcastResponse{}, false
	}

	title := strings.TrimSpace(feed.Title)
	author := strings.TrimSpace(feed.Author)
	artwork := strings.TrimSpace(feed.Artwork)
	description := strings.TrimSpace(feed.Description)
	feedURL := strings.TrimSpace(feed.URL)
	itunesIDStr := strings.TrimSpace(podcastItunesID)
	lastUpdateTime := feed.LastUpdateTime
	episodeCount := feed.EpisodeCount
	language := strings.TrimSpace(feed.Language)

	genres := make([]string, 0, len(feed.Categories))
	for _, name := range feed.Categories {
		name = strings.TrimSpace(name)
		if name != "" {
			genres = append(genres, name)
		}
	}

	if title == "" ||
		author == "" ||
		artwork == "" ||
		description == "" ||
		feedURL == "" ||
		itunesIDStr == "" {
		return piPodcastResponse{}, false
	}

	var lastUpdateTimeValue *int64
	if lastUpdateTime > 0 {
		lastUpdateTimeValue = &lastUpdateTime
	}

	var episodeCountValue *int64
	if episodeCount > 0 {
		episodeCountValue = &episodeCount
	}

	return piPodcastResponse{
		Title:           title,
		Author:          author,
		Artwork:         artwork,
		Description:     description,
		FeedURL:         feedURL,
		LastUpdateTime:  lastUpdateTimeValue,
		PodcastItunesID: itunesIDStr,
		EpisodeCount:    episodeCountValue,
		Language:        language,
		Genres:          genres,
	}, true
}

func formatUnixTimestamp(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).UTC().Format(time.RFC3339)
}
