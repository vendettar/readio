package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var extractPodcastIDFromURLRe = regexp.MustCompile(`(?i)/id(\d+)`)

func buildAppleSearchURL(base, term, country string, limit int, entity string) string {
	params := url.Values{
		"term":    []string{term},
		"country": []string{country},
		"media":   []string{"podcast"},
		"limit":   []string{strconv.Itoa(limit)},
	}
	if entity != "" {
		params["entity"] = []string{entity}
	}
	return strings.TrimRight(base, "/") + "?" + params.Encode()
}

func buildApplePodcastSearchURL(base, term, country string, limit int) string {
	return buildAppleSearchURL(base, term, country, limit, "")
}

func buildApplePodcastEpisodeSearchURL(base, term, country string, limit int) string {
	return buildAppleSearchURL(base, term, country, limit, "podcastEpisode")
}

func buildAppleFeedURL(base, country string, limit int, resource string) string {
	return fmt.Sprintf(
		"%s/%s/podcasts/top/%d/%s.json",
		strings.TrimRight(base, "/"),
		country,
		limit,
		resource,
	)
}

type rawAppleTopPodcastFeedResponse struct {
	Feed struct {
		Results []rawAppleTopPodcastItem `json:"results"`
	} `json:"feed"`
}

type rawAppleTopEpisodeFeedResponse struct {
	Feed struct {
		Results []rawAppleTopEpisodeItem `json:"results"`
	} `json:"feed"`
}

type rawAppleTopPodcastItem struct {
	ID            any               `json:"id"`
	Name          string            `json:"name"`
	ArtistName    string            `json:"artistName"`
	ArtworkURL100 string            `json:"artworkUrl100"`
	Genres        []json.RawMessage `json:"genres"`
}

type rawAppleTopEpisodeItem struct {
	Name          string            `json:"name"`
	ArtistName    string            `json:"artistName"`
	ArtworkURL100 string            `json:"artworkUrl100"`
	URL           string            `json:"url"`
	Genres        []json.RawMessage `json:"genres"`
}

// Route-specific raw types for Apple podcast search
type rawApplePodcastSearchResponse struct {
	Results []rawApplePodcastSearchItem `json:"results"`
}

type rawApplePodcastSearchItem struct {
	CollectionID   any               `json:"collectionId"`
	CollectionName string            `json:"collectionName"`
	ArtistName     string            `json:"artistName"`
	ArtworkURL600  string            `json:"artworkUrl600"`
	ReleaseDate    string            `json:"releaseDate"`
	TrackCount     any               `json:"trackCount"`
	Genres         []json.RawMessage `json:"genres"`
}

// Route-specific response DTO for Apple podcast search
type discoverySearchPodcastResponseItem struct {
	Title           string   `json:"title"`
	Author          string   `json:"author"`
	Artwork         string   `json:"artwork"`
	ReleaseDate     string   `json:"releaseDate,omitempty"`
	EpisodeCount    int64    `json:"episodeCount"`
	PodcastItunesID string   `json:"podcastItunesId"`
	Genres          []string `json:"genres"`
}

// Route-specific response DTO for Apple episode search
type discoverySearchEpisodeResponseItem struct {
	PodcastItunesID  string `json:"podcastItunesId"`
	Title            string `json:"title"`
	ShowTitle        string `json:"showTitle"`
	Artwork          string `json:"artwork"`
	EpisodeURL       string `json:"episodeUrl"`
	EpisodeGUID      string `json:"episodeGuid"`
	ReleaseDate      string `json:"releaseDate,omitempty"`
	TrackTimeMillis  *int64 `json:"trackTimeMillis,omitempty"`
	ShortDescription string `json:"shortDescription,omitempty"`
}

// Route-specific raw types for Apple episode search
type rawAppleEpisodeSearchResponse struct {
	Results []rawAppleEpisodeSearchItem `json:"results"`
}

type rawAppleEpisodeSearchItem struct {
	CollectionID     any    `json:"collectionId"`
	CollectionName   string `json:"collectionName"`
	TrackName        string `json:"trackName"`
	ArtworkURL600    string `json:"artworkUrl600"`
	EpisodeURL       string `json:"episodeUrl"`
	EpisodeGUID      string `json:"episodeGuid"`
	ReleaseDate      string `json:"releaseDate"`
	TrackTimeMillis  any    `json:"trackTimeMillis"`
	ShortDescription string `json:"shortDescription"`
}

func isRelevantAppleEpisodeSearchItem(item rawAppleEpisodeSearchItem, queryTokens []string) bool {
	if len(queryTokens) == 0 {
		return true
	}

	searchText := strings.ToLower(
		strings.Join(
			[]string{
				strings.TrimSpace(item.TrackName),
				strings.TrimSpace(item.CollectionName),
			},
			" ",
		),
	)

	for _, token := range queryTokens {
		if strings.Contains(searchText, token) {
			return true
		}
	}

	return false
}

func mapAppleEpisodeSearchItem(item rawAppleEpisodeSearchItem) (discoverySearchEpisodeResponseItem, bool) {
	audioURL := strings.TrimSpace(item.EpisodeURL)
	releaseDate := strings.TrimSpace(item.ReleaseDate)
	title := strings.TrimSpace(item.TrackName)
	showTitle := strings.TrimSpace(item.CollectionName)
	episodeGUID := strings.TrimSpace(item.EpisodeGUID)
	itunesIDStr := asStringID(item.CollectionID)
	artwork := strings.TrimSpace(item.ArtworkURL600)
	shortDescription := strings.TrimSpace(item.ShortDescription)
	durationMs := asOptionalInt64(item.TrackTimeMillis)

	if audioURL == "" ||
		title == "" ||
		showTitle == "" ||
		episodeGUID == "" ||
		itunesIDStr == "" ||
		artwork == "" {
		return discoverySearchEpisodeResponseItem{}, false
	}

	return discoverySearchEpisodeResponseItem{
		PodcastItunesID:  itunesIDStr,
		Title:            title,
		ShowTitle:        showTitle,
		Artwork:          artwork,
		EpisodeURL:       audioURL,
		EpisodeGUID:      episodeGUID,
		ReleaseDate:      releaseDate,
		TrackTimeMillis:  durationMs,
		ShortDescription: shortDescription,
	}, true
}

func isRelevantApplePodcastSearchItem(item rawApplePodcastSearchItem, queryTokens []string) bool {
	if len(queryTokens) == 0 {
		return true
	}

	searchText := strings.ToLower(
		strings.Join(
			[]string{
				strings.TrimSpace(item.CollectionName),
				strings.TrimSpace(item.ArtistName),
			},
			" ",
		),
	)

	for _, token := range queryTokens {
		if strings.Contains(searchText, token) {
			return true
		}
	}

	return false
}

func mapApplePodcastSearchItem(
	item rawApplePodcastSearchItem,
) (discoverySearchPodcastResponseItem, bool) {
	itunesIDStr := asStringID(item.CollectionID)
	title := strings.TrimSpace(item.CollectionName)
	artwork := strings.TrimSpace(item.ArtworkURL600)
	releaseDate := strings.TrimSpace(item.ReleaseDate)
	author := strings.TrimSpace(item.ArtistName)
	genres := mapDiscoveryGenreNames(item.Genres)
	episodeCount := asOptionalInt64(item.TrackCount)

	if itunesIDStr == "" ||
		title == "" ||
		artwork == "" ||
		author == "" ||
		episodeCount == nil {
		return discoverySearchPodcastResponseItem{}, false
	}

	return discoverySearchPodcastResponseItem{
		Title:           title,
		Author:          author,
		Artwork:         artwork,
		ReleaseDate:     releaseDate,
		EpisodeCount:    *episodeCount,
		PodcastItunesID: itunesIDStr,
		Genres:          genres,
	}, true
}

// Narrow DTOs for top-podcasts route (Explore surface contract)
type topPodcastResponse struct {
	Title           string   `json:"title"`
	Author          string   `json:"author"`
	Artwork         string   `json:"artwork"`
	Genres          []string `json:"genres"`
	PodcastItunesID string   `json:"podcastItunesId"`
}

// Narrow DTOs for top-episodes route (Explore surface contract)
type topEpisodeResponse struct {
	Title           string   `json:"title"`
	Author          string   `json:"author"`
	Artwork         string   `json:"artwork"`
	PodcastItunesID string   `json:"podcastItunesId"`
	Genres          []string `json:"genres"`
}

var errDiscoveryChartInvalidPayload = errors.New("discovery chart payload invalid")

func validateAppleTopPodcastChartPayload(results []rawAppleTopPodcastItem) error {
	if len(results) == 0 {
		return errors.Join(errDiscoveryChartInvalidPayload, errors.New("feed results empty"))
	}
	return nil
}

func validateAppleTopEpisodeChartPayload(results []rawAppleTopEpisodeItem) error {
	if len(results) == 0 {
		return errors.Join(errDiscoveryChartInvalidPayload, errors.New("feed results empty"))
	}
	return nil
}

func (s *discoveryService) handleTopPodcasts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryTopPodcastsRoute

	if !s.allowTopRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	limit, err := parseDiscoveryLimit(r.URL.Query(), "limit", defaultDiscoveryTopLimit, maxDiscoveryTopLimit)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("top-podcasts:%s:%d", country, limit)
	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) ([]topPodcastResponse, error) {
		upstreamURL := buildAppleFeedURL(s.rssBaseURL, country, limit, "podcasts")
		var payload rawAppleTopPodcastFeedResponse
		if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}

		if err := validateAppleTopPodcastChartPayload(payload.Feed.Results); err != nil {
			return nil, err
		}

		items := make([]topPodcastResponse, 0, len(payload.Feed.Results))
		for _, item := range payload.Feed.Results {
			mapped, ok := mapTopPodcast(item)
			if ok {
				items = append(items, mapped)
			}
		}

		if len(items) == 0 {
			return nil, errors.Join(errDiscoveryChartInvalidPayload, errors.New("all rows dropped during mapping"))
		}

		return items, nil
	}

	data, cacheStatus, err := getWithGracefulDegradation(s, ctx, cacheKey, discoveryCacheTTLTopPodcasts, fetch)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, data)
	logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handleTopEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryTopEpisodesRoute

	if !s.allowTopRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	limit, err := parseDiscoveryLimit(r.URL.Query(), "limit", defaultDiscoveryTopLimit, maxDiscoveryTopLimit)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("top-episodes:%s:%d", country, limit)
	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) ([]topEpisodeResponse, error) {
		upstreamURL := buildAppleFeedURL(s.rssBaseURL, country, limit, "podcast-episodes")
		var payload rawAppleTopEpisodeFeedResponse
		if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}

		if err := validateAppleTopEpisodeChartPayload(payload.Feed.Results); err != nil {
			return nil, err
		}

		items := make([]topEpisodeResponse, 0, len(payload.Feed.Results))
		for _, item := range payload.Feed.Results {
			mapped, ok := mapTopEpisode(item)
			if ok {
				items = append(items, mapped)
			}
		}

		if len(items) == 0 {
			return nil, errors.Join(errDiscoveryChartInvalidPayload, errors.New("all rows dropped during mapping"))
		}

		return items, nil
	}

	data, cacheStatus, err := getWithGracefulDegradation(s, ctx, cacheKey, discoveryCacheTTLTopEpisodes, fetch)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, data)
	logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handleSearchPodcasts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoverySearchPodcastsRoute

	if !s.allowSearchRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	term, err := parseDiscoveryTerm(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}
	limit, err := parseDiscoveryLimit(
		r.URL.Query(),
		"limit",
		defaultDiscoveryPodcastSearchLimit,
		maxDiscoverySearchLimit,
	)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	upstreamURL := buildApplePodcastSearchURL(s.searchBaseURL, term, country, limit)

	var payload rawApplePodcastSearchResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	queryTokens := tokenizeDiscoveryQuery(term)
	items := make([]discoverySearchPodcastResponseItem, 0, len(payload.Results))
	for _, item := range payload.Results {
		if !isRelevantApplePodcastSearchItem(item, queryTokens) {
			continue
		}

		mapped, ok := mapApplePodcastSearchItem(item)
		if !ok {
			continue
		}
		items = append(items, mapped)
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handleSearchEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoverySearchEpisodesRoute

	if !s.allowSearchRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryErrorSpec(w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), errDiscoveryRateLimited, CacheStatusUncached)
		return
	}

	term, err := parseDiscoveryTerm(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}
	limit, err := parseDiscoveryLimit(
		r.URL.Query(),
		"limit",
		defaultDiscoveryEpisodeSearchLimit,
		maxDiscoverySearchLimit,
	)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	upstreamURL := buildApplePodcastEpisodeSearchURL(s.searchBaseURL, term, country, limit)

	var payload rawAppleEpisodeSearchResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	queryTokens := tokenizeDiscoveryQuery(term)
	items := make([]discoverySearchEpisodeResponseItem, 0, len(payload.Results))
	for _, item := range payload.Results {
		if !isRelevantAppleEpisodeSearchItem(item, queryTokens) {
			continue
		}

		mapped, ok := mapAppleEpisodeSearchItem(item)
		if !ok {
			continue
		}
		items = append(items, mapped)
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func mapTopPodcast(item rawAppleTopPodcastItem) (topPodcastResponse, bool) {
	id := asStringID(item.ID)
	title := strings.TrimSpace(item.Name)
	author := strings.TrimSpace(item.ArtistName)
	artwork := strings.TrimSpace(item.ArtworkURL100)
	genres := mapDiscoveryGenreNames(item.Genres)

	if id == "" || title == "" || author == "" || artwork == "" {
		return topPodcastResponse{}, false
	}

	return topPodcastResponse{
		Title:           title,
		Author:          author,
		Artwork:         artwork,
		Genres:          genres,
		PodcastItunesID: id,
	}, true
}

func mapTopEpisode(item rawAppleTopEpisodeItem) (topEpisodeResponse, bool) {
	title := strings.TrimSpace(item.Name)
	if title == "" {
		return topEpisodeResponse{}, false
	}

	author := strings.TrimSpace(item.ArtistName)
	if author == "" {
		return topEpisodeResponse{}, false
	}

	podcastItunesID := extractPodcastIDFromURL(strings.TrimSpace(item.URL))
	if podcastItunesID == "" {
		return topEpisodeResponse{}, false
	}

	artwork := strings.TrimSpace(item.ArtworkURL100)
	if artwork == "" {
		return topEpisodeResponse{}, false
	}

	genres := mapDiscoveryGenreNames(item.Genres)

	return topEpisodeResponse{
		Title:           title,
		Author:          author,
		Artwork:         artwork,
		Genres:          genres,
		PodcastItunesID: podcastItunesID,
	}, true
}

func mapDiscoveryGenreNames(rawGenres []json.RawMessage) []string {
	if len(rawGenres) == 0 {
		return []string{}
	}
	names := make([]string, 0, len(rawGenres))
	for _, rawGenre := range rawGenres {
		var textValue string
		if err := json.Unmarshal(rawGenre, &textValue); err == nil {
			name := strings.TrimSpace(textValue)
			if name != "" {
				names = append(names, name)
			}
			continue
		}

		var objectValue struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(rawGenre, &objectValue); err != nil {
			continue
		}

		name := strings.TrimSpace(objectValue.Name)
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func extractPodcastIDFromURL(itemURL string) string {
	if itemURL == "" {
		return ""
	}
	match := extractPodcastIDFromURLRe.FindStringSubmatch(itemURL)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}
