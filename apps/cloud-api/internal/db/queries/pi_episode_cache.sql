-- name: GetPIEpisodePageMetadata :one
SELECT
  (SELECT COUNT(*) FROM podcast_episodes episodes WHERE episodes.podcast_itunes_id = sqlc.arg(podcast_itunes_id)) AS total_count,
  state.is_truncated,
  state.last_successful_fetch_at_unix,
  state.refresh_not_before_unix
FROM podcast_cache_state state
WHERE state.podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: ListPIEpisodesPage :many
SELECT
  podcast_itunes_id,
  episode_guid,
  title,
  description,
  enclosure_url,
  published_at_unix,
  duration_seconds,
  image,
  episode_number,
  season_number,
  episode_type,
  explicit,
  link,
  enclosure_length,
  transcript_url,
  created_at_unix,
  updated_at_unix
FROM podcast_episodes
WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id)
ORDER BY published_at_unix DESC, episode_guid ASC
LIMIT sqlc.arg(limit) OFFSET sqlc.arg(offset);

-- name: GetPIEpisodeByGuid :one
SELECT
  podcast_itunes_id,
  episode_guid,
  title,
  description,
  enclosure_url,
  published_at_unix,
  duration_seconds,
  image,
  episode_number,
  season_number,
  episode_type,
  explicit,
  link,
  enclosure_length,
  transcript_url,
  created_at_unix,
  updated_at_unix
FROM podcast_episodes
WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id) AND episode_guid = sqlc.arg(episode_guid);

-- name: GetPINewestEpisodePublishedAtUnix :one
SELECT published_at_unix
FROM podcast_episodes
WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id)
ORDER BY published_at_unix DESC
LIMIT 1;

-- name: GetPIRefreshState :one
SELECT
  state.podcast_itunes_id,
  (SELECT COUNT(*) FROM podcast_episodes episodes WHERE episodes.podcast_itunes_id = state.podcast_itunes_id) AS stored_episode_count,
  state.is_truncated,
  state.last_successful_fetch_at_unix,
  state.last_attempted_fetch_at_unix,
  state.refresh_not_before_unix,
  state.fetch_fail_count,
  COALESCE(state.last_error_class, '') AS last_error_class
FROM podcast_cache_state state
WHERE state.podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: UpsertPIPodcastShow :exec
INSERT INTO podcast_shows (
  podcast_itunes_id,
  title,
  description,
  author,
  image,
  feed_url,
  language,
  categories_json,
  episode_count_hint,
  feed_last_update_time_unix,
  created_at_unix,
  updated_at_unix
) VALUES (
  sqlc.arg(podcast_itunes_id),
  sqlc.arg(title),
  sqlc.arg(description),
  sqlc.arg(author),
  sqlc.arg(image),
  sqlc.arg(feed_url),
  sqlc.arg(language),
  sqlc.arg(categories_json),
  sqlc.arg(episode_count_hint),
  sqlc.arg(feed_last_update_time_unix),
  sqlc.arg(created_at_unix),
  sqlc.arg(updated_at_unix)
)
ON CONFLICT(podcast_itunes_id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  author = excluded.author,
  image = excluded.image,
  feed_url = excluded.feed_url,
  language = excluded.language,
  categories_json = excluded.categories_json,
  episode_count_hint = excluded.episode_count_hint,
  feed_last_update_time_unix = excluded.feed_last_update_time_unix,
  updated_at_unix = excluded.updated_at_unix;

-- name: DeletePIEpisodesForPodcast :exec
DELETE FROM podcast_episodes WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: InsertPIEpisode :exec
INSERT INTO podcast_episodes (
  podcast_itunes_id,
  episode_guid,
  title,
  description,
  enclosure_url,
  published_at_unix,
  duration_seconds,
  image,
  episode_number,
  season_number,
  episode_type,
  explicit,
  link,
  enclosure_length,
  transcript_url,
  created_at_unix,
  updated_at_unix
) VALUES (
  sqlc.arg(podcast_itunes_id),
  sqlc.arg(episode_guid),
  sqlc.arg(title),
  sqlc.arg(description),
  sqlc.arg(enclosure_url),
  sqlc.arg(published_at_unix),
  sqlc.arg(duration_seconds),
  sqlc.arg(image),
  sqlc.arg(episode_number),
  sqlc.arg(season_number),
  sqlc.arg(episode_type),
  sqlc.arg(explicit),
  sqlc.arg(link),
  sqlc.arg(enclosure_length),
  sqlc.arg(transcript_url),
  sqlc.arg(created_at_unix),
  sqlc.arg(updated_at_unix)
);

-- name: UpsertPIEpisode :exec
INSERT INTO podcast_episodes (
  podcast_itunes_id,
  episode_guid,
  title,
  description,
  enclosure_url,
  published_at_unix,
  duration_seconds,
  image,
  episode_number,
  season_number,
  episode_type,
  explicit,
  link,
  enclosure_length,
  transcript_url,
  created_at_unix,
  updated_at_unix
) VALUES (
  sqlc.arg(podcast_itunes_id),
  sqlc.arg(episode_guid),
  sqlc.arg(title),
  sqlc.arg(description),
  sqlc.arg(enclosure_url),
  sqlc.arg(published_at_unix),
  sqlc.arg(duration_seconds),
  sqlc.arg(image),
  sqlc.arg(episode_number),
  sqlc.arg(season_number),
  sqlc.arg(episode_type),
  sqlc.arg(explicit),
  sqlc.arg(link),
  sqlc.arg(enclosure_length),
  sqlc.arg(transcript_url),
  sqlc.arg(created_at_unix),
  sqlc.arg(updated_at_unix)
)
ON CONFLICT(podcast_itunes_id, episode_guid) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  enclosure_url = excluded.enclosure_url,
  published_at_unix = excluded.published_at_unix,
  duration_seconds = excluded.duration_seconds,
  image = excluded.image,
  episode_number = excluded.episode_number,
  season_number = excluded.season_number,
  episode_type = excluded.episode_type,
  explicit = excluded.explicit,
  link = excluded.link,
  enclosure_length = excluded.enclosure_length,
  transcript_url = excluded.transcript_url,
  updated_at_unix = excluded.updated_at_unix;

-- name: UpsertPIFullCacheState :exec
INSERT INTO podcast_cache_state (
  podcast_itunes_id,
  is_truncated,
  last_successful_fetch_at_unix,
  last_attempted_fetch_at_unix,
  refresh_not_before_unix,
  fetch_fail_count,
  last_error_class,
  approx_bytes,
  priority,
  last_accessed_at_unix
) VALUES (
  sqlc.arg(podcast_itunes_id),
  sqlc.arg(is_truncated),
  sqlc.arg(last_successful_fetch_at_unix),
  sqlc.arg(last_attempted_fetch_at_unix),
  sqlc.arg(refresh_not_before_unix),
  sqlc.arg(fetch_fail_count),
  sqlc.arg(last_error_class),
  sqlc.arg(approx_bytes),
  sqlc.arg(priority),
  sqlc.arg(last_accessed_at_unix)
)
ON CONFLICT(podcast_itunes_id) DO UPDATE SET
  is_truncated = excluded.is_truncated,
  last_successful_fetch_at_unix = excluded.last_successful_fetch_at_unix,
  last_attempted_fetch_at_unix = excluded.last_attempted_fetch_at_unix,
  refresh_not_before_unix = excluded.refresh_not_before_unix,
  fetch_fail_count = excluded.fetch_fail_count,
  last_error_class = excluded.last_error_class,
  approx_bytes = excluded.approx_bytes,
  priority = excluded.priority,
  last_accessed_at_unix = excluded.last_accessed_at_unix;

-- name: MarkPIRefreshFailure :exec
UPDATE podcast_cache_state
SET last_attempted_fetch_at_unix = sqlc.arg(last_attempted_fetch_at_unix),
  refresh_not_before_unix = sqlc.arg(refresh_not_before_unix),
  fetch_fail_count = sqlc.arg(fetch_fail_count),
  last_error_class = sqlc.arg(last_error_class)
WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: TouchPIPodcastAccess :exec
UPDATE podcast_cache_state
SET last_accessed_at_unix = sqlc.arg(last_accessed_at_unix)
WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: ListPIEvictionCandidates :many
SELECT podcast_itunes_id, approx_bytes
FROM podcast_cache_state
ORDER BY priority ASC, last_accessed_at_unix ASC, podcast_itunes_id ASC;

-- name: DeletePIPodcastShow :exec
DELETE FROM podcast_shows WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: UpsertPIIncrementalCacheState :exec
INSERT INTO podcast_cache_state (
  podcast_itunes_id,
  is_truncated,
  last_successful_fetch_at_unix,
  last_attempted_fetch_at_unix,
  refresh_not_before_unix,
  fetch_fail_count,
  last_error_class,
  approx_bytes,
  priority,
  last_accessed_at_unix
) VALUES (
  sqlc.arg(podcast_itunes_id),
  CASE
    WHEN CAST(sqlc.arg(previously_truncated) AS INTEGER) != 0 THEN 1
    WHEN (SELECT COUNT(*) FROM podcast_episodes episodes WHERE episodes.podcast_itunes_id = sqlc.arg(podcast_itunes_id)) >= CAST(sqlc.arg(max_episodes_per_podcast) AS INTEGER) THEN 1
    WHEN CAST(sqlc.arg(episode_count_hint) AS INTEGER) > (SELECT COUNT(*) FROM podcast_episodes episodes WHERE episodes.podcast_itunes_id = sqlc.arg(podcast_itunes_id)) THEN 1
    ELSE 0
  END,
  sqlc.arg(last_successful_fetch_at_unix),
  sqlc.arg(last_attempted_fetch_at_unix),
  sqlc.arg(refresh_not_before_unix),
  0,
  NULL,
  0,
  sqlc.arg(priority),
  sqlc.arg(last_accessed_at_unix)
)
ON CONFLICT(podcast_itunes_id) DO UPDATE SET
  is_truncated = excluded.is_truncated,
  last_successful_fetch_at_unix = excluded.last_successful_fetch_at_unix,
  last_attempted_fetch_at_unix = excluded.last_attempted_fetch_at_unix,
  refresh_not_before_unix = excluded.refresh_not_before_unix,
  fetch_fail_count = excluded.fetch_fail_count,
  last_error_class = excluded.last_error_class,
  priority = podcast_cache_state.priority,
  last_accessed_at_unix = excluded.last_accessed_at_unix;

-- name: UpdatePIApproxBytes :exec
UPDATE podcast_cache_state
SET approx_bytes = (
  SELECT
    CAST(sqlc.arg(podcast_row_overhead) AS INTEGER) +
    length(CAST(p.podcast_itunes_id AS BLOB)) +
    length(CAST(p.title AS BLOB)) +
    length(CAST(p.description AS BLOB)) +
    length(CAST(COALESCE(p.author, '') AS BLOB)) +
    length(CAST(COALESCE(p.image, '') AS BLOB)) +
    length(CAST(COALESCE(p.feed_url, '') AS BLOB)) +
    length(CAST(COALESCE(p.language, '') AS BLOB)) +
    length(CAST(COALESCE(p.categories_json, '') AS BLOB)) +
    COALESCE((
      SELECT SUM(
        CAST(sqlc.arg(episode_row_overhead) AS INTEGER) +
        length(CAST(e.podcast_itunes_id AS BLOB)) +
        length(CAST(e.episode_guid AS BLOB)) +
        length(CAST(e.title AS BLOB)) +
        length(CAST(e.description AS BLOB)) +
        length(CAST(e.enclosure_url AS BLOB)) +
        length(CAST(COALESCE(e.image, '') AS BLOB)) +
        length(CAST(COALESCE(e.episode_type, '') AS BLOB)) +
        length(CAST(COALESCE(e.link, '') AS BLOB)) +
        length(CAST(COALESCE(e.transcript_url, '') AS BLOB))
      )
      FROM podcast_episodes e
      WHERE e.podcast_itunes_id = p.podcast_itunes_id
    ), 0)
  FROM podcast_shows p
  WHERE p.podcast_itunes_id = podcast_cache_state.podcast_itunes_id
)
WHERE podcast_cache_state.podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: GetPIPodcastMetadata :one
SELECT
  p.podcast_itunes_id,
  p.title,
  p.description,
  COALESCE(p.author, '') AS author,
  COALESCE(p.image, '') AS image,
  COALESCE(p.feed_url, '') AS feed_url,
  COALESCE(p.language, '') AS language,
  COALESCE(p.categories_json, '') AS categories_json,
  COALESCE(p.episode_count_hint, 0) AS episode_count_hint,
  p.feed_last_update_time_unix,
  p.created_at_unix,
  p.updated_at_unix
FROM podcast_shows p
WHERE p.podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: GetPIPodcastRecord :one
SELECT
  p.podcast_itunes_id,
  p.title,
  p.description,
  COALESCE(p.author, '') AS author,
  COALESCE(p.image, '') AS image,
  COALESCE(p.feed_url, '') AS feed_url,
  COALESCE(p.language, '') AS language,
  COALESCE(p.categories_json, '') AS categories_json,
  COALESCE(p.episode_count_hint, 0) AS episode_count_hint,
  p.feed_last_update_time_unix,
  (SELECT COUNT(*) FROM podcast_episodes episodes WHERE episodes.podcast_itunes_id = p.podcast_itunes_id) AS stored_episode_count,
  COALESCE(state.is_truncated, 0) AS is_truncated,
  COALESCE(state.last_successful_fetch_at_unix, 0) AS last_successful_fetch_at_unix,
  COALESCE(state.last_attempted_fetch_at_unix, 0) AS last_attempted_fetch_at_unix,
  COALESCE(state.refresh_not_before_unix, 0) AS refresh_not_before_unix,
  COALESCE(state.fetch_fail_count, 0) AS fetch_fail_count,
  COALESCE(state.last_error_class, '') AS last_error_class,
  COALESCE(state.approx_bytes, 0) AS approx_bytes,
  COALESCE(state.priority, 0) AS priority,
  COALESCE(state.last_accessed_at_unix, 0) AS last_accessed_at_unix,
  p.created_at_unix,
  p.updated_at_unix
FROM podcast_shows p
LEFT JOIN podcast_cache_state state
  ON state.podcast_itunes_id = p.podcast_itunes_id
WHERE p.podcast_itunes_id = sqlc.arg(podcast_itunes_id);

-- name: ListPIEpisodes :many
SELECT
  podcast_itunes_id,
  episode_guid,
  title,
  description,
  enclosure_url,
  published_at_unix,
  duration_seconds,
  image,
  episode_number,
  season_number,
  episode_type,
  explicit,
  link,
  enclosure_length,
  transcript_url,
  created_at_unix,
  updated_at_unix
FROM podcast_episodes
WHERE podcast_itunes_id = sqlc.arg(podcast_itunes_id)
ORDER BY published_at_unix DESC, episode_guid ASC;
