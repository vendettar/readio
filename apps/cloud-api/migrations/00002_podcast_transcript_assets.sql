-- +goose Up
CREATE TABLE podcast_transcript_assets (
  transcript_key TEXT PRIMARY KEY,
  itunes_id TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  episode_title TEXT,
  source_kind TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  audio_source_fingerprint TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_podcast_transcript_assets_episode
ON podcast_transcript_assets (itunes_id, episode_key);

CREATE INDEX idx_podcast_transcript_assets_reuse_lookup
ON podcast_transcript_assets (
  itunes_id,
  episode_key,
  source_kind,
  provider,
  model,
  audio_source_fingerprint
);

-- +goose Down
DROP INDEX idx_podcast_transcript_assets_reuse_lookup;
DROP INDEX idx_podcast_transcript_assets_episode;
DROP TABLE podcast_transcript_assets;
