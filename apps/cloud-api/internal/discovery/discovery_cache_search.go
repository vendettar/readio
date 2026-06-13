package discovery

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"readio-cloud/internal/clientip"
	"readio-cloud/internal/podcastindex"
)

type cachedSearchResponse struct {
	Podcasts []cachedSearchPodcastResponse `json:"podcasts"`
	Episodes []cachedSearchEpisodeResponse `json:"episodes"`
	Limit    int                           `json:"limit"`
}

type cachedSearchPodcastResponse struct {
	PodcastItunesID string `json:"podcastItunesId"`
	Title           string `json:"title"`
	Author          string `json:"author"`
	Description     string `json:"description"`
	Image           string `json:"image"`
	ResultSource    string `json:"resultSource"`
}

type cachedSearchEpisodeResponse struct {
	PodcastItunesID string `json:"podcastItunesId"`
	EpisodeGUID     string `json:"episodeGuid"`
	Title           string `json:"title"`
	PodcastTitle    string `json:"podcastTitle"`
	Description     string `json:"description"`
	Image           string `json:"image"`
	PublishedAtUnix int64  `json:"publishedAtUnix"`
	DurationSeconds int64  `json:"durationSeconds"`
	ResultSource    string `json:"resultSource"`
}

func (s *discoveryService) handleSearchCache(w http.ResponseWriter, r *http.Request) {
	route := discoverySearchCacheRoute
	start := time.Now()
	if !s.allowSearchRequest(clientip.EffectiveClientIP(r, s.trustedProxies)) {
		err := errDiscoveryRateLimited
		writeDiscoveryErrorSpec(r, w, http.StatusTooManyRequests, discoveryErrRateLimited)
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), err, CacheStatusUncached)
		return
	}

	if s == nil || s.piEpisodeCacheStore == nil {
		err := errDiscoveryCacheSearchUnavailableError
		writeDiscoveryErrorSpec(r, w, http.StatusServiceUnavailable, discoveryErrCacheSearchUnavailable)
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), err, CacheStatusMissError)
		return
	}

	values := r.URL.Query()
	term, err := parseCachedSearchTerm(values)
	if err != nil {
		writeDiscoveryErrorSpec(r, w, http.StatusBadRequest, discoveryErrorSpecFromParamError(err))
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), err, CacheStatusUncached)
		return
	}
	limit, err := parseDiscoveryLimit(values, "limit", defaultDiscoveryCacheSearchLimit, maxDiscoveryCacheSearchLimit)
	if err != nil {
		writeDiscoveryErrorSpec(r, w, http.StatusBadRequest, discoveryErrorSpecFromParamError(err))
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), err, CacheStatusUncached)
		return
	}

	if utf8.RuneCountInString(term) < 2 {
		writeDiscoveryJSON(w, http.StatusOK, emptyCachedSearchResponse(limit))
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), nil, CacheStatusFreshHit)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), discoveryCacheSearchTimeout)
	defer cancel()

	podcasts, err := s.piEpisodeCacheStore.SearchCachedPodcasts(ctx, term, limit)
	if err != nil {
		writeDiscoveryMappedError(r, w, err)
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), err, CacheStatusMissError)
		return
	}
	episodes, err := s.piEpisodeCacheStore.SearchCachedEpisodes(ctx, term, limit)
	if err != nil {
		writeDiscoveryMappedError(r, w, err)
		logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), err, CacheStatusMissError)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, cachedSearchResponse{
		Podcasts: cachedSearchPodcastResponses(podcasts),
		Episodes: cachedSearchEpisodeResponses(episodes),
		Limit:    limit,
	})
	logDiscoveryRequest(r.Context(), route, "", "", time.Since(start), nil, CacheStatusFreshHit)
}

func parseCachedSearchTerm(values url.Values) (string, error) {
	rawTerm := values.Get("term")
	if len(rawTerm) > podcastindex.PIEpisodeCacheSearchMaxRawQueryBytes {
		return "", &discoveryParamError{
			code:    "INVALID_TERM",
			message: "term is too long",
		}
	}
	return strings.TrimSpace(rawTerm), nil
}

func discoveryErrorSpecFromParamError(err error) discoveryErrorSpec {
	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		return discoveryErrorSpec{
			code:    paramErr.code,
			message: paramErr.message,
		}
	}
	return discoveryErrInvalidUpstreamPayload
}

func emptyCachedSearchResponse(limit int) cachedSearchResponse {
	return cachedSearchResponse{
		Podcasts: []cachedSearchPodcastResponse{},
		Episodes: []cachedSearchEpisodeResponse{},
		Limit:    limit,
	}
}

func cachedSearchPodcastResponses(results []podcastindex.PICachedPodcastSearchResult) []cachedSearchPodcastResponse {
	if len(results) == 0 {
		return []cachedSearchPodcastResponse{}
	}
	responses := make([]cachedSearchPodcastResponse, 0, len(results))
	for _, result := range results {
		responses = append(responses, cachedSearchPodcastResponse{
			PodcastItunesID: result.PodcastItunesID,
			Title:           result.Title,
			Author:          result.Author,
			Description:     result.Description,
			Image:           result.Image,
			ResultSource:    "cache",
		})
	}
	return responses
}

func cachedSearchEpisodeResponses(results []podcastindex.PICachedEpisodeSearchResult) []cachedSearchEpisodeResponse {
	if len(results) == 0 {
		return []cachedSearchEpisodeResponse{}
	}
	responses := make([]cachedSearchEpisodeResponse, 0, len(results))
	for _, result := range results {
		responses = append(responses, cachedSearchEpisodeResponse{
			PodcastItunesID: result.PodcastItunesID,
			EpisodeGUID:     result.EpisodeGUID,
			Title:           result.Title,
			PodcastTitle:    result.PodcastTitle,
			Description:     result.Description,
			Image:           result.Image,
			PublishedAtUnix: result.PublishedAtUnix,
			DurationSeconds: result.DurationSeconds,
			ResultSource:    "cache",
		})
	}
	return responses
}
