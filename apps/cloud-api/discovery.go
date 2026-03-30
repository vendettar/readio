package main

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	discoveryRoutePrefix                      = "/api/v1/discovery/"
	discoverySearchPodcastsRoute              = "/api/v1/discovery/search/podcasts"
	discoverySearchEpisodesRoute              = "/api/v1/discovery/search/episodes"
	discoveryTopPodcastsRoute                 = "/api/v1/discovery/top-podcasts"
	discoveryTopEpisodesRoute                 = "/api/v1/discovery/top-episodes"
	discoveryFeedRoute                        = "/api/v1/discovery/feed"
	discoveryLookupPodcastRoute               = "/api/v1/discovery/lookup/podcast"
	discoveryLookupPodcastEpisodesRoute       = "/api/v1/discovery/lookup/podcast-episodes"
	discoveryLookupPodcastsRoute              = "/api/v1/discovery/lookup/podcasts"
	discoveryRSSBaseURL                       = "https://rss.marketingtools.apple.com/api/v2"
	discoverySearchBaseURL                    = "https://itunes.apple.com/search"
	discoveryLookupBaseURL                    = "https://itunes.apple.com/lookup"
	discoveryUserAgent                        = "Readio/1.0 (Cloud Discovery)"
	discoveryRequestTimeout                   = 8 * time.Second
	discoveryBodyLimit                  int64 = 2 << 20
	defaultDiscoveryCountry                   = "us"
	defaultDiscoveryPodcastSearchLimit        = 20
	defaultDiscoveryEpisodeSearchLimit        = 50
	defaultDiscoveryTopLimit                  = 25
	defaultDiscoveryLookupEpisodesLimit       = 50
	maxDiscoverySearchLimit                   = 200
	maxDiscoveryTopLimit                      = 100
	maxDiscoveryLookupEpisodesLimit           = 300
)

var (
	discoveryCountryPattern    = regexp.MustCompile(`^[a-z]{2}$`)
	discoveryIDPattern         = regexp.MustCompile(`^[1-9][0-9]*$`)
	discoveryTokenSplitPattern = regexp.MustCompile(`[\s,.!?;:'"()[\]{}]+`)
	errDiscoveryTimeout        = errors.New("discovery upstream timeout")
	errDiscoveryTooLarge       = errors.New("discovery upstream response too large")
	errDiscoveryDecode         = errors.New("discovery upstream response invalid")
	errDiscoveryXMLDecode      = errors.New("discovery upstream response invalid XML")
	discoveryStopWords         = map[string]struct{}{
		"the": {}, "a": {}, "an": {}, "and": {}, "or": {}, "of": {}, "in": {}, "on": {},
		"at": {}, "to": {}, "for": {}, "with": {}, "by": {}, "is": {}, "it": {}, "that": {},
		"this": {}, "podcast": {}, "audio": {}, "episode": {}, "episodes": {},
	}
)

type discoveryService struct {
	client        *http.Client
	timeout       time.Duration
	rssBaseURL    string
	searchBaseURL string
	lookupBaseURL string
	userAgent     string
	bodyLimit     int64
	lookupIP      func(context.Context, string) ([]net.IPAddr, error)
	dialContext   func(context.Context, string, string) (net.Conn, error)
}

type discoveryParamError struct {
	code    string
	message string
}

func (e *discoveryParamError) Error() string {
	return e.message
}

type discoveryUpstreamStatusError struct {
	status int
}

func (e *discoveryUpstreamStatusError) Error() string {
	return fmt.Sprintf("discovery upstream returned status %d", e.status)
}

type discoveryGenre struct {
	GenreID string `json:"genreId"`
	Name    string `json:"name"`
	URL     string `json:"url,omitempty"`
}

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

type parsedFeedResponse struct {
	Title       string                    `json:"title"`
	Description string                    `json:"description"`
	ArtworkURL  string                    `json:"artworkUrl,omitempty"`
	Episodes    []parsedFeedEpisodeResult `json:"episodes"`
}

type parsedFeedEpisodeResult struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	DescriptionHTML string   `json:"descriptionHtml,omitempty"`
	AudioURL        string   `json:"audioUrl"`
	PubDate         string   `json:"pubDate"`
	ArtworkURL      string   `json:"artworkUrl,omitempty"`
	Duration        *float64 `json:"duration,omitempty"`
	SeasonNumber    *int     `json:"seasonNumber,omitempty"`
	EpisodeNumber   *int     `json:"episodeNumber,omitempty"`
	EpisodeType     string   `json:"episodeType,omitempty"`
	Explicit        *bool    `json:"explicit,omitempty"`
	Link            string   `json:"link,omitempty"`
	FileSize        *int64   `json:"fileSize,omitempty"`
	TranscriptURL   string   `json:"transcriptUrl,omitempty"`
	ChaptersURL     string   `json:"chaptersUrl,omitempty"`
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

type rssDocument struct {
	Channel rssChannel `xml:"channel"`
}

type rssChannel struct {
	Title        string              `xml:"title"`
	Description  string              `xml:"description"`
	Image        rssHrefElement      `xml:"http://www.itunes.com/dtds/podcast-1.0.dtd image"`
	ChannelImage rssChannelImageInfo `xml:"image"`
	Items        []rssItem           `xml:"item"`
}

type rssItem struct {
	Title       string         `xml:"title"`
	Description string         `xml:"description"`
	Summary     string         `xml:"summary"`
	Encoded     string         `xml:"encoded"`
	GUID        string         `xml:"guid"`
	PubDate     string         `xml:"pubDate"`
	Link        string         `xml:"link"`
	Enclosure   rssEnclosure   `xml:"enclosure"`
	Image       rssHrefElement `xml:"http://www.itunes.com/dtds/podcast-1.0.dtd image"`
	Duration    string         `xml:"duration"`
	Season      string         `xml:"season"`
	Episode     string         `xml:"episode"`
	EpisodeType string         `xml:"episodeType"`
	Explicit    string         `xml:"explicit"`
	Transcript  rssHrefElement `xml:"transcript"`
	Chapters    rssHrefElement `xml:"chapters"`
}

type rssEnclosure struct {
	URL    string `xml:"url,attr"`
	Length string `xml:"length,attr"`
}

type rssHrefElement struct {
	Href string `xml:"href,attr"`
	URL  string `xml:"url,attr"`
	Text string `xml:",chardata"`
}

type rssTextElement struct {
	Text string `xml:",chardata"`
}

type rssChannelImageInfo struct {
	URL string `xml:"url"`
}

func newDiscoveryService() *discoveryService {
	return &discoveryService{
		client: &http.Client{
			Timeout: discoveryRequestTimeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		timeout:       discoveryRequestTimeout,
		rssBaseURL:    discoveryRSSBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		userAgent:     discoveryUserAgent,
		bodyLimit:     discoveryBodyLimit,
		lookupIP:      net.DefaultResolver.LookupIPAddr,
	}
}

func (s *discoveryService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeDiscoveryError(w, http.StatusMethodNotAllowed, "method_not_allowed", "only GET is allowed")
		return
	}

	switch path.Clean(r.URL.Path) {
	case discoverySearchPodcastsRoute:
		s.handleSearchPodcasts(w, r)
	case discoverySearchEpisodesRoute:
		s.handleSearchEpisodes(w, r)
	case discoveryTopPodcastsRoute:
		s.handleTopPodcasts(w, r)
	case discoveryTopEpisodesRoute:
		s.handleTopEpisodes(w, r)
	case discoveryFeedRoute:
		s.handleFeed(w, r)
	case discoveryLookupPodcastRoute:
		s.handleLookupPodcast(w, r)
	case discoveryLookupPodcastEpisodesRoute:
		s.handleLookupPodcastEpisodes(w, r)
	case discoveryLookupPodcastsRoute:
		s.handleLookupPodcasts(w, r)
	default:
		writeDiscoveryError(w, http.StatusNotFound, "not_found", "unknown discovery endpoint")
	}
}

func (s *discoveryService) handleSearchPodcasts(w http.ResponseWriter, r *http.Request) {
	term, err := parseDiscoveryTerm(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
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
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	params := url.Values{
		"term":    []string{term},
		"country": []string{country},
		"media":   []string{"podcast"},
		"limit":   []string{strconv.Itoa(limit)},
	}

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, strings.TrimRight(s.searchBaseURL, "/")+"?"+params.Encode(), &payload); err != nil {
		writeDiscoveryMappedError(w, err)
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
}

func (s *discoveryService) handleSearchEpisodes(w http.ResponseWriter, r *http.Request) {
	term, err := parseDiscoveryTerm(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
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
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	params := url.Values{
		"term":    []string{term},
		"country": []string{country},
		"media":   []string{"podcast"},
		"entity":  []string{"podcastEpisode"},
		"limit":   []string{strconv.Itoa(limit)},
	}

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, strings.TrimRight(s.searchBaseURL, "/")+"?"+params.Encode(), &payload); err != nil {
		writeDiscoveryMappedError(w, err)
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
}

func (s *discoveryService) handleTopPodcasts(w http.ResponseWriter, r *http.Request) {
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	limit, err := parseDiscoveryLimit(r.URL.Query(), "limit", defaultDiscoveryTopLimit, maxDiscoveryTopLimit)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	upstreamURL := fmt.Sprintf("%s/%s/podcasts/top/%d/podcasts.json", strings.TrimRight(s.rssBaseURL, "/"), country, limit)
	var payload rawAppleFeedResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	items := make([]discoveryPodcastResponse, 0, len(payload.Feed.Results))
	for _, item := range payload.Feed.Results {
		mapped, ok := mapTopPodcast(item)
		if ok {
			items = append(items, mapped)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
}

func (s *discoveryService) handleTopEpisodes(w http.ResponseWriter, r *http.Request) {
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	limit, err := parseDiscoveryLimit(r.URL.Query(), "limit", defaultDiscoveryTopLimit, maxDiscoveryTopLimit)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	upstreamURL := fmt.Sprintf("%s/%s/podcasts/top/%d/podcast-episodes.json", strings.TrimRight(s.rssBaseURL, "/"), country, limit)
	var payload rawAppleFeedResponse
	if err := s.fetchJSON(ctx, upstreamURL, &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	items := make([]discoveryPodcastResponse, 0, len(payload.Feed.Results))
	for _, item := range payload.Feed.Results {
		mapped, ok := mapTopEpisode(item)
		if ok {
			items = append(items, mapped)
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, items)
}

func (s *discoveryService) handleLookupPodcast(w http.ResponseWriter, r *http.Request) {
	id, err := parseDiscoveryID(r.URL.Query(), "id")
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	params := url.Values{
		"id":      []string{id},
		"country": []string{country},
		"entity":  []string{"podcast"},
	}

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, strings.TrimRight(s.lookupBaseURL, "/")+"?"+params.Encode(), &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	for _, item := range payload.Results {
		if item.Kind != "podcast" && item.WrapperType != "collection" {
			continue
		}
		if mapped, ok := mapLookupPodcast(item); ok {
			writeDiscoveryJSON(w, http.StatusOK, mapped)
			return
		}
	}

	writeDiscoveryJSON(w, http.StatusOK, nil)
}

func (s *discoveryService) handleLookupPodcasts(w http.ResponseWriter, r *http.Request) {
	ids, err := parseDiscoveryIDs(r.URL.Query(), "ids")
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	if len(ids) == 0 {
		writeDiscoveryJSON(w, http.StatusOK, []discoveryPodcastResponse{})
		return
	}

	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	params := url.Values{
		"id":      []string{strings.Join(ids, ",")},
		"country": []string{country},
		"entity":  []string{"podcast"},
	}

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, strings.TrimRight(s.lookupBaseURL, "/")+"?"+params.Encode(), &payload); err != nil {
		writeDiscoveryMappedError(w, err)
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
}

func (s *discoveryService) handleFeed(w http.ResponseWriter, r *http.Request) {
	feedURL, err := parseDiscoveryFeedURL(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	payload, err := s.fetchFeed(ctx, feedURL)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, payload)
}

func (s *discoveryService) handleLookupPodcastEpisodes(w http.ResponseWriter, r *http.Request) {
	id, err := parseDiscoveryID(r.URL.Query(), "id")
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	country, err := parseDiscoveryCountry(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}
	limit, err := parseDiscoveryLimit(r.URL.Query(), "limit", defaultDiscoveryLookupEpisodesLimit, maxDiscoveryLookupEpisodesLimit)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	params := url.Values{
		"id":      []string{id},
		"country": []string{country},
		"entity":  []string{"podcastEpisode"},
		"limit":   []string{strconv.Itoa(limit)},
	}

	var payload rawAppleLookupResponse
	if err := s.fetchJSON(ctx, strings.TrimRight(s.lookupBaseURL, "/")+"?"+params.Encode(), &payload); err != nil {
		writeDiscoveryMappedError(w, err)
		return
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

	writeDiscoveryJSON(w, http.StatusOK, items)
}

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
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return &discoveryUpstreamStatusError{status: resp.StatusCode}
	}

	if err := decodeDiscoveryJSON(resp.Body, s.bodyLimit, dest); err != nil {
		return err
	}

	return nil
}

func (s *discoveryService) fetchFeed(ctx context.Context, requestURL string) (parsedFeedResponse, error) {
	parsedURL, err := url.ParseRequestURI(requestURL)
	if err != nil {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "invalid_url",
			message: "url must be a valid absolute http or https URL",
		}
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "invalid_url",
			message: "url must be a valid absolute http or https URL",
		}
	}
	if err := validateProxyTarget(parsedURL); err != nil {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "invalid_url",
			message: err.Error(),
		}
	}

	proxy := &proxyService{
		timeout:     s.timeout,
		userAgent:   s.userAgent,
		bodyLimit:   s.bodyLimit,
		lookupIP:    s.lookupIP,
		dialContext: s.dialContext,
	}
	validatedAddrs, err := proxy.resolveProxyTargetAddresses(ctx, parsedURL)
	if err != nil {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "invalid_url",
			message: err.Error(),
		}
	}

	client := s.newValidatedFeedClient(validatedAddrs)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return parsedFeedResponse{}, fmt.Errorf("create feed upstream request: %w", err)
	}
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8")
	req.Header.Set("User-Agent", s.userAgent)

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return parsedFeedResponse{}, errDiscoveryTimeout
		}
		return parsedFeedResponse{}, fmt.Errorf("perform discovery feed request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return parsedFeedResponse{}, &discoveryUpstreamStatusError{status: resp.StatusCode}
	}

	return decodeDiscoveryFeed(resp.Body, s.bodyLimit)
}

func (s *discoveryService) newValidatedFeedClient(validatedAddrs []netip.Addr) *http.Client {
	proxy := &proxyService{
		timeout:     s.timeout,
		userAgent:   s.userAgent,
		bodyLimit:   s.bodyLimit,
		lookupIP:    s.lookupIP,
		dialContext: s.dialContext,
	}

	client := proxy.newProxyClient(validatedAddrs)
	if s.timeout > 0 {
		client.Timeout = s.timeout
	}

	return client
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

func parseDiscoveryCountry(values url.Values) (string, error) {
	country := strings.ToLower(strings.TrimSpace(values.Get("country")))
	if country == "" {
		return defaultDiscoveryCountry, nil
	}
	if !discoveryCountryPattern.MatchString(country) {
		return "", &discoveryParamError{
			code:    "invalid_country",
			message: "country must be a 2-letter lowercase code",
		}
	}
	return country, nil
}

func parseDiscoveryID(values url.Values, key string) (string, error) {
	value := strings.TrimSpace(values.Get(key))
	if value == "" {
		return "", &discoveryParamError{
			code:    "missing_" + key,
			message: key + " is required",
		}
	}
	if !discoveryIDPattern.MatchString(value) {
		return "", &discoveryParamError{
			code:    "invalid_" + key,
			message: key + " must be a positive integer",
		}
	}
	return value, nil
}

func parseDiscoveryTerm(values url.Values) (string, error) {
	term := strings.ToLower(strings.TrimSpace(values.Get("term")))
	if term == "" {
		return "", &discoveryParamError{
			code:    "invalid_term",
			message: "term must not be empty",
		}
	}
	return term, nil
}

func parseDiscoveryFeedURL(values url.Values) (string, error) {
	raw := strings.TrimSpace(values.Get("url"))
	if raw == "" {
		return "", &discoveryParamError{
			code:    "missing_url",
			message: "url is required",
		}
	}
	return raw, nil
}

func parseDiscoveryIDs(values url.Values, key string) ([]string, error) {
	raw := strings.TrimSpace(strings.Join(values[key], ","))
	if raw == "" {
		return []string{}, nil
	}

	parts := strings.Split(raw, ",")
	ids := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		if !discoveryIDPattern.MatchString(value) {
			return nil, &discoveryParamError{
				code:    "invalid_" + key,
				message: key + " must be a comma-separated list of positive integers",
			}
		}
		ids = append(ids, value)
	}

	return ids, nil
}

func parseDiscoveryLimit(values url.Values, key string, fallback, max int) (int, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > max {
		return 0, &discoveryParamError{
			code:    "invalid_" + key,
			message: fmt.Sprintf("%s must be between 1 and %d", key, max),
		}
	}
	return value, nil
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
		ProviderPodcastID: asStringID(item.CollectionID),
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

func asStringID(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", typed))
	}
}

func asOptionalInt64(value any) *int64 {
	switch typed := value.(type) {
	case nil:
		return nil
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil {
			return nil
		}
		return &parsed
	case float64:
		parsed := int64(typed)
		return &parsed
	case int64:
		return &typed
	case int:
		parsed := int64(typed)
		return &parsed
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		parsed, err := strconv.ParseInt(trimmed, 10, 64)
		if err != nil {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func decodeDiscoveryFeed(body io.Reader, limit int64) (parsedFeedResponse, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return parsedFeedResponse{}, fmt.Errorf("read discovery upstream body: %w", err)
	}
	if int64(len(data)) > limit {
		return parsedFeedResponse{}, errDiscoveryTooLarge
	}

	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.Strict = false

	var document rssDocument
	if err := decoder.Decode(&document); err != nil {
		return parsedFeedResponse{}, errDiscoveryXMLDecode
	}

	payload, err := mapParsedFeed(document)
	if err != nil {
		return parsedFeedResponse{}, errDiscoveryXMLDecode
	}
	return payload, nil
}

func mapParsedFeed(document rssDocument) (parsedFeedResponse, error) {
	title := strings.TrimSpace(document.Channel.Title)
	if title == "" {
		return parsedFeedResponse{}, errDiscoveryXMLDecode
	}

	artworkURL := sanitizeOptionalAbsoluteURL(firstNonEmpty(document.Channel.Image.Href, document.Channel.ChannelImage.URL))
	channelArtworkNormalized := normalizeDiscoveryArtworkURL(artworkURL)

	episodes := make([]parsedFeedEpisodeResult, 0, len(document.Channel.Items))
	for _, item := range document.Channel.Items {
		mapped, ok := mapParsedFeedEpisode(item, channelArtworkNormalized)
		if ok {
			episodes = append(episodes, mapped)
		}
	}

	return parsedFeedResponse{
		Title:       title,
		Description: strings.TrimSpace(document.Channel.Description),
		ArtworkURL:  artworkURL,
		Episodes:    episodes,
	}, nil
}

func mapParsedFeedEpisode(item rssItem, channelArtworkNormalized string) (parsedFeedEpisodeResult, bool) {
	audioURL := sanitizeOptionalAbsoluteURL(item.Enclosure.URL)
	title := strings.TrimSpace(item.Title)
	pubDate := strings.TrimSpace(item.PubDate)
	if audioURL == "" || title == "" || pubDate == "" {
		return parsedFeedEpisodeResult{}, false
	}

	id := firstNonEmpty(strings.TrimSpace(item.GUID), audioURL)
	if id == "" {
		return parsedFeedEpisodeResult{}, false
	}

	description, descriptionHTML := deriveParsedFeedDescription(item)
	artworkURL := sanitizeOptionalAbsoluteURL(firstNonEmpty(item.Image.Href, item.Image.URL))
	if artworkURL != "" && normalizeDiscoveryArtworkURL(artworkURL) == channelArtworkNormalized {
		artworkURL = ""
	}

	return parsedFeedEpisodeResult{
		ID:              id,
		Title:           title,
		Description:     description,
		DescriptionHTML: descriptionHTML,
		AudioURL:        audioURL,
		PubDate:         pubDate,
		ArtworkURL:      artworkURL,
		Duration:        parseParsedFeedDuration(item.Duration),
		SeasonNumber:    parseParsedFeedInt(item.Season),
		EpisodeNumber:   parseParsedFeedInt(item.Episode),
		EpisodeType:     parseParsedFeedEpisodeType(item.EpisodeType),
		Explicit:        parseParsedFeedExplicit(item.Explicit),
		Link:            sanitizeOptionalAbsoluteURL(item.Link),
		FileSize:        parseParsedFeedInt64(item.Enclosure.Length),
		TranscriptURL:   sanitizeOptionalAbsoluteURL(firstNonEmpty(item.Transcript.Href, item.Transcript.URL)),
		ChaptersURL:     sanitizeOptionalAbsoluteURL(firstNonEmpty(item.Chapters.Href, item.Chapters.URL)),
	}, true
}

func deriveParsedFeedDescription(item rssItem) (string, string) {
	encoded := strings.TrimSpace(item.Encoded)
	description := strings.TrimSpace(item.Description)
	summary := strings.TrimSpace(item.Summary)

	if encoded != "" {
		return encoded, encoded
	}
	if strings.Contains(description, "<p") || strings.Contains(description, "<br") || strings.Contains(description, "<a ") {
		return description, description
	}
	if len(description) >= len(summary) {
		return description, ""
	}
	return summary, ""
}

func parseParsedFeedDuration(raw string) *float64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}

	if strings.Contains(value, ":") {
		parts := strings.Split(value, ":")
		seconds := 0
		multiplier := 1
		for index := len(parts) - 1; index >= 0; index-- {
			part, err := strconv.Atoi(strings.TrimSpace(parts[index]))
			if err != nil || part < 0 {
				return nil
			}
			seconds += part * multiplier
			multiplier *= 60
		}
		result := float64(seconds)
		return &result
	}

	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < 0 {
		return nil
	}
	result := float64(seconds)
	return &result
}

func parseParsedFeedInt(raw string) *int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return nil
	}
	return &parsed
}

func parseParsedFeedInt64(raw string) *int64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return nil
	}
	return &parsed
}

func parseParsedFeedEpisodeType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "full", "trailer", "bonus":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return ""
	}
}

func parseParsedFeedExplicit(raw string) *bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "yes", "true":
		value := true
		return &value
	case "no", "false":
		value := false
		return &value
	default:
		return nil
	}
}

func sanitizeOptionalAbsoluteURL(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	return parsed.String()
}

func normalizeDiscoveryArtworkURL(raw string) string {
	value := sanitizeOptionalAbsoluteURL(raw)
	if value == "" {
		return ""
	}
	withoutQuery := strings.Split(value, "?")[0]
	return regexp.MustCompile(`_\d+(\.[a-z]+)$`).ReplaceAllString(strings.ToLower(withoutQuery), "$1")
}

func writeDiscoveryJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeDiscoveryError(w http.ResponseWriter, status int, code, message string) {
	writeDiscoveryJSON(w, status, map[string]string{
		"error":   code,
		"message": message,
	})
}

func writeDiscoveryMappedError(w http.ResponseWriter, err error) {
	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		writeDiscoveryError(w, http.StatusBadRequest, paramErr.code, paramErr.message)
		return
	}

	var statusErr *discoveryUpstreamStatusError
	if errors.As(err, &statusErr) {
		writeDiscoveryError(w, http.StatusBadGateway, "upstream_invalid_response", "discovery upstream returned a non-success status")
		return
	}

	switch {
	case errors.Is(err, errDiscoveryTimeout):
		writeDiscoveryError(w, http.StatusGatewayTimeout, "upstream_timeout", "discovery upstream request timed out")
	case errors.Is(err, errDiscoveryTooLarge):
		writeDiscoveryError(w, http.StatusBadGateway, "upstream_too_large", "discovery upstream response exceeded the allowed size")
	case errors.Is(err, errDiscoveryXMLDecode):
		writeDiscoveryError(w, http.StatusBadGateway, "invalid_upstream_xml", "discovery upstream response was not valid XML")
	case errors.Is(err, errDiscoveryDecode):
		writeDiscoveryError(w, http.StatusBadGateway, "invalid_upstream_payload", "discovery upstream response was not valid JSON")
	default:
		writeDiscoveryError(w, http.StatusBadGateway, "upstream_request_failed", "discovery upstream request failed")
	}
}
