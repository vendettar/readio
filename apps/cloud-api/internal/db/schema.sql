CREATE TABLE podcast_shows (
  podcast_itunes_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT,
  image TEXT,
  feed_url TEXT,
  language TEXT,
  categories_json TEXT,
  episode_count_hint INTEGER,
  feed_last_update_time_unix INTEGER NOT NULL DEFAULT 0,
  created_at_unix INTEGER NOT NULL,
  updated_at_unix INTEGER NOT NULL
);

CREATE TABLE podcast_episodes (
  podcast_itunes_id TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  enclosure_url TEXT NOT NULL,
  published_at_unix INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  image TEXT,
  episode_number INTEGER,
  season_number INTEGER,
  episode_type TEXT,
  explicit INTEGER,
  link TEXT,
  enclosure_length INTEGER,
  transcript_url TEXT,
  created_at_unix INTEGER NOT NULL,
  updated_at_unix INTEGER NOT NULL,
  PRIMARY KEY (podcast_itunes_id, episode_guid),
  FOREIGN KEY (podcast_itunes_id)
    REFERENCES podcast_shows(podcast_itunes_id)
    ON DELETE CASCADE
);

CREATE TABLE podcast_cache_state (
  podcast_itunes_id TEXT PRIMARY KEY,
  is_truncated INTEGER NOT NULL DEFAULT 0 CHECK (is_truncated IN (0, 1)),
  last_successful_fetch_at_unix INTEGER NOT NULL,
  last_attempted_fetch_at_unix INTEGER NOT NULL DEFAULT 0,
  refresh_not_before_unix INTEGER NOT NULL,
  fetch_fail_count INTEGER NOT NULL DEFAULT 0,
  last_error_class TEXT,
  approx_bytes INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  last_accessed_at_unix INTEGER NOT NULL,
  FOREIGN KEY (podcast_itunes_id)
    REFERENCES podcast_shows(podcast_itunes_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_podcast_cache_state_priority_last_accessed
ON podcast_cache_state (priority, last_accessed_at_unix, podcast_itunes_id);

CREATE INDEX idx_podcast_episodes_podcast_published_at
ON podcast_episodes (podcast_itunes_id, published_at_unix DESC, episode_guid);
