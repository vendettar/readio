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
	DatePubished    int64  `json:"datePublished"`
	EnclosureURL    string `json:"enclosureUrl,omitempty"`
	EnclosureType   string `json:"enclosureType,omitempty"`
	EnclosureLength int64  `json:"enclosureLength,omitempty"`
	Duration        int64  `json:"duration,omitempty"`
	Image           string `json:"image,omitempty"`
	Explicit        int    `json:"explicit,omitempty"`
}

type podcastIndexEpisodesResponse struct {
	Status string                `json:"status"`
	Items  []podcastIndexEpisode `json:"items"`
	Count  int                   `json:"count"`
}

func normalizeItunesID(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", &discoveryParamError{
			code:    "MISSING_ITUNES_ID",
			message: "itunesId query parameter is required",
		}
	}

	if _, err := strconv.ParseInt(trimmed, 10, 64); err != nil {
		return "", &discoveryParamError{
			code:    "INVALID_ITUNES_ID",
			message: "itunesId must be a valid numeric Apple podcast id",
		}
	}

	return trimmed, nil
}

func (s *discoveryService) fetchPodcastIndexEpisodes(ctx context.Context, itunesID string, max int) ([]podcastIndexEpisode, error) {
	cfg := getPodcastIndexConfig()
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

const (
	podcastIndexCacheTTLEpisodes = 12 * time.Hour
)

type podcastIndexEpisodesResponseJSON struct {
	Episodes []episodeLookupResponse `json:"episodes"`
}

func (s *discoveryService) handlePodcastIndexEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryPodcastIndexEpisodesRoute

	itunesID := r.URL.Query().Get("itunesId")
	if itunesID == "" {
		writeDiscoveryError(w, http.StatusBadRequest, "MISSING_ITUNES_ID", "itunesId query parameter is required")
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), errors.New("missing itunesId"), CacheStatusMissError)
		return
	}

	normalizedItunesID, err := normalizeItunesID(itunesID)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindPodcastIndex, podcastIndexBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

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

	cacheKey := fmt.Sprintf("podcastindex-episodes:itunes:%s:%d", normalizedItunesID, limit)

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) (any, error) {
		items, err := s.fetchPodcastIndexEpisodes(ctx, normalizedItunesID, limit)
		if err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}

		episodes := make([]episodeLookupResponse, 0, len(items))
		for _, item := range items {
			duration := float64(item.Duration)
			id := firstNonEmpty(strings.TrimSpace(item.GUID), strconv.FormatInt(item.ID, 10))
			episodes = append(episodes, episodeLookupResponse{
				ID:          id,
				Title:       item.Title,
				Description: item.Description,
				AudioURL:    item.EnclosureURL,
				PubDate:     formatUnixTimestamp(item.DatePubished),
				ArtworkURL:  item.Image,
				Duration:    &duration,
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

func formatUnixTimestamp(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).UTC().Format(time.RFC3339)
}
