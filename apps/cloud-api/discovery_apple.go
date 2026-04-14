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

type appleDiscoveryPodcastResponse struct {
	ID                string           `json:"id"`
	Title             string           `json:"title"`
	Author            string           `json:"author,omitempty"`
	Image             string           `json:"image,omitempty"`
	Artwork           string           `json:"artwork,omitempty"`
	URL               string           `json:"url"`
	AudioURL          string           `json:"audioUrl,omitempty"`
	Genres            []discoveryGenre `json:"genres,omitempty"`
	Description       string           `json:"description,omitempty"`
	ReleaseDate       string           `json:"releaseDate,omitempty"`
	Duration          *int64           `json:"duration,omitempty"`
	FeedURL           string           `json:"feedUrl,omitempty"`
	PodcastItunesID   string           `json:"podcastItunesId,omitempty"`
	ProviderEpisodeID string           `json:"providerEpisodeId,omitempty"`
	FeedID            string           `json:"feedId,omitempty"`
	PodcastGUID       string           `json:"podcastGuid,omitempty"`
	EpisodeGUID       string           `json:"episodeGuid,omitempty"`
	EpisodeCount      *int64           `json:"episodeCount,omitempty"`
	Language          string           `json:"language,omitempty"`
	Link              string           `json:"link,omitempty"`
}

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

func buildAppleFeedURL(base, country string, limit int, resource string) string {
	return fmt.Sprintf(
		"%s/%s/podcasts/top/%d/%s.json",
		strings.TrimRight(base, "/"),
		country,
		limit,
		resource,
	)
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
	TrackCount        any               `json:"trackCount"`
	EpisodeURL        string            `json:"episodeUrl"`
	EpisodeGUID       string            `json:"episodeGuid"`
	TrackID           any               `json:"trackId"`
	TrackTimeMillis   any               `json:"trackTimeMillis"`
	WrapperType       string            `json:"wrapperType"`
	Kind              string            `json:"kind"`
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
				items = append(items, mapAppleDiscoveryPodcastToDiscoveryPodcast(mapped))
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

	writeDiscoveryJSON(w, http.StatusOK, data)
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
				items = append(items, mapAppleDiscoveryPodcastToDiscoveryPodcast(mapped))
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

	writeDiscoveryJSON(w, http.StatusOK, data)
	logDiscoveryRequest(route, UpstreamKindAppleFeed, s.rssBaseURL, time.Since(start), nil, cacheStatus)
}

func (s *discoveryService) handleSearchPodcasts(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoverySearchPodcastsRoute

	if !s.allowSearchRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryError(w, http.StatusTooManyRequests, "RATE_LIMITED", "rate limit exceeded")
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

	upstreamURL := buildAppleSearchURL(s.searchBaseURL, term, country, limit, "")

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	type searchPodcastItem struct {
		ID                string   `json:"id"`
		Title             string   `json:"title"`
		Author            string   `json:"author,omitempty"`
		Image             string   `json:"image,omitempty"`
		Artwork           string   `json:"artwork,omitempty"`
		FeedURL           string   `json:"feedUrl,omitempty"`
		Description       string   `json:"description,omitempty"`
		PodcastItunesID   string   `json:"podcastItunesId,omitempty"`
		FeedID            string   `json:"feedId,omitempty"`
		PodcastGUID       string   `json:"podcastGuid,omitempty"`
		Language          string   `json:"language,omitempty"`
		EpisodeCount      *int64   `json:"episodeCount,omitempty"`
		Genres            []string `json:"genres,omitempty"`
		CollectionViewURL string   `json:"collectionViewUrl,omitempty"`
	}

	items := make([]searchPodcastItem, 0, len(payload.Results))
	for _, item := range payload.Results {
		if item.Kind != "podcast" && item.WrapperType != "collection" {
			continue
		}
		if !isRelevantDiscoverySearchResult(item, term) {
			continue
		}

		itunesIDStr := asStringID(item.CollectionID)
		image := firstNonEmpty(strings.TrimSpace(item.ArtworkURL100), strings.TrimSpace(item.ArtworkURL600))
		artwork := firstNonEmpty(strings.TrimSpace(item.ArtworkURL600), image)

		items = append(items, searchPodcastItem{
			ID:                itunesIDStr,
			Title:             strings.TrimSpace(item.CollectionName),
			Author:            strings.TrimSpace(item.ArtistName),
			Image:             image,
			Artwork:           artwork,
			FeedURL:           strings.TrimSpace(item.FeedURL),
			Description:       strings.TrimSpace(item.Description),
			PodcastItunesID:   itunesIDStr,
			CollectionViewURL: strings.TrimSpace(item.CollectionViewURL),
		})
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), nil, CacheStatusUncached)
}

func (s *discoveryService) handleSearchEpisodes(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoverySearchEpisodesRoute

	if !s.allowSearchRequest(effectiveClientIP(r, s.trustedProxies)) {
		writeDiscoveryError(w, http.StatusTooManyRequests, "RATE_LIMITED", "rate limit exceeded")
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

	upstreamURL := buildAppleSearchURL(s.searchBaseURL, term, country, limit, "podcastEpisode")

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), err, CacheStatusMissError)
		return
	}

	type searchEpisodeItem struct {
		ID                string `json:"id"`
		PodcastItunesID   string `json:"podcastItunesId,omitempty"`
		Title             string `json:"title"`
		Author            string `json:"author,omitempty"`
		PodcastTitle      string `json:"podcastTitle,omitempty"`
		Image             string `json:"image,omitempty"`
		Artwork           string `json:"artwork,omitempty"`
		FeedURL           string `json:"feedUrl,omitempty"`
		EpisodeURL        string `json:"episodeUrl"`
		ReleaseDate       string `json:"releaseDate,omitempty"`
		TrackTimeMillis   *int64 `json:"trackTimeMillis,omitempty"`
		Description       string `json:"description,omitempty"`
		ShortDescription  string `json:"shortDescription,omitempty"`
		EpisodeGUID       string `json:"episodeGuid,omitempty"`
		ProviderEpisodeID *int64 `json:"providerEpisodeId,omitempty"`
	}

	items := make([]searchEpisodeItem, 0, len(payload.Results))
	for _, item := range payload.Results {
		if item.Kind != "podcast-episode" && item.WrapperType != "track" {
			continue
		}
		if !isRelevantDiscoverySearchResult(item, term) {
			continue
		}

		audioURL := strings.TrimSpace(item.EpisodeURL)
		releaseDate := strings.TrimSpace(item.ReleaseDate)
		title := firstNonEmpty(item.TrackName, item.CollectionName)
		if audioURL == "" || releaseDate == "" || title == "" {
			continue
		}

		itunesIDStr := asStringID(item.CollectionID)
		image := firstNonEmpty(strings.TrimSpace(item.ArtworkURL160), strings.TrimSpace(item.ArtworkURL60))
		artwork := firstNonEmpty(strings.TrimSpace(item.ArtworkURL600), image)
		providerEpisodeID := asOptionalInt64(item.TrackID)
		description := firstNonEmpty(item.Description, item.ShortDescription)
		durationMs := asOptionalInt64(item.TrackTimeMillis)

		items = append(items, searchEpisodeItem{
			ID:                asStringID(item.TrackID),
			PodcastItunesID:   itunesIDStr,
			Title:             title,
			Author:            strings.TrimSpace(item.ArtistName),
			PodcastTitle:      strings.TrimSpace(item.CollectionName),
			Image:             image,
			Artwork:           artwork,
			FeedURL:           strings.TrimSpace(item.FeedURL),
			EpisodeURL:        audioURL,
			ReleaseDate:       releaseDate,
			TrackTimeMillis:   durationMs,
			Description:       description,
			ShortDescription:  strings.TrimSpace(item.ShortDescription),
			EpisodeGUID:       strings.TrimSpace(item.EpisodeGUID),
			ProviderEpisodeID: providerEpisodeID,
		})
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
	logDiscoveryRequest(route, UpstreamKindAppleSearch, s.searchBaseURL, time.Since(start), nil, CacheStatusUncached)
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

func mapTopPodcast(item rawAppleItem) (appleDiscoveryPodcastResponse, bool) {
	id := asStringID(item.ID)
	title := firstNonEmpty(item.Name)
	itemURL := strings.TrimSpace(item.URL)
	if id == "" || title == "" || itemURL == "" {
		return appleDiscoveryPodcastResponse{}, false
	}

	image := firstNonEmpty(strings.TrimSpace(item.ArtworkURL100), strings.TrimSpace(item.ArtworkURL600))
	artwork := firstNonEmpty(strings.TrimSpace(item.ArtworkURL600), image)

	return appleDiscoveryPodcastResponse{
		ID:      id,
		Title:   title,
		Author:  strings.TrimSpace(item.ArtistName),
		Image:   image,
		Artwork: artwork,
		URL:     itemURL,
		Genres:  mapDiscoveryGenres(item.Genres),
	}, true
}

func mapTopEpisode(item rawAppleItem) (appleDiscoveryPodcastResponse, bool) {
	id := asStringID(item.ID)
	title := firstNonEmpty(item.Name)
	itemURL := strings.TrimSpace(item.URL)
	if id == "" || title == "" || itemURL == "" {
		return appleDiscoveryPodcastResponse{}, false
	}

	image := firstNonEmpty(strings.TrimSpace(item.ArtworkURL100), strings.TrimSpace(item.ArtworkURL600))
	artwork := firstNonEmpty(strings.TrimSpace(item.ArtworkURL600), image)
	PodcastItunesID := asStringID(item.CollectionID)
	if PodcastItunesID == "" {
		PodcastItunesID = extractPodcastIDFromURL(itemURL)
	}

	return appleDiscoveryPodcastResponse{
		ID:                id,
		Title:             title,
		Author:            strings.TrimSpace(item.ArtistName),
		Image:             image,
		Artwork:           artwork,
		URL:               itemURL,
		AudioURL:          strings.TrimSpace(item.EpisodeURL),
		Genres:            []discoveryGenre{},
		Description:       strings.TrimSpace(item.Description),
		ReleaseDate:       strings.TrimSpace(item.ReleaseDate),
		Duration:          asOptionalInt64(item.Duration),
		PodcastItunesID:   PodcastItunesID,
		ProviderEpisodeID: asStringID(item.TrackID),
	}, true
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

func mapAppleDiscoveryPodcastToDiscoveryPodcast(a appleDiscoveryPodcastResponse) discoveryPodcastResponse {
	return discoveryPodcastResponse{
		ID:                a.ID,
		Title:             a.Title,
		Author:            a.Author,
		URL:               a.URL,
		Image:             a.Image,
		Artwork:           a.Artwork,
		Genres:            a.Genres,
		Description:       a.Description,
		ReleaseDate:       a.ReleaseDate,
		Duration:          a.Duration,
		FeedURL:           a.FeedURL,
		PodcastItunesID:   a.PodcastItunesID,
		ProviderEpisodeID: a.ProviderEpisodeID,
		FeedID:            a.FeedID,
		PodcastGUID:       a.PodcastGUID,
		EpisodeGUID:       a.EpisodeGUID,
		EpisodeCount:      a.EpisodeCount,
		Language:          a.Language,
		AudioURL:          a.AudioURL,
	}
}
