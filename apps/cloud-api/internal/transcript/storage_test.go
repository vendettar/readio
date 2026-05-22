package transcript

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
	"readio-cloud/internal/asr"
)

func TestResolvePodcastTranscriptRootRequiresExplicitAbsoluteDirectory(t *testing.T) {
	t.Setenv(podcastTranscriptRootEnv, "")
	_, err := resolvePodcastTranscriptRoot()
	require.NotNil(t, err)

	t.Setenv(podcastTranscriptRootEnv, "relative/path")
	_, err = resolvePodcastTranscriptRoot()
	require.NotNil(t, err)

	root := t.TempDir()
	t.Setenv(podcastTranscriptRootEnv, root)
	got, err := resolvePodcastTranscriptRoot()
	require.NoError(t, err)
	require.Equal(t, root, got)
}

func TestDerivePodcastTranscriptEpisodeKeyMatchesNormalizedIdentityVectors(t *testing.T) {
	t.Run("uuid-shaped identity trims and lowercases before hashing", func(t *testing.T) {
		episodeKey, err := derivePodcastTranscriptEpisodeKey("cd068fd1-8d6c-41ed-aacc-9abf882e1cf3")
		require.NoError(t, err)
		require.Equal(t, "ep_d9933735fed5", episodeKey)

		upperEpisodeKey, err := derivePodcastTranscriptEpisodeKey(" CD068FD1-8D6C-41ED-AACC-9ABF882E1CF3 ")
		require.NoError(t, err)
		require.Equal(t, episodeKey, upperEpisodeKey)
	})

	t.Run("generic identity trims and lowercases before hashing", func(t *testing.T) {
		episodeKey, err := derivePodcastTranscriptEpisodeKey("abc123-def456")
		require.NoError(t, err)
		require.Equal(t, "ep_ef65bd7806ca", episodeKey)

		trimmedEpisodeKey, err := derivePodcastTranscriptEpisodeKey("  abc123-def456  ")
		require.NoError(t, err)
		require.Equal(t, episodeKey, trimmedEpisodeKey)

		upperEpisodeKey, err := derivePodcastTranscriptEpisodeKey("ABC123-DEF456")
		require.NoError(t, err)
		require.Equal(t, episodeKey, upperEpisodeKey)
	})
}

func TestBuildPodcastTranscriptFileNameTruncatesUnicodeSafely(t *testing.T) {
	fileName := buildPodcastTranscriptFileName("tr_01JT7J4X2R8WQ8N34V5Y1A2BCD", " 你好 / Bear Brook: Episode №1 / transcript ")
	if !strings.HasPrefix(fileName, "tr_01JT7J4X2R8WQ8N34V5Y1A2BCD-") {
		t.Fatalf("fileName = %q, want transcript key prefix", fileName)
	}
	if !strings.HasSuffix(fileName, ".json.gz") {
		t.Fatalf("fileName = %q, want .json.gz suffix", fileName)
	}

	slug := strings.TrimSuffix(strings.TrimPrefix(fileName, "tr_01JT7J4X2R8WQ8N34V5Y1A2BCD-"), ".json.gz")
	if len([]byte(slug)) > podcastTranscriptMaxSlugBytes {
		t.Fatalf("slug bytes = %d, want <= %d", len([]byte(slug)), podcastTranscriptMaxSlugBytes)
	}
	require.NotContains(t, slug, "/")
}

func TestBuildPodcastTranscriptAssetPathUsesStoredFileName(t *testing.T) {
	root := t.TempDir()
	filePath, err := buildPodcastTranscriptAssetPath(root, "1539020158", "ep_8f24a6f1d2aa", "tr_01-test.json.gz")
	require.NoError(t, err)

	want := filepath.Join(root, "1539020158", "ep_8f24a6f1d2aa", "tr_01-test.json.gz")
	require.Equal(t, want, filePath)
}

func TestPodcastTranscriptAssetsDisabledByDefaultDoesNotRequireTable(t *testing.T) {
	db, err := openTranscriptSQLite(context.Background(), filepath.Join(t.TempDir(), "cloud.db"))
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})

	root := t.TempDir()
	_, err = storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "disabled",
		SourceKind:   podcastTranscriptSourceKindUpload,
		Payload:      firstPayloadFixture(60),
	})
	if !errors.Is(err, errPodcastTranscriptAssetsDisabled) {
		t.Fatalf("store disabled error = %v, want errPodcastTranscriptAssetsDisabled", err)
	}

	matches, err := listReusablePodcastTranscriptAssets(context.Background(), db, reusablePodcastTranscriptLookup{
		ItunesID:    "1539020158",
		EpisodeGUID: "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		SourceKind:  podcastTranscriptSourceKindUpload,
	})
	require.NoError(t, err)
	require.Len(t, matches, 0)

	_, _, err = loadPodcastTranscriptAssetByKey(context.Background(), db, root, "tr_missing")
	if !errors.Is(err, errPodcastTranscriptAssetsDisabled) {
		t.Fatalf("load disabled error = %v, want errPodcastTranscriptAssetsDisabled", err)
	}
}

func TestStorePodcastTranscriptAssetPersistsAndRoundTripsCanonicalPayload(t *testing.T) {
	withPodcastTranscriptAssetsEnabled(t)
	db, root := openTranscriptStorageTestDB(t)

	duration := 7200.5
	confidence := 0.87
	now := time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC)

	first, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook / 回声 Episode 1",
		SourceKind:   podcastTranscriptSourceKindBuiltinASR,
		Provider:     "cloudflare",
		Model:        "@cf/openai/whisper-large-v3-turbo",
		EnclosureURL: " HTTPS://EXAMPLE.com/audio.mp3?x=1#fragment ",
		Payload: asr.ASRRelayResponsePayload{
			Cues: []asr.ASRRelayCue{
				{
					Start:     0,
					End:       2.4,
					Text:      "example",
					Words:     []asr.ASRRelayWord{{Word: "example", Start: 0, End: 2.4, Confidence: &confidence}},
					SpeakerID: "speaker-a",
				},
			},
			Language:        "en",
			DurationSeconds: &duration,
			Provider:        "cloudflare",
			Model:           "@cf/openai/whisper-large-v3-turbo",
		},
		Now: now,
	})
	require.NoError(t, err)

	require.Equal(t, "ep_d9933735fed5", first.EpisodeKey)
	require.Equal(t, "sha256:acc06e0e036c639b3891b901", first.AudioSourceFingerprint)

	stored, payload, err := loadPodcastTranscriptAssetByKey(context.Background(), db, root, first.TranscriptKey)
	require.NoError(t, err)
	require.Equal(t, first.FileName, stored.FileName)
	require.Equal(t, first.EpisodeTitle, stored.EpisodeTitle)
	require.Equal(t, "cloudflare", payload.Provider)
	require.Equal(t, "@cf/openai/whisper-large-v3-turbo", payload.Model)
	require.NotNil(t, payload.DurationSeconds)
	require.Equal(t, duration, *payload.DurationSeconds)
	require.Len(t, payload.Cues, 1)
	require.Equal(t, "speaker-a", payload.Cues[0].SpeakerID)
	require.Len(t, payload.Cues[0].Words, 1)
	require.NotNil(t, payload.Cues[0].Words[0].Confidence)
	require.Equal(t, confidence, *payload.Cues[0].Words[0].Confidence)

}

func TestReusablePodcastTranscriptLookupKeepsDuplicateClassifierMatches(t *testing.T) {
	withPodcastTranscriptAssetsEnabled(t)
	db, root := openTranscriptStorageTestDB(t)

	now := time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC)
	first, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook",
		SourceKind:   podcastTranscriptSourceKindBuiltinASR,
		Provider:     "cloudflare",
		Model:        "@cf/openai/whisper-large-v3-turbo",
		EnclosureURL: "https://example.com/audio.mp3?x=1",
		Payload:      firstPayloadFixture(60),
		Now:          now,
	})
	require.NoError(t, err)

	second, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook",
		SourceKind:   podcastTranscriptSourceKindBuiltinASR,
		Provider:     "cloudflare",
		Model:        "@cf/openai/whisper-large-v3-turbo",
		EnclosureURL: "https://example.com/audio.mp3?x=1#ignored-fragment",
		Payload:      firstPayloadFixture(60),
		Now:          now.Add(time.Millisecond),
	})
	require.NoError(t, err)

	matches, err := listReusablePodcastTranscriptAssets(context.Background(), db, reusablePodcastTranscriptLookup{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		SourceKind:   podcastTranscriptSourceKindBuiltinASR,
		Provider:     "cloudflare",
		Model:        "@cf/openai/whisper-large-v3-turbo",
		EnclosureURL: "https://example.com/audio.mp3?x=1",
	})
	require.NoError(t, err)
	require.Len(t, matches, 2)
	require.Equal(t, first.TranscriptKey, matches[0].TranscriptKey)
	require.Equal(t, second.TranscriptKey, matches[1].TranscriptKey)
}

func TestReusablePodcastTranscriptLookupMatchesStoredAssetAcrossSharedNormalizationPath(t *testing.T) {
	withPodcastTranscriptAssetsEnabled(t)
	db, root := openTranscriptStorageTestDB(t)

	asset, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     " 1539020158 ",
		EpisodeGUID:  " CD068FD1-8D6C-41ED-AACC-9ABF882E1CF3 ",
		EpisodeTitle: "Bear Brook",
		SourceKind:   "  " + podcastTranscriptSourceKindBuiltinASR + "  ",
		Provider:     " cloudflare ",
		Model:        " @cf/openai/whisper-large-v3-turbo ",
		EnclosureURL: " HTTPS://EXAMPLE.com/audio.mp3?x=1#fragment ",
		Payload:      firstPayloadFixture(60),
		Now:          time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	matches, err := listReusablePodcastTranscriptAssets(context.Background(), db, reusablePodcastTranscriptLookup{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		SourceKind:   podcastTranscriptSourceKindBuiltinASR,
		Provider:     "cloudflare",
		Model:        "@cf/openai/whisper-large-v3-turbo",
		EnclosureURL: "https://example.com/audio.mp3?x=1",
	})
	require.NoError(t, err)
	require.Len(t, matches, 1)
	require.Equal(t, asset.TranscriptKey, matches[0].TranscriptKey)
	require.Equal(t, "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3", matches[0].EpisodeGUID)
	require.Equal(t, "sha256:acc06e0e036c639b3891b901", matches[0].AudioSourceFingerprint)
}

func TestStorePodcastTranscriptAssetRejectsMissingCanonicalIdentity(t *testing.T) {
	withPodcastTranscriptAssetsEnabled(t)
	db, root := openTranscriptStorageTestDB(t)

	_, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "",
		EpisodeGUID:  "episode-guid",
		SourceKind:   podcastTranscriptSourceKindUpload,
		EpisodeTitle: "manual",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "itunes_id")

	_, err = storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "  ",
		SourceKind:   podcastTranscriptSourceKindUpload,
		EpisodeTitle: "manual",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "episode_guid")
}

func TestPodcastTranscriptAssetSchemaAllowsOpaqueSourceKindWithoutBusinessChecks(t *testing.T) {
	db, _ := openTranscriptStorageTestDB(t)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO podcast_transcript_assets (
			transcript_key,
			itunes_id,
			episode_key,
			episode_guid,
			source_kind,
			provider,
			model,
			audio_source_fingerprint,
			file_name,
			file_size_bytes,
			created_at_unix
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"tr_invalid",
		"1539020158",
		"ep_2df5d1b10f74",
		"cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		"custom_source_kind",
		"cloudflare",
		"custom-model",
		"sha256:1234567890abcdef12345678",
		"tr_custom.json.gz",
		42,
		time.Now().UTC().Unix(),
	)
	require.NoError(t, err)
}

func TestPodcastTranscriptAssetSchemaAllowsZeroFileSize(t *testing.T) {
	db, _ := openTranscriptStorageTestDB(t)

	_, err := db.ExecContext(
		context.Background(),
		`INSERT INTO podcast_transcript_assets (
			transcript_key,
			itunes_id,
			episode_key,
			episode_guid,
			source_kind,
			provider,
			model,
			audio_source_fingerprint,
			file_name,
			file_size_bytes,
			created_at_unix
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"tr_invalid2",
		"1539020158",
		"ep_2df5d1b10f74",
		"cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		"custom_source_kind",
		"cloudflare",
		"custom-model",
		"sha256:1234567890abcdef12345678",
		"tr_zero-size.json.gz",
		0,
		time.Now().UTC().Unix(),
	)
	require.NoError(t, err)
}

func TestPodcastTranscriptAssetsMigrationCreatesReuseLookupIndex(t *testing.T) {
	db, _ := openTranscriptStorageTestDB(t)

	var tableCount int
	if err := db.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'podcast_transcript_assets';`,
	).Scan(&tableCount); err != nil {
		t.Fatalf("query podcast_transcript_assets table: %v", err)
	}
	require.Equal(t, 1, tableCount)

	rows, err := db.QueryContext(context.Background(), `PRAGMA index_list('podcast_transcript_assets');`)
	require.NoError(t, err)
	defer rows.Close()

	var foundReuseIndex bool
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		err = rows.Scan(&seq, &name, &unique, &origin, &partial)
		require.NoError(t, err)
		if name == "idx_podcast_transcript_assets_reuse_lookup" {
			foundReuseIndex = true
			require.Equal(t, 0, unique)
		}
	}
	err = rows.Err()
	require.NoError(t, err)
	require.True(t, foundReuseIndex)
}

func TestLoadPodcastTranscriptAssetTreatsMissingFileAsInvalid(t *testing.T) {
	withPodcastTranscriptAssetsEnabled(t)
	db, root := openTranscriptStorageTestDB(t)

	asset, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook",
		SourceKind:   podcastTranscriptSourceKindUpload,
		Payload:      firstPayloadFixture(60),
		Now:          time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	path, err := buildPodcastTranscriptAssetPath(root, asset.ItunesID, asset.EpisodeKey, asset.FileName)
	require.NoError(t, err)
	err = os.Remove(path)
	require.NoError(t, err)

	if _, _, err := loadPodcastTranscriptAssetByKey(context.Background(), db, root, asset.TranscriptKey); err == nil {
		t.Fatal("loadPodcastTranscriptAssetByKey unexpectedly succeeded after file removal")
	} else if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("loadPodcastTranscriptAssetByKey error = %v, want os.ErrNotExist", err)
	}
}

func TestLoadPodcastTranscriptAssetDoesNotRequireExactTitleSlugEquality(t *testing.T) {
	withPodcastTranscriptAssetsEnabled(t)
	db, root := openTranscriptStorageTestDB(t)

	asset, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook",
		SourceKind:   podcastTranscriptSourceKindUpload,
		Payload:      firstPayloadFixture(60),
		Now:          time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	if _, err := db.ExecContext(
		context.Background(),
		`UPDATE podcast_transcript_assets SET episode_title = ? WHERE transcript_key = ?`,
		"Completely Different Title",
		asset.TranscriptKey,
	); err != nil {
		t.Fatalf("update episode_title: %v", err)
	}

	stored, payload, err := loadPodcastTranscriptAssetByKey(context.Background(), db, root, asset.TranscriptKey)
	require.NoError(t, err)
	require.Equal(t, "Completely Different Title", stored.EpisodeTitle)
	require.Equal(t, "cloudflare", payload.Provider)
}

func openTranscriptStorageTestDB(t *testing.T) (*sql.DB, string) {
	t.Helper()

	root := t.TempDir()
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := openTranscriptSQLite(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})

	tableDDL := `CREATE TABLE podcast_transcript_assets (
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
	    created_at_unix INTEGER NOT NULL
);`

	indexDDL := `CREATE INDEX idx_podcast_transcript_assets_reuse_lookup ON podcast_transcript_assets (itunes_id, episode_key);`

	_, err = db.ExecContext(context.Background(), tableDDL)
	require.NoError(t, err)

	_, err = db.ExecContext(context.Background(), indexDDL)
	require.NoError(t, err)

	return db, root
}

func openTranscriptSQLite(ctx context.Context, dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", buildTranscriptSQLiteDSN(dbPath))
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}
	db.SetMaxIdleConns(1)
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode=WAL"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("initialize sqlite WAL mode: %w", err)
	}
	return db, nil
}

func buildTranscriptSQLiteDSN(dbPath string) string {
	query := url.Values{}
	query.Add("_pragma", "foreign_keys(1)")
	query.Add("_pragma", "busy_timeout(5000)")
	query.Add("_pragma", "synchronous(NORMAL)")
	return (&url.URL{
		Scheme:   "file",
		Path:     filepath.ToSlash(dbPath),
		RawQuery: query.Encode(),
	}).String()
}

func withPodcastTranscriptAssetsEnabled(t *testing.T) {
	t.Helper()

	previous := podcastTranscriptAssetsEnabled
	podcastTranscriptAssetsEnabled = true
	t.Cleanup(func() {
		podcastTranscriptAssetsEnabled = previous
	})
}

func firstPayloadFixture(duration float64) asr.ASRRelayResponsePayload {
	return asr.ASRRelayResponsePayload{
		Cues:            []asr.ASRRelayCue{{Start: 0, End: 2.4, Text: "example"}},
		Language:        "en",
		DurationSeconds: &duration,
		Provider:        "cloudflare",
		Model:           "@cf/openai/whisper-large-v3-turbo",
	}
}
