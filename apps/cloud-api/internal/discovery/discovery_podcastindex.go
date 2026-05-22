package discovery

import (
	"context"
	"crypto/sha1"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"readio-cloud/internal/clientip"
	"readio-cloud/internal/podcastindex"
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
	podcastIndexPageEpisodesMax  = 1000
	podcastIndexEpisodePageSize  = 20
	podcastIndexEpisodePageMax   = 100
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

type podcastIndexBatchFeed struct {
	PodcastGUID string `json:"podcastGuid"`
	podcastindex.PodcastIndexPodcastFeed
}

type podcastIndexBatchPodcastResponse struct {
	Status string                  `json:"status"`
	Feeds  []podcastIndexBatchFeed `json:"feeds"`
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

type piPodcastEpisodesResponse struct {
	Episodes              []piEpisodeResponse `json:"episodes"`
	Limit                 int                 `json:"limit"`
	Offset                int                 `json:"offset"`
	NextOffset            int                 `json:"nextOffset"`
	HasMore               bool                `json:"hasMore"`
	StoredTotal           int                 `json:"storedTotal"`
	IsTruncated           bool                `json:"isTruncated"`
	LastSuccessfulFetchAt int64               `json:"lastSuccessfulFetchAt"`
	NextRefreshAfter      int64               `json:"nextRefreshAfter"`
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

func (s *discoveryService) FetchPodcastIndexPodcastByItunesID(ctx context.Context, itunesID string) (*podcastindex.PodcastIndexPodcastFeed, error) {
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

	var result struct {
		Status string                               `json:"status"`
		Feed   podcastindex.PodcastIndexPodcastFeed `json:"feed"`
	}
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	if result.Status != "true" {
		return nil, fmt.Errorf("podcastindex: upstream reports status=failed")
	}

	return &result.Feed, nil
}

func (s *discoveryService) FetchPodcastIndexEpisodesByItunesID(
	ctx context.Context,
	itunesID string,
	maxEpisodes int,
) ([]podcastindex.PodcastIndexEpisodeItem, error) {
	return s.FetchPodcastIndexEpisodesByItunesIDWithOptions(ctx, itunesID, podcastIndexEpisodesRequest{
		maxEpisodes: maxEpisodes,
	})
}

type podcastIndexEpisodesRequest struct {
	maxEpisodes int
	sinceUnix   int64
	useSince    bool
}

func (s *discoveryService) FetchPodcastIndexEpisodesByItunesIDSince(
	ctx context.Context,
	itunesID string,
	sinceUnix int64,
) ([]podcastindex.PodcastIndexEpisodeItem, error) {
	return s.FetchPodcastIndexEpisodesByItunesIDWithOptions(ctx, itunesID, podcastIndexEpisodesRequest{
		sinceUnix: sinceUnix,
		useSince:  true,
	})
}

func (s *discoveryService) FetchPodcastIndexEpisodesByItunesIDWithOptions(
	ctx context.Context,
	itunesID string,
	options podcastIndexEpisodesRequest,
) ([]podcastindex.PodcastIndexEpisodeItem, error) {
	normalizedItunesID, err := normalizeItunesID(itunesID)
	if err != nil {
		return nil, fmt.Errorf("podcastindex: invalid itunes id: %w", err)
	}

	req, err := s.buildPodcastIndexRequest(ctx, http.MethodGet, "/episodes/byitunesid", nil)
	if err != nil {
		return nil, err
	}

	q := req.URL.Query()
	q.Set("id", normalizedItunesID)
	if options.useSince {
		q.Set("since", strconv.FormatInt(options.sinceUnix, 10))
	} else {
		q.Set("max", strconv.Itoa(options.maxEpisodes))
	}
	req.URL.RawQuery = q.Encode()

	slog.DebugContext(ctx, "podcastindex: fetching episodes", "url", req.URL.String())
	var result struct {
		Status string                                 `json:"status"`
		Items  []podcastindex.PodcastIndexEpisodeItem `json:"items"`
	}
	if err := s.executeJSONRequest(req, &result); err != nil {
		return nil, err
	}

	if result.Status != "true" {
		return nil, fmt.Errorf("podcastindex: upstream reports status=failed")
	}

	slog.DebugContext(ctx, "podcastindex: fetched episodes", "count", len(result.Items))
	return result.Items, nil
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

	if result.Status != "true" {
		return nil, fmt.Errorf("podcastindex: upstream reports status=failed")
	}

	return result.Feeds, nil
}

func (s *discoveryService) handlePodcastIndexPodcastsBatchByGUID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastsBatchRoute

	if r.Method != http.MethodPost {
		writeDiscoveryErrorSpec(r, w, http.StatusMethodNotAllowed, discoveryErrSimpleMethodNotAllowed)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errDiscoveryMethodNotAllowedError, CacheStatusMissError)
		return
	}

	if !s.allowPodcastIndexRequest(clientip.EffectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(r, w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	if r.ContentLength > podcastIndexMaxBatchBodySize {
		writeDiscoveryErrorSpec(r, w, http.StatusRequestEntityTooLarge, discoveryErrBodyTooLarge)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("body too large"), CacheStatusMissError)
		return
	}

	bodyReader := r.Body
	if r.ContentLength == -1 {
		bodyReader = http.MaxBytesReader(w, r.Body, podcastIndexMaxBatchBodySize)
	}

	var input []string
	if err := json.NewDecoder(bodyReader).Decode(&input); err != nil {
		writeDiscoveryErrorSpec(r, w, http.StatusBadRequest, discoveryErrInvalidGuidBatch)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	if len(input) == 0 {
		writeDiscoveryJSON(w, http.StatusOK, []piPodcastResponse{})
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusUncached)
		return
	}

	normalizedGUIDs := make([]string, 0, len(input))
	seen := make(map[string]struct{}, len(input))
	for _, guid := range input {
		normalizedGUID, err := normalizePodcastGUID(guid)
		if err != nil {
			writeDiscoveryMappedError(r, w, err)
			logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
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
			slog.ErrorContext(ctx, "podcastindex guid batch unavailable", "error", err, "provider", configErr.provider)
			writeDiscoveryErrorSpec(r, w, http.StatusServiceUnavailable, discoveryErrProviderNotConfigured)
			logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}

		slog.WarnContext(ctx, "podcastindex guid batch failed", "error", err)
		writeDiscoveryMappedError(r, w, errors.Join(errDiscoveryUpstreamError, err))
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	bridges := make([]podcastIndexBatchFeedBridge, 0, len(feeds))
	for _, feed := range feeds {
		bridge, ok := mapPodcastIndexBatchFeedBridge(r.Context(), feed)
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
	logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handlePodcastIndexPodcastByItunesID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastByItunesIDRoutePattern

	rawPodcastItunesID, ok := discoveryPodcastByItunesIDFromPath(r.URL.Path)
	if !ok {
		writeDiscoveryErrorSpec(r, w, http.StatusNotFound, discoveryErrNotFound)
		logDiscoveryRequestWithStatus(
			r.Context(),
			route,
			UpstreamKindPodcastIndex,
			podcastIndexBaseURL,
			time.Since(start),
			errors.New("not found"),
			CacheStatusUncached,
			http.StatusNotFound,
		)
		return
	}

	podcastItunesID, err := normalizeItunesID(rawPodcastItunesID)
	if err != nil {
		writeDiscoveryMappedError(r, w, err)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	if !s.allowPodcastIndexLocalReadRequest(clientip.EffectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(r, w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()
	ctx = podcastindex.WithLimiterRemoteAddr(ctx, clientip.EffectiveClientIP(r, s.trustedProxies))

	readPath, err := s.newPIEpisodeReadPathService()
	if err != nil {
		handlePodcastIndexRouteError(ctx, r, w, route, start, errors.Join(errDiscoveryUpstreamError, err), CacheStatusMissError, "podcastindex itunesId lookup unavailable")
		return
	}

	podcastResult, err := readPath.ReadPodcastMetadata(ctx, podcastItunesID)
	if err != nil {
		handlePodcastIndexRouteError(ctx, r, w, route, start, err, CacheStatusMissError, "podcastindex itunesId lookup failed")
		return
	}

	if podcastResult == nil || podcastResult.Podcast == nil {
		writeDiscoveryJSON(w, http.StatusOK, nil)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, CacheStatusMissError)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, mapPIEpisodeCachePodcastToResponse(*podcastResult.Podcast))
	cacheStatus := podcastResult.CacheStatus
	if cacheStatus == "" {
		cacheStatus = CacheStatusFreshHit
	}
	logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handlePodcastIndexPodcastEpisodesByItunesID(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastEpisodesByItunesIDRoutePattern

	rawPodcastItunesID, ok := discoveryPodcastEpisodesByItunesIDFromPath(r.URL.Path)
	if !ok {
		writeDiscoveryErrorSpec(r, w, http.StatusNotFound, discoveryErrNotFound)
		logDiscoveryRequestWithStatus(
			r.Context(),
			route,
			UpstreamKindPodcastIndex,
			podcastIndexBaseURL,
			time.Since(start),
			errors.New("not found"),
			CacheStatusUncached,
			http.StatusNotFound,
		)
		return
	}

	podcastItunesID, err := normalizeItunesID(rawPodcastItunesID)
	if err != nil {
		writeDiscoveryMappedError(r, w, err)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	if !s.allowPodcastIndexLocalReadRequest(clientip.EffectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(r, w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()
	ctx = podcastindex.WithLimiterRemoteAddr(ctx, clientip.EffectiveClientIP(r, s.trustedProxies))

	readPath, err := s.newPIEpisodeReadPathService()
	if err != nil {
		handlePodcastIndexRouteError(ctx, r, w, route, start, errors.Join(errDiscoveryUpstreamError, err), CacheStatusMissError, "podcastindex itunesId episodes lookup unavailable")
		return
	}

	if rawEpisodeGUID, ok := firstQueryValue(r.URL.Query(), "episodeGuid"); ok {
		episodeGUID, err := normalizePodcastIndexEpisodeGUID(rawEpisodeGUID)
		if err != nil {
			writeDiscoveryMappedError(r, w, err)
			logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
			return
		}

		episodeResult, err := readPath.ReadEpisodeDetail(ctx, podcastItunesID, episodeGUID)
		if err != nil {
			if errors.Is(err, podcastindex.ErrPIEpisodeReadPathEpisodeNotFound) {
				writeDiscoveryError(r, w, http.StatusNotFound, "EPISODE_NOT_FOUND", "episode not found")
				cacheStatus := CacheStatusMissError
				if episodeResult != nil && episodeResult.CacheStatus != "" {
					cacheStatus = episodeResult.CacheStatus
				}
				logDiscoveryRequestWithStatus(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus, http.StatusNotFound)
				return
			}
			handlePodcastIndexRouteError(ctx, r, w, route, start, err, CacheStatusMissError, "podcastindex itunesId episode detail lookup failed")
			return
		}

		if episodeResult == nil || episodeResult.Episode == nil {
			writeDiscoveryError(r, w, http.StatusNotFound, "EPISODE_NOT_FOUND", "episode not found")
			logDiscoveryRequestWithStatus(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), podcastindex.ErrPIEpisodeReadPathEpisodeNotFound, CacheStatusMissError, http.StatusNotFound)
			return
		}

		writeDiscoveryJSON(w, http.StatusOK, mapPIEpisodeCacheEpisodeToResponse(*episodeResult.Episode))
		cacheStatus := episodeResult.CacheStatus
		if cacheStatus == "" {
			cacheStatus = CacheStatusFreshHit
		}
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
		return
	}

	limit, offset, err := parsePodcastIndexEpisodePageParams(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(r, w, err)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	page, err := readPath.ReadEpisodePage(ctx, podcastItunesID, limit, offset)
	if err != nil {
		handlePodcastIndexRouteError(ctx, r, w, route, start, err, CacheStatusMissError, "podcastindex itunesId episodes lookup failed")
		return
	}
	if page == nil {
		page = &podcastindex.PIEpisodeCachePage{Limit: limit, Offset: offset}
	}

	response := mapPIEpisodeCachePageToResponse(page)
	writeDiscoveryJSON(w, http.StatusOK, response)
	cacheStatus := page.CacheStatus
	if cacheStatus == "" {
		cacheStatus = CacheStatusFreshHit
	}
	logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), nil, cacheStatus)
}

func handlePodcastIndexRouteError(ctx context.Context, r *http.Request, w http.ResponseWriter, route string, start time.Time, err error, cacheStatus string, message string) {
	var configErr *discoveryProviderConfigError
	if errors.As(err, &configErr) {
		slog.ErrorContext(ctx, message, "error", err, "provider", configErr.provider)
		writeDiscoveryErrorSpec(r, w, http.StatusServiceUnavailable, discoveryErrProviderNotConfigured)
		logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	slog.WarnContext(ctx, message, "error", err)
	writeDiscoveryMappedError(r, w, err)
	logDiscoveryRequest(r.Context(), route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, cacheStatus)
}

func (s *discoveryService) newPIEpisodeReadPathService() (*podcastindex.PIEpisodeReadPathService, error) {
	if s == nil || s.piEpisodeCacheStore == nil {
		return nil, errors.New("podcastindex sqlite episode cache store is required")
	}
	s.piEpisodeReadPathMu.Lock()
	defer s.piEpisodeReadPathMu.Unlock()
	if s.piEpisodeReadPath != nil {
		return s.piEpisodeReadPath, nil
	}
	refresh := podcastindex.NewPIEpisodeRefreshService(s.piEpisodeCacheStore, s)
	s.piEpisodeReadPath = podcastindex.NewPIEpisodeReadPathService(s.piEpisodeCacheStore, refresh)
	return s.piEpisodeReadPath, nil
}

func firstQueryValue(values url.Values, key string) (string, bool) {
	rawValues, ok := values[key]
	if !ok {
		return "", false
	}
	if len(rawValues) == 0 {
		return "", true
	}
	return rawValues[0], true
}

func normalizePodcastIndexEpisodeGUID(input string) (string, error) {
	guid := strings.TrimSpace(input)
	if guid == "" {
		return "", &discoveryParamError{
			code:    "INVALID_EPISODE_GUID",
			message: "episodeGuid must not be empty",
		}
	}
	if len(guid) > podcastindex.PISnapshotMaxEpisodeGUIDBytes {
		return "", &discoveryParamError{
			code:    "INVALID_EPISODE_GUID",
			message: fmt.Sprintf("episodeGuid must be at most %d bytes", podcastindex.PISnapshotMaxEpisodeGUIDBytes),
		}
	}
	return guid, nil
}

func parsePodcastIndexEpisodePageParams(values url.Values) (int, int, error) {
	limit, err := parsePodcastIndexPositiveQueryInt(values, "limit", podcastIndexEpisodePageSize)
	if err != nil {
		return 0, 0, err
	}
	if limit > podcastIndexEpisodePageMax {
		limit = podcastIndexEpisodePageMax
	}

	offset, err := parsePodcastIndexNonNegativeQueryInt(values, "offset", 0)
	if err != nil {
		return 0, 0, err
	}
	if offset > podcastIndexPageEpisodesMax {
		offset = podcastIndexPageEpisodesMax
	}
	return limit, offset, nil
}

func parsePodcastIndexPositiveQueryInt(values url.Values, key string, fallback int) (int, error) {
	value, err := parsePodcastIndexNonNegativeQueryInt(values, key, fallback)
	if err != nil {
		return 0, err
	}
	if value == 0 {
		return 0, invalidPodcastIndexPositiveIntegerParam(key)
	}
	return value, nil
}

func parsePodcastIndexNonNegativeQueryInt(values url.Values, key string, fallback int) (int, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return 0, invalidPodcastIndexIntegerParam(key)
	}
	return value, nil
}

func invalidPodcastIndexIntegerParam(key string) error {
	return &discoveryParamError{
		code:    "INVALID_" + strings.ToUpper(key),
		message: key + " must be a non-negative integer",
	}
}

func invalidPodcastIndexPositiveIntegerParam(key string) error {
	return &discoveryParamError{
		code:    "INVALID_" + strings.ToUpper(key),
		message: key + " must be a positive integer",
	}
}

func mapPIEpisodeCachePodcastToResponse(podcast podcastindex.PIEpisodeCachePodcastMetadata) *piPodcastResponse {
	genres := make([]string, 0)
	if strings.TrimSpace(podcast.CategoriesJSON) != "" {
		_ = json.Unmarshal([]byte(podcast.CategoriesJSON), &genres)
	}

	return &piPodcastResponse{
		Title:           podcast.Title,
		Author:          podcast.Author,
		Artwork:         podcast.Image,
		Description:     podcast.Description,
		LastUpdateTime:  podcast.FeedLastUpdateTimeUnix,
		PodcastItunesID: podcast.PodcastItunesID,
		EpisodeCount:    podcast.EpisodeCountHint,
		Language:        podcast.Language,
		Genres:          genres,
	}
}

func mapPIEpisodeCachePageToResponse(page *podcastindex.PIEpisodeCachePage) piPodcastEpisodesResponse {
	if page == nil {
		return piPodcastEpisodesResponse{
			Episodes: []piEpisodeResponse{},
			Limit:    podcastIndexEpisodePageSize,
		}
	}

	episodes := make([]piEpisodeResponse, 0, len(page.Episodes))
	for _, episode := range page.Episodes {
		episodes = append(episodes, mapPIEpisodeCacheEpisodeToResponse(episode))
	}

	nextOffset := page.Offset + len(episodes)
	hasMore := nextOffset < page.TotalCount
	if !hasMore {
		nextOffset = page.TotalCount
	}
	return piPodcastEpisodesResponse{
		Episodes:              episodes,
		Limit:                 page.Limit,
		Offset:                page.Offset,
		NextOffset:            nextOffset,
		HasMore:               hasMore,
		StoredTotal:           page.TotalCount,
		IsTruncated:           page.IsTruncated,
		LastSuccessfulFetchAt: page.LastSuccessfulFetchAt,
		NextRefreshAfter:      page.RefreshNotBefore,
	}
}

func mapPIEpisodeCacheEpisodeToResponse(episode podcastindex.PIEpisodeCacheEpisode) piEpisodeResponse {
	return piEpisodeResponse{
		GUID:          episode.EpisodeGUID,
		Title:         episode.Title,
		Description:   episode.Description,
		AudioURL:      episode.EnclosureURL,
		PubDate:       episode.PublishedAtUnix,
		ArtworkURL:    episode.Image,
		FileSize:      derefInt64(episode.EnclosureLength),
		Duration:      episode.DurationSeconds,
		Explicit:      derefBool(episode.Explicit),
		Link:          episode.Link,
		SeasonNumber:  cloneInt64Ptr(episode.SeasonNumber),
		EpisodeNumber: cloneInt64Ptr(episode.EpisodeNumber),
		EpisodeType:   episode.EpisodeType,
		TranscriptURL: episode.TranscriptURL,
	}
}

func derefInt64(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func derefBool(value *bool) bool {
	return value != nil && *value
}

func cloneInt64Ptr(value *int64) *int64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func mapPodcastIndexBatchFeedBridge(ctx context.Context, feed podcastIndexBatchFeed) (podcastIndexBatchFeedBridge, bool) {
	orderingGUID := strings.TrimSpace(feed.PodcastGUID)
	if orderingGUID == "" {
		return podcastIndexBatchFeedBridge{}, false
	}

	podcast, ok := mapPodcastIndexPodcastToPIPodcast(
		ctx,
		feed.PodcastIndexPodcastFeed,
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

func mapPodcastIndexPodcastToPIPodcast(ctx context.Context, feed podcastindex.PodcastIndexPodcastFeed, podcastItunesID string) (piPodcastResponse, bool) {
	if feed.Dead != 0 {
		slog.DebugContext(ctx, "skipping podcast", "itunes_id", podcastItunesID, "reason", "feed is marked as dead")
		return piPodcastResponse{}, false
	}

	title := strings.TrimSpace(feed.Title)
	author := strings.TrimSpace(feed.Author)
	artworkRaw := strings.TrimSpace(feed.Artwork)
	description := strings.TrimSpace(feed.Description)
	itunesIDStr := strings.TrimSpace(podcastItunesID)
	language := strings.TrimSpace(feed.Language)

	artwork, ok := normalizeRequiredHTTPURL(artworkRaw)
	if !ok {
		slog.DebugContext(ctx, "skipping podcast", "itunes_id", podcastItunesID, "reason", "invalid artwork url")
		return piPodcastResponse{}, false
	}

	genres := make([]string, 0, len(feed.Categories))
	for _, name := range feed.Categories {
		name = strings.TrimSpace(name)
		if name != "" {
			genres = append(genres, name)
		}
	}
	sort.Strings(genres)

	if title == "" ||
		author == "" ||
		artwork == "" ||
		description == "" ||
		itunesIDStr == "" ||
		feed.LastUpdateTime == nil ||
		feed.EpisodeCount == nil {
		slog.DebugContext(ctx, "skipping podcast", "itunes_id", podcastItunesID, "reason", "missing required fields")
		return piPodcastResponse{}, false
	}

	return piPodcastResponse{
		Title:           title,
		Author:          author,
		Artwork:         artwork,
		Description:     description,
		LastUpdateTime:  *feed.LastUpdateTime,
		PodcastItunesID: itunesIDStr,
		EpisodeCount:    *feed.EpisodeCount,
		Language:        language,
		Genres:          genres,
	}, true
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
