-- +goose Up
CREATE VIRTUAL TABLE podcast_shows_fts USING fts5(
  podcast_itunes_id UNINDEXED,
  title,
  author,
  description,
  categories,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE podcast_episodes_fts USING fts5(
  podcast_itunes_id UNINDEXED,
  episode_guid UNINDEXED,
  title,
  description,
  podcast_title,
  podcast_author,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE podcast_shows_fts_index (
  id INTEGER PRIMARY KEY,
  podcast_itunes_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (podcast_itunes_id)
    REFERENCES podcast_shows(podcast_itunes_id)
    ON DELETE CASCADE
);

CREATE TABLE podcast_episodes_fts_index (
  id INTEGER PRIMARY KEY,
  podcast_itunes_id TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  UNIQUE (podcast_itunes_id, episode_guid),
  FOREIGN KEY (podcast_itunes_id, episode_guid)
    REFERENCES podcast_episodes(podcast_itunes_id, episode_guid)
    ON DELETE CASCADE
);

-- +goose StatementBegin
CREATE TRIGGER podcast_shows_fts_ai AFTER INSERT ON podcast_shows BEGIN
  INSERT INTO podcast_shows_fts_index (podcast_itunes_id)
  SELECT new.podcast_itunes_id
  WHERE NOT EXISTS (
    SELECT 1 FROM podcast_shows_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
  );

  DELETE FROM podcast_shows_fts
  WHERE rowid = (
    SELECT id FROM podcast_shows_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
  );

  INSERT INTO podcast_shows_fts(rowid, podcast_itunes_id, title, author, description, categories)
  VALUES (
    (SELECT id FROM podcast_shows_fts_index WHERE podcast_itunes_id = new.podcast_itunes_id),
    new.podcast_itunes_id,
    new.title,
    COALESCE(new.author, ''),
    new.description,
    COALESCE((
      SELECT group_concat(CAST(value AS TEXT), ' ')
      FROM json_each(
        CASE
          WHEN json_valid(COALESCE(new.categories_json, '')) THEN
            CASE WHEN json_type(new.categories_json) = 'array' THEN new.categories_json ELSE '[]' END
          ELSE '[]'
        END
      )
      WHERE type = 'text'
    ), '')
  );
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER podcast_shows_fts_search_au
AFTER UPDATE OF title, author, description, categories_json ON podcast_shows
BEGIN
  INSERT INTO podcast_shows_fts_index (podcast_itunes_id)
  SELECT new.podcast_itunes_id
  WHERE NOT EXISTS (
    SELECT 1 FROM podcast_shows_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
  );

  DELETE FROM podcast_shows_fts
  WHERE rowid = (
    SELECT id FROM podcast_shows_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
  );

  INSERT INTO podcast_shows_fts(rowid, podcast_itunes_id, title, author, description, categories)
  VALUES (
    (SELECT id FROM podcast_shows_fts_index WHERE podcast_itunes_id = new.podcast_itunes_id),
    new.podcast_itunes_id,
    new.title,
    COALESCE(new.author, ''),
    new.description,
    COALESCE((
      SELECT group_concat(CAST(value AS TEXT), ' ')
      FROM json_each(
        CASE
          WHEN json_valid(COALESCE(new.categories_json, '')) THEN
            CASE WHEN json_type(new.categories_json) = 'array' THEN new.categories_json ELSE '[]' END
          ELSE '[]'
        END
      )
      WHERE type = 'text'
    ), '')
  );
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER podcast_shows_episode_fts_search_au
AFTER UPDATE OF title, author ON podcast_shows
BEGIN
  DELETE FROM podcast_episodes_fts
  WHERE rowid IN (
    SELECT id FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
  );

  INSERT INTO podcast_episodes_fts(
    rowid,
    podcast_itunes_id,
    episode_guid,
    title,
    description,
    podcast_title,
    podcast_author
  )
  SELECT
    idx.id,
    e.podcast_itunes_id,
    e.episode_guid,
    e.title,
    e.description,
    new.title,
    COALESCE(new.author, '')
  FROM podcast_episodes e
  JOIN podcast_episodes_fts_index idx
    ON idx.podcast_itunes_id = e.podcast_itunes_id
   AND idx.episode_guid = e.episode_guid
  WHERE e.podcast_itunes_id = new.podcast_itunes_id;
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER podcast_shows_fts_bd BEFORE DELETE ON podcast_shows BEGIN
  DELETE FROM podcast_episodes_fts
  WHERE rowid IN (
    SELECT id FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = old.podcast_itunes_id
  );

  DELETE FROM podcast_episodes_fts_index
  WHERE podcast_itunes_id = old.podcast_itunes_id;

  DELETE FROM podcast_shows_fts
  WHERE rowid = (
    SELECT id FROM podcast_shows_fts_index
    WHERE podcast_itunes_id = old.podcast_itunes_id
  );

  DELETE FROM podcast_shows_fts_index
  WHERE podcast_itunes_id = old.podcast_itunes_id;
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER podcast_episodes_fts_ai AFTER INSERT ON podcast_episodes BEGIN
  INSERT INTO podcast_episodes_fts_index (podcast_itunes_id, episode_guid)
  SELECT new.podcast_itunes_id, new.episode_guid
  WHERE NOT EXISTS (
    SELECT 1 FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
      AND episode_guid = new.episode_guid
  );

  DELETE FROM podcast_episodes_fts
  WHERE rowid = (
    SELECT id FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
      AND episode_guid = new.episode_guid
  );

  INSERT INTO podcast_episodes_fts(
    rowid,
    podcast_itunes_id,
    episode_guid,
    title,
    description,
    podcast_title,
    podcast_author
  )
  SELECT
    idx.id,
    new.podcast_itunes_id,
    new.episode_guid,
    new.title,
    new.description,
    show.title,
    COALESCE(show.author, '')
  FROM podcast_episodes_fts_index idx
  JOIN podcast_shows show
    ON show.podcast_itunes_id = new.podcast_itunes_id
  WHERE idx.podcast_itunes_id = new.podcast_itunes_id
    AND idx.episode_guid = new.episode_guid;
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER podcast_episodes_fts_au AFTER UPDATE ON podcast_episodes BEGIN
  DELETE FROM podcast_episodes_fts
  WHERE rowid = (
    SELECT id FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = old.podcast_itunes_id
      AND episode_guid = old.episode_guid
  );

  DELETE FROM podcast_episodes_fts_index
  WHERE podcast_itunes_id = old.podcast_itunes_id
    AND episode_guid = old.episode_guid
    AND (old.podcast_itunes_id != new.podcast_itunes_id OR old.episode_guid != new.episode_guid);

  INSERT INTO podcast_episodes_fts_index (podcast_itunes_id, episode_guid)
  SELECT new.podcast_itunes_id, new.episode_guid
  WHERE NOT EXISTS (
    SELECT 1 FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
      AND episode_guid = new.episode_guid
  );

  DELETE FROM podcast_episodes_fts
  WHERE rowid = (
    SELECT id FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = new.podcast_itunes_id
      AND episode_guid = new.episode_guid
  );

  INSERT INTO podcast_episodes_fts(
    rowid,
    podcast_itunes_id,
    episode_guid,
    title,
    description,
    podcast_title,
    podcast_author
  )
  SELECT
    idx.id,
    new.podcast_itunes_id,
    new.episode_guid,
    new.title,
    new.description,
    show.title,
    COALESCE(show.author, '')
  FROM podcast_episodes_fts_index idx
  JOIN podcast_shows show
    ON show.podcast_itunes_id = new.podcast_itunes_id
  WHERE idx.podcast_itunes_id = new.podcast_itunes_id
    AND idx.episode_guid = new.episode_guid;
END;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER podcast_episodes_fts_bd BEFORE DELETE ON podcast_episodes BEGIN
  DELETE FROM podcast_episodes_fts
  WHERE rowid = (
    SELECT id FROM podcast_episodes_fts_index
    WHERE podcast_itunes_id = old.podcast_itunes_id
      AND episode_guid = old.episode_guid
  );

  DELETE FROM podcast_episodes_fts_index
  WHERE podcast_itunes_id = old.podcast_itunes_id
    AND episode_guid = old.episode_guid;
END;
-- +goose StatementEnd

INSERT OR IGNORE INTO podcast_shows_fts_index (podcast_itunes_id)
SELECT podcast_itunes_id
FROM podcast_shows;

INSERT INTO podcast_shows_fts(rowid, podcast_itunes_id, title, author, description, categories)
SELECT
  idx.id,
  p.podcast_itunes_id,
  p.title,
  COALESCE(p.author, ''),
  p.description,
  COALESCE((
    SELECT group_concat(CAST(value AS TEXT), ' ')
    FROM json_each(
      CASE
        WHEN json_valid(COALESCE(p.categories_json, '')) THEN
          CASE WHEN json_type(p.categories_json) = 'array' THEN p.categories_json ELSE '[]' END
        ELSE '[]'
      END
    )
    WHERE type = 'text'
  ), '')
FROM podcast_shows p
JOIN podcast_shows_fts_index idx
  ON idx.podcast_itunes_id = p.podcast_itunes_id;

INSERT OR IGNORE INTO podcast_episodes_fts_index (podcast_itunes_id, episode_guid)
SELECT podcast_itunes_id, episode_guid
FROM podcast_episodes;

INSERT INTO podcast_episodes_fts(
  rowid,
  podcast_itunes_id,
  episode_guid,
  title,
  description,
  podcast_title,
  podcast_author
)
SELECT
  idx.id,
  e.podcast_itunes_id,
  e.episode_guid,
  e.title,
  e.description,
  p.title,
  COALESCE(p.author, '')
FROM podcast_episodes e
JOIN podcast_episodes_fts_index idx
  ON idx.podcast_itunes_id = e.podcast_itunes_id
 AND idx.episode_guid = e.episode_guid
JOIN podcast_shows p
  ON p.podcast_itunes_id = e.podcast_itunes_id;

-- +goose Down
DROP TRIGGER podcast_episodes_fts_bd;
DROP TRIGGER podcast_episodes_fts_au;
DROP TRIGGER podcast_episodes_fts_ai;
DROP TRIGGER podcast_shows_fts_bd;
DROP TRIGGER podcast_shows_episode_fts_search_au;
DROP TRIGGER podcast_shows_fts_search_au;
DROP TRIGGER podcast_shows_fts_ai;
DROP TABLE podcast_episodes_fts_index;
DROP TABLE podcast_shows_fts_index;
DROP TABLE podcast_episodes_fts;
DROP TABLE podcast_shows_fts;
