package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Apple API response types.

type discoveryPodcastResponse struct {
	ID                string           `json:"id"`
	Name              string           `json:"name"`
	ArtistName        string           `json:"artistName,omitempty"`
	ArtworkURL100     string           `json:"artworkUrl100,omitempty"`
	URL               string           `json:"url"`
	Genres            []discoveryGenre `json:"genres"`
	Description       string           `json:"description,omitempty"`
	ReleaseDate       string           `json:"releaseDate,omitempty"`
	Duration          *int64           `json:"duration,omitempty"`
	FeedURL           string           `json:"feedUrl,omitempty"`
	ProviderPodcastID string           `json:"providerPodcastId,omitempty"`
	ProviderEpisodeID string           `json:"providerEpisodeId,omitempty"`
}

type discoveryGenre struct {
	GenreID string `json:"genreId"`
	Name    string `json:"name"`
	URL     string `json:"url,omitempty"`
}

type podcastLookupResponse struct {
	ProviderPodcastID *int64   `json:"providerPodcastId,omitempty"`
	CollectionName    string   `json:"collectionName"`
	ArtistName        string   `json:"artistName,omitempty"`
	ArtworkURL100     string   `json:"artworkUrl100,omitempty"`
	ArtworkURL600     string   `json:"artworkUrl600,omitempty"`
	FeedURL           string   `json:"feedUrl,omitempty"`
	CollectionViewURL string   `json:"collectionViewUrl,omitempty"`
	ArtistID          *int64   `json:"artistId,omitempty"`
	PrimaryGenreName  string   `json:"primaryGenreName,omitempty"`
	Genres            []string `json:"genres,omitempty"`
	TrackCount        *int64   `json:"trackCount,omitempty"`
}

type searchEpisodeResponse struct {
	ProviderEpisodeID *int64 `json:"providerEpisodeId,omitempty"`
	ProviderPodcastID *int64 `json:"providerPodcastId,omitempty"`
	TrackName         string `json:"trackName"`
	CollectionName    string `json:"collectionName"`
	FeedURL           string `json:"feedUrl,omitempty"`
	EpisodeURL        string `json:"episodeUrl"`
	ReleaseDate       string `json:"releaseDate,omitempty"`
	TrackTimeMillis   *int64 `json:"trackTimeMillis,omitempty"`
	ArtworkURL600     string `json:"artworkUrl600,omitempty"`
	Description       string `json:"description,omitempty"`
	ShortDescription  string `json:"shortDescription,omitempty"`
	EpisodeGUID       string `json:"episodeGuid,omitempty"`
	ArtworkURL100     string `json:"artworkUrl100,omitempty"`
	ArtistName        string `json:"artistName,omitempty"`
}

type episodeLookupResponse struct {
	ID                string   `json:"id"`
	Title             string   `json:"title"`
	Description       string   `json:"description"`
	AudioURL          string   `json:"audioUrl"`
	PubDate           string   `json:"pubDate"`
	ArtworkURL        string   `json:"artworkUrl,omitempty"`
	Duration          *float64 `json:"duration,omitempty"`
	ProviderEpisodeID string   `json:"providerEpisodeId,omitempty"`
	CollectionName    string   `json:"collectionName,omitempty"`
	ArtistName        string   `json:"artistName,omitempty"`
	FeedURL           string   `json:"feedUrl,omitempty"`
}

type rawAppleFeedResponse struct {
	Feed struct {
		Results []rawAppleItem `json:"results"`
	} `json:"feed"`
}

type rawAppleLookupResponse struct {
	Results []rawAppleItem `json:"results"`
}

type rawAppleGenre struct {
	GenreID any    `json:"genreId"`
	Name    string `json:"name"`
	URL     string `json:"url"`
}

type rawAppleItem struct {
	ID                any               `json:"id"`
	Name              string            `json:"name"`
	ArtistName        string            `json:"artistName"`
	ArtworkURL100     string            `json:"artworkUrl100"`
	ArtworkURL600     string            `json:"artworkUrl600"`
	ArtworkURL160     string            `json:"artworkUrl160"`
	ArtworkURL60      string            `json:"artworkUrl60"`
	URL               string            `json:"url"`
	Genres            []json.RawMessage `json:"genres"`
	Description       string            `json:"description"`
	ShortDescription  string            `json:"shortDescription"`
	ReleaseDate       string            `json:"releaseDate"`
	Duration          any               `json:"duration"`
	CollectionID      any               `json:"collectionId"`
	CollectionName    string            `json:"collectionName"`
	TrackName         string            `json:"trackName"`
	FeedURL           string            `json:"feedUrl"`
	CollectionViewURL string            `json:"collectionViewUrl"`
	ArtistID          any               `json:"artistId"`
	PrimaryGenreName  string            `json:"primaryGenreName"`
	TrackCount        any               `json:"trackCount"`
	EpisodeURL        string            `json:"episodeUrl"`
	EpisodeGUID       string            `json:"episodeGuid"`
	TrackID           any               `json:"trackId"`
	TrackTimeMillis   any               `json:"trackTimeMillis"`
	WrapperType       string            `json:"wrapperType"`
	Kind              string            `json:"kind"`
}

// URL builders.

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

func buildAppleLookupURL(base, id, country string, entity string, limit int) string {
	params := url.Values{
		"id":      []string{id},
		"country": []string{country},
	}
	if entity != "" {
		params["entity"] = []string{entity}
	}
	if limit > 0 {
		params["limit"] = []string{strconv.Itoa(limit)}
	}
	return strings.TrimRight(base, "/") + "?" + params.Encode()
}

func buildAppleFeedURL(base, country string, limit int, resource string) string {
	return fmt.Sprintf("%s/%s/podcasts/top/%d/%s.json",
		strings.TrimRight(base, "/"), country, limit, resource)
}

// Fetch & decode.

func (s *discoveryService) fetchJSON(ctx context.Context, requestURL string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return fmt.Errorf("create discovery upstream request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", s.userAgent)

	client := s.client
	if client == nil {
		client = newDiscoveryService().client
	}

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return errDiscoveryTimeout
		}
		return fmt.Errorf("perform discovery upstream request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return &discoveryUpstreamStatusError{status: resp.StatusCode}
	}

	if err := decodeDiscoveryJSON(resp.Body, s.bodyLimit, dest); err != nil {
		return err
	}

	return nil
}

func decodeDiscoveryJSON(body io.Reader, limit int64, dest any) error {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return fmt.Errorf("read discovery upstream body: %w", err)
	}
	if int64(len(data)) > limit {
		return errDiscoveryTooLarge
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(dest); err != nil {
		return errDiscoveryDecode
	}

	return nil
}

// Route handlers.

func (s *discoveryService) handleSearchPodcasts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoverySearchPodcastsRoute

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

	upstreamURL := buildAppleSearchURL(s.searchBaseURL, term, country, limit, "")

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	items := make([]podcastLookupResponse, 0, len(payload.Results))
	for _, item := range payload.Results {
		if item.Kind != "podcast" && item.WrapperType != "collection" {
			continue
		}
		if !isRelevantDiscoverySearchResult(item, term) {
			continue
		}
		mapped, ok := mapSearchPodcast(item)
		if ok {
			items = append(items, mapped)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handleSearchEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoverySearchEpisodesRoute

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

	upstreamURL := buildAppleSearchURL(s.searchBaseURL, term, country, limit, "podcastEpisode")

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	items := make([]searchEpisodeResponse, 0, len(payload.Results))
	for _, item := range payload.Results {
		if item.WrapperType != "podcastEpisode" {
			continue
		}
		if !isRelevantDiscoverySearchResult(item, term) {
			continue
		}
		mapped, ok := mapSearchEpisode(item)
		if ok {
			items = append(items, mapped)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handleTopPodcasts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryTopPodcastsRoute

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

	fetch := func(ctx context.Context) (any, error) {
		upstreamURL := buildAppleFeedURL(s.rssBaseURL, country, limit, "podcasts")
		var payload rawAppleFeedResponse
		if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}
		items := make([]discoveryPodcastResponse, 0, len(payload.Feed.Results))
		for _, item := range payload.Feed.Results {
			mapped, ok := mapTopPodcast(item)
			if ok {
				items = append(items, mapped)
			}
		}
		return items, nil
	}

	data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, discoveryCacheTTLTopPodcasts, fetch)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	items := data.([]discoveryPodcastResponse)
	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handleTopEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryTopEpisodesRoute

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

	fetch := func(ctx context.Context) (any, error) {
		upstreamURL := buildAppleFeedURL(s.rssBaseURL, country, limit, "podcast-episodes")
		var payload rawAppleFeedResponse
		if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}
		items := make([]discoveryPodcastResponse, 0, len(payload.Feed.Results))
		for _, item := range payload.Feed.Results {
			mapped, ok := mapTopEpisode(item)
			if ok {
				items = append(items, mapped)
			}
		}
		return items, nil
	}

	data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, discoveryCacheTTLTopEpisodes, fetch)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	items := data.([]discoveryPodcastResponse)
	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handleLookupPodcast(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryLookupPodcastRoute

	id, err := parseDiscoveryID(r.URL.Query(), "id")
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("lookup-podcast:%s:%s", id, country)

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) (any, error) {
		upstreamURL := buildAppleLookupURL(s.lookupBaseURL, id, country, "podcast", 0)
		var payload rawAppleLookupResponse
		if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}
		for _, item := range payload.Results {
			if item.Kind != "podcast" && item.WrapperType != "collection" {
				continue
			}
			if mapped, ok := mapLookupPodcast(item); ok {
				return mapped, nil
			}
		}
		return nil, nil
	}

	data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, discoveryCacheTTLLookup, fetch)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, data)
	logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handleLookupPodcasts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryLookupPodcastsRoute

	ids, err := parseDiscoveryIDs(r.URL.Query(), "ids")
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	if len(ids) == 0 {
		writeDiscoveryJSON(w, http.StatusOK, []discoveryPodcastResponse{})
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), nil, CacheStatusUncached)
		return
	}

	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	idsParam := strings.Join(ids, ",")
	upstreamURL := buildAppleLookupURL(s.lookupBaseURL, idsParam, country, "podcast", 0)

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusUncached)
		return
	}

	resultsByID := make(map[string]discoveryPodcastResponse, len(payload.Results))
	for _, item := range payload.Results {
		if item.Kind != "podcast" && item.WrapperType != "collection" && item.WrapperType != "track" {
			continue
		}
		mapped, ok := mapLookupPodcastByIDs(item)
		if !ok {
			continue
		}
		resultsByID[mapped.ID] = mapped
	}

	items := make([]discoveryPodcastResponse, 0, len(ids))
	for _, id := range ids {
		if item, ok := resultsByID[id]; ok {
			items = append(items, item)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handleLookupPodcastEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryLookupPodcastEpisodesRoute

	id, err := parseDiscoveryID(r.URL.Query(), "id")
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}
	limit, err := parseDiscoveryLimit(r.URL.Query(), "limit", defaultDiscoveryLookupEpisodesLimit, maxDiscoveryLookupEpisodesLimit)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	cacheKey := fmt.Sprintf("lookup-episodes:%s:%s:%d", id, country, limit)

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	fetch := func(ctx context.Context) (any, error) {
		upstreamURL := buildAppleLookupURL(s.lookupBaseURL, id, country, "podcastEpisode", limit)
		var payload rawAppleLookupResponse
		if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
			return nil, errors.Join(errDiscoveryUpstreamError, err)
		}
		items := make([]episodeLookupResponse, 0, len(payload.Results))
		for _, item := range payload.Results {
			if item.WrapperType != "podcastEpisode" {
				continue
			}
			mapped, ok := mapLookupEpisode(item)
			if ok {
				items = append(items, mapped)
			}
		}
		return items, nil
	}

	data, cacheStatus, err := s.getWithGracefulDegradation(ctx, cacheKey, discoveryCacheTTLLookup, fetch)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), err, cacheStatus)
		return
	}

	items := data.([]episodeLookupResponse)
	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleLookup, s.lookupBaseURL, time.Since(start), nil, cacheStatus)
}

// Mapping functions.

var extractPodcastIDFromURLRe = regexp.MustCompile(`(?i)/id(\d+)`)

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

func mapTopPodcast(item rawAppleItem) (discoveryPodcastResponse, bool) {
	id := asStringID(item.ID)
	name := firstNonEmpty(item.Name)
	itemURL := strings.TrimSpace(item.URL)
	if id == "" || name == "" || itemURL == "" {
		return discoveryPodcastResponse{}, false
	}

	return discoveryPodcastResponse{
		ID:            id,
		Name:          name,
		ArtistName:    strings.TrimSpace(item.ArtistName),
		ArtworkURL100: strings.TrimSpace(item.ArtworkURL100),
		URL:           itemURL,
		Genres:        mapDiscoveryGenres(item.Genres),
	}, true
}

func mapTopEpisode(item rawAppleItem) (discoveryPodcastResponse, bool) {
	id := asStringID(item.ID)
	name := firstNonEmpty(item.Name)
	itemURL := strings.TrimSpace(item.URL)
	if id == "" || name == "" || itemURL == "" {
		return discoveryPodcastResponse{}, false
	}

	providerPodcastID := asStringID(item.CollectionID)
	if providerPodcastID == "" {
		providerPodcastID = extractPodcastIDFromURL(itemURL)
	}

	return discoveryPodcastResponse{
		ID:                id,
		Name:              name,
		ArtistName:        strings.TrimSpace(item.ArtistName),
		ArtworkURL100:     strings.TrimSpace(item.ArtworkURL100),
		URL:               itemURL,
		Genres:            []discoveryGenre{},
		Description:       strings.TrimSpace(item.Description),
		ReleaseDate:       strings.TrimSpace(item.ReleaseDate),
		Duration:          asOptionalInt64(item.Duration),
		ProviderPodcastID: providerPodcastID,
	}, true
}

func mapSearchPodcast(item rawAppleItem) (podcastLookupResponse, bool) {
	return mapLookupPodcast(item)
}

func mapSearchEpisode(item rawAppleItem) (searchEpisodeResponse, bool) {
	trackName := firstNonEmpty(item.TrackName, item.CollectionName)
	collectionName := firstNonEmpty(item.CollectionName, item.TrackName)
	episodeURL := strings.TrimSpace(item.EpisodeURL)
	if trackName == "" || collectionName == "" || episodeURL == "" {
		return searchEpisodeResponse{}, false
	}

	artworkURL100 := firstNonEmpty(item.ArtworkURL160, item.ArtworkURL60)
	artworkURL600 := firstNonEmpty(item.ArtworkURL600, artworkURL100)

	return searchEpisodeResponse{
		ProviderEpisodeID: asOptionalInt64(item.TrackID),
		ProviderPodcastID: asOptionalInt64(item.CollectionID),
		TrackName:         trackName,
		CollectionName:    collectionName,
		FeedURL:           strings.TrimSpace(item.FeedURL),
		EpisodeURL:        episodeURL,
		ReleaseDate:       strings.TrimSpace(item.ReleaseDate),
		TrackTimeMillis:   asOptionalInt64(item.TrackTimeMillis),
		ArtworkURL600:     strings.TrimSpace(artworkURL600),
		Description:       firstNonEmpty(item.Description, item.ShortDescription),
		ShortDescription:  strings.TrimSpace(item.ShortDescription),
		EpisodeGUID:       strings.TrimSpace(item.EpisodeGUID),
		ArtworkURL100:     strings.TrimSpace(artworkURL100),
		ArtistName:        strings.TrimSpace(item.ArtistName),
	}, true
}

func isRelevantDiscoverySearchResult(item rawAppleItem, query string) bool {
	tokens := tokenizeDiscoveryQuery(query)
	if len(tokens) == 0 {
		return true
	}

	searchText := strings.ToLower(
		strings.Join(
			[]string{
				strings.TrimSpace(item.CollectionName),
				strings.TrimSpace(item.TrackName),
				strings.TrimSpace(item.ArtistName),
			},
			" ",
		),
	)

	for _, token := range tokens {
		if strings.Contains(searchText, token) {
			return true
		}
	}

	return false
}

func tokenizeDiscoveryQuery(query string) []string {
	rawTokens := discoveryTokenSplitPattern.Split(strings.ToLower(query), -1)
	tokens := make([]string, 0, len(rawTokens))
	for _, token := range rawTokens {
		token = strings.TrimSpace(token)
		if len(token) <= 1 {
			continue
		}
		if _, blocked := discoveryStopWords[token]; blocked {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

func mapLookupPodcast(item rawAppleItem) (podcastLookupResponse, bool) {
	collectionName := firstNonEmpty(item.CollectionName, item.TrackName)
	if collectionName == "" {
		return podcastLookupResponse{}, false
	}

	return podcastLookupResponse{
		ProviderPodcastID: asOptionalInt64(item.CollectionID),
		CollectionName:    collectionName,
		ArtistName:        strings.TrimSpace(item.ArtistName),
		ArtworkURL100:     strings.TrimSpace(item.ArtworkURL100),
		ArtworkURL600:     strings.TrimSpace(item.ArtworkURL600),
		FeedURL:           strings.TrimSpace(item.FeedURL),
		CollectionViewURL: strings.TrimSpace(item.CollectionViewURL),
		ArtistID:          asOptionalInt64(item.ArtistID),
		PrimaryGenreName:  strings.TrimSpace(item.PrimaryGenreName),
		Genres:            mapLookupGenres(item.Genres),
		TrackCount:        asOptionalInt64(item.TrackCount),
	}, true
}

func mapLookupPodcastByIDs(item rawAppleItem) (discoveryPodcastResponse, bool) {
	id := firstNonEmpty(asStringID(item.CollectionID), asStringID(item.ID))
	name := firstNonEmpty(item.CollectionName, item.TrackName)
	url := firstNonEmpty(item.CollectionViewURL, item.URL)
	if id == "" || name == "" || url == "" {
		return discoveryPodcastResponse{}, false
	}

	return discoveryPodcastResponse{
		ID:                id,
		Name:              name,
		ArtistName:        strings.TrimSpace(item.ArtistName),
		ArtworkURL100:     strings.TrimSpace(item.ArtworkURL100),
		URL:               url,
		Genres:            mapDiscoveryGenres(item.Genres),
		FeedURL:           strings.TrimSpace(item.FeedURL),
		ProviderPodcastID: id,
	}, true
}

func mapLookupEpisode(item rawAppleItem) (episodeLookupResponse, bool) {
	title := firstNonEmpty(item.TrackName, item.CollectionName)
	audioURL := strings.TrimSpace(item.EpisodeURL)
	pubDate := strings.TrimSpace(item.ReleaseDate)
	if title == "" || audioURL == "" || pubDate == "" {
		return episodeLookupResponse{}, false
	}

	id := firstNonEmpty(strings.TrimSpace(item.EpisodeGUID), asStringID(item.TrackID))
	if id == "" {
		return episodeLookupResponse{}, false
	}

	artwork := firstNonEmpty(item.ArtworkURL600, item.ArtworkURL160, item.ArtworkURL60)
	description := firstNonEmpty(item.Description, item.ShortDescription)
	durationMs := asOptionalInt64(item.TrackTimeMillis)
	var durationSeconds *float64
	if durationMs != nil {
		value := float64(*durationMs) / 1000
		durationSeconds = &value
	}

	return episodeLookupResponse{
		ID:                id,
		Title:             title,
		Description:       description,
		AudioURL:          audioURL,
		PubDate:           pubDate,
		ArtworkURL:        strings.TrimSpace(artwork),
		Duration:          durationSeconds,
		ProviderEpisodeID: asStringID(item.TrackID),
		CollectionName:    strings.TrimSpace(item.CollectionName),
		ArtistName:        strings.TrimSpace(item.ArtistName),
		FeedURL:           strings.TrimSpace(item.FeedURL),
	}, true
}

func mapDiscoveryGenres(rawGenres []json.RawMessage) []discoveryGenre {
	if len(rawGenres) == 0 {
		return []discoveryGenre{}
	}

	genres := make([]discoveryGenre, 0, len(rawGenres))
	for index, rawGenre := range rawGenres {
		var textValue string
		if err := json.Unmarshal(rawGenre, &textValue); err == nil {
			name := strings.TrimSpace(textValue)
			if name == "" {
				continue
			}
			genres = append(genres, discoveryGenre{
				GenreID: strconv.Itoa(index),
				Name:    name,
			})
			continue
		}

		var objectValue rawAppleGenre
		if err := json.Unmarshal(rawGenre, &objectValue); err != nil {
			continue
		}

		genreID := asStringID(objectValue.GenreID)
		if genreID == "" {
			genreID = strconv.Itoa(index)
		}
		name := strings.TrimSpace(objectValue.Name)
		if name == "" {
			name = genreID
		}
		genres = append(genres, discoveryGenre{
			GenreID: genreID,
			Name:    name,
			URL:     strings.TrimSpace(objectValue.URL),
		})
	}

	return genres
}

func mapLookupGenres(rawGenres []json.RawMessage) []string {
	genres := make([]string, 0, len(rawGenres))
	for _, rawGenre := range rawGenres {
		var textValue string
		if err := json.Unmarshal(rawGenre, &textValue); err == nil {
			name := strings.TrimSpace(textValue)
			if name != "" {
				genres = append(genres, name)
			}
			continue
		}

		var objectValue rawAppleGenre
		if err := json.Unmarshal(rawGenre, &objectValue); err == nil {
			name := strings.TrimSpace(objectValue.Name)
			if name != "" {
				genres = append(genres, name)
			}
		}
	}
	return genres
}
