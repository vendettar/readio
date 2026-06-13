package podcastindex

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	PIEpisodeCacheSearchMaxRawQueryBytes = 256
	PIEpisodeCacheSearchMaxTokens        = 8
	piEpisodeCacheSearchCandidateFactor  = 20
	piEpisodeCacheSearchMaxCandidates    = 200
)

type PICachedPodcastSearchResult struct {
	PodcastItunesID string
	Title           string
	Author          string
	Description     string
	Image           string
	categories      string
}

type PICachedEpisodeSearchResult struct {
	PodcastItunesID string
	EpisodeGUID     string
	Title           string
	PodcastTitle    string
	podcastAuthor   string
	Description     string
	Image           string
	PublishedAtUnix int64
	DurationSeconds int64
}

func (s *PIEpisodeCacheStore) SearchCachedPodcasts(ctx context.Context, rawQuery string, limit int) ([]PICachedPodcastSearchResult, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}
	if limit <= 0 {
		return nil, nil
	}
	if len(rawQuery) > PIEpisodeCacheSearchMaxRawQueryBytes {
		return nil, nil
	}

	ftsQuery, tokens := sanitizePIEpisodeCacheFTSQuery(rawQuery)
	if ftsQuery == "" {
		return nil, nil
	}

	rows, err := s.searchCachedPodcastRows(ctx, ftsQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("query pi cached podcasts search: %w", err)
	}

	results := make([]PICachedPodcastSearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, PICachedPodcastSearchResult{
			PodcastItunesID: row.PodcastItunesID,
			Title:           row.Title,
			Author:          row.Author,
			Description:     row.Description,
			Image:           row.Image,
			categories:      row.Categories,
		})
	}

	sort.SliceStable(results, func(i, j int) bool {
		leftRank := podcastSearchRank(results[i], tokens)
		rightRank := podcastSearchRank(results[j], tokens)
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		if !strings.EqualFold(results[i].Title, results[j].Title) {
			return strings.ToLower(results[i].Title) < strings.ToLower(results[j].Title)
		}
		return results[i].PodcastItunesID < results[j].PodcastItunesID
	})
	return truncateCachedPodcastSearchResults(results, limit), nil
}

func (s *PIEpisodeCacheStore) SearchCachedEpisodes(ctx context.Context, rawQuery string, limit int) ([]PICachedEpisodeSearchResult, error) {
	if err := s.requireDB(); err != nil {
		return nil, err
	}
	if limit <= 0 {
		return nil, nil
	}
	if len(rawQuery) > PIEpisodeCacheSearchMaxRawQueryBytes {
		return nil, nil
	}

	ftsQuery, tokens := sanitizePIEpisodeCacheFTSQuery(rawQuery)
	if ftsQuery == "" {
		return nil, nil
	}

	rows, err := s.searchCachedEpisodeRows(ctx, ftsQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("query pi cached episodes search: %w", err)
	}

	results := make([]PICachedEpisodeSearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, PICachedEpisodeSearchResult{
			PodcastItunesID: row.PodcastItunesID,
			EpisodeGUID:     row.EpisodeGUID,
			Title:           row.Title,
			PodcastTitle:    row.PodcastTitle,
			podcastAuthor:   row.PodcastAuthor,
			Description:     row.Description,
			Image:           row.Image,
			PublishedAtUnix: row.PublishedAtUnix,
			DurationSeconds: row.DurationSeconds,
		})
	}

	sort.SliceStable(results, func(i, j int) bool {
		leftRank := episodeSearchRank(results[i], tokens)
		rightRank := episodeSearchRank(results[j], tokens)
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		if results[i].PublishedAtUnix != results[j].PublishedAtUnix {
			return results[i].PublishedAtUnix > results[j].PublishedAtUnix
		}
		if results[i].EpisodeGUID != results[j].EpisodeGUID {
			return results[i].EpisodeGUID < results[j].EpisodeGUID
		}
		return results[i].PodcastItunesID < results[j].PodcastItunesID
	})
	return truncateCachedEpisodeSearchResults(results, limit), nil
}

func sanitizePIEpisodeCacheFTSQuery(rawQuery string) (string, []string) {
	trimmed := strings.TrimSpace(rawQuery)
	if utf8.RuneCountInString(trimmed) < 2 {
		return "", nil
	}

	tokens := make([]string, 0, PIEpisodeCacheSearchMaxTokens)
	accepted := make(map[string]struct{}, PIEpisodeCacheSearchMaxTokens)
	var current strings.Builder
	flush := func() {
		if current.Len() == 0 {
			return
		}
		token := strings.ToLower(current.String())
		current.Reset()
		if utf8.RuneCountInString(token) < 2 {
			return
		}
		if _, ok := accepted[token]; ok {
			return
		}
		tokens = append(tokens, token)
		accepted[token] = struct{}{}
	}

	for _, r := range trimmed {
		if unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsNumber(r) {
			current.WriteRune(r)
			continue
		}
		flush()
		if len(tokens) >= PIEpisodeCacheSearchMaxTokens {
			break
		}
	}
	if len(tokens) < PIEpisodeCacheSearchMaxTokens {
		flush()
	}
	if len(tokens) == 0 {
		return "", nil
	}

	ftsTokens := make([]string, 0, len(tokens))
	for _, token := range tokens {
		ftsTokens = append(ftsTokens, token+"*")
	}
	return strings.Join(ftsTokens, " "), tokens
}

type cachedPodcastSearchRow struct {
	PodcastItunesID string
	Title           string
	Description     string
	Author          string
	Image           string
	Categories      string
}

type cachedEpisodeSearchRow struct {
	PodcastItunesID string
	EpisodeGUID     string
	Title           string
	PodcastTitle    string
	PodcastAuthor   string
	Description     string
	Image           string
	PublishedAtUnix int64
	DurationSeconds int64
}

func (s *PIEpisodeCacheStore) searchCachedPodcastRows(ctx context.Context, ftsQuery string, limit int) ([]cachedPodcastSearchRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			p.podcast_itunes_id,
			p.title,
			p.description,
			COALESCE(p.author, '') AS author,
			COALESCE(p.image, '') AS image,
			COALESCE(fts.categories, '') AS categories
		FROM podcast_shows_fts fts
		JOIN podcast_shows_fts_index idx
			ON idx.id = fts.rowid
		JOIN podcast_shows p
			ON p.podcast_itunes_id = idx.podcast_itunes_id
		WHERE podcast_shows_fts MATCH ?
		ORDER BY
			bm25(podcast_shows_fts, 5.0, 2.0, 1.0, 0.5) ASC,
			p.title COLLATE NOCASE ASC,
			p.podcast_itunes_id ASC
		LIMIT ?`,
		ftsQuery,
		cacheSearchCandidateLimit(limit),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]cachedPodcastSearchRow, 0)
	for rows.Next() {
		var row cachedPodcastSearchRow
		if err := rows.Scan(
			&row.PodcastItunesID,
			&row.Title,
			&row.Description,
			&row.Author,
			&row.Image,
			&row.Categories,
		); err != nil {
			return nil, err
		}
		results = append(results, row)
	}
	return results, rows.Err()
}

func (s *PIEpisodeCacheStore) searchCachedEpisodeRows(ctx context.Context, ftsQuery string, limit int) ([]cachedEpisodeSearchRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			e.podcast_itunes_id,
			e.episode_guid,
			e.title,
			show.title AS podcast_title,
			COALESCE(show.author, '') AS podcast_author,
			e.description,
			COALESCE(NULLIF(e.image, ''), show.image, '') AS image,
			e.published_at_unix,
			e.duration_seconds
		FROM podcast_episodes_fts fts
		JOIN podcast_episodes_fts_index idx
			ON idx.id = fts.rowid
		JOIN podcast_episodes e
			ON e.podcast_itunes_id = idx.podcast_itunes_id
			AND e.episode_guid = idx.episode_guid
		JOIN podcast_shows show
			ON show.podcast_itunes_id = e.podcast_itunes_id
		WHERE podcast_episodes_fts MATCH ?
		ORDER BY
			bm25(podcast_episodes_fts, 5.0, 1.0, 4.0, 2.0, 1.0, 3.0) ASC,
			e.published_at_unix DESC,
			e.episode_guid ASC
		LIMIT ?`,
		ftsQuery,
		cacheSearchCandidateLimit(limit),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]cachedEpisodeSearchRow, 0)
	for rows.Next() {
		var row cachedEpisodeSearchRow
		if err := rows.Scan(
			&row.PodcastItunesID,
			&row.EpisodeGUID,
			&row.Title,
			&row.PodcastTitle,
			&row.PodcastAuthor,
			&row.Description,
			&row.Image,
			&row.PublishedAtUnix,
			&row.DurationSeconds,
		); err != nil {
			return nil, err
		}
		results = append(results, row)
	}
	return results, rows.Err()
}

func cacheSearchCandidateLimit(limit int) int {
	candidates := limit * piEpisodeCacheSearchCandidateFactor
	if candidates < limit {
		return limit
	}
	if candidates > piEpisodeCacheSearchMaxCandidates {
		return piEpisodeCacheSearchMaxCandidates
	}
	return candidates
}

func podcastSearchRank(result PICachedPodcastSearchResult, tokens []string) int {
	if textContainsAnyToken(result.Title, tokens) {
		return 0
	}
	if textContainsAnyToken(result.Author, tokens) {
		return 1
	}
	return 2
}

func episodeSearchRank(result PICachedEpisodeSearchResult, tokens []string) int {
	if textContainsAnyToken(result.Title, tokens) {
		return 0
	}
	if textContainsAnyToken(result.PodcastTitle, tokens) || textContainsAnyToken(result.podcastAuthor, tokens) {
		return 1
	}
	return 2
}

func textContainsAnyToken(text string, tokens []string) bool {
	normalized := strings.ToLower(text)
	for _, token := range tokens {
		if strings.Contains(normalized, token) {
			return true
		}
	}
	return false
}

func truncateCachedPodcastSearchResults(results []PICachedPodcastSearchResult, limit int) []PICachedPodcastSearchResult {
	if len(results) <= limit {
		return results
	}
	return results[:limit]
}

func truncateCachedEpisodeSearchResults(results []PICachedEpisodeSearchResult, limit int) []PICachedEpisodeSearchResult {
	if len(results) <= limit {
		return results
	}
	return results[:limit]
}
