package main

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestResolvePodcastTranscriptRootRequiresExplicitAbsoluteDirectory(t *testing.T) {
	t.Setenv(podcastTranscriptRootEnv, "")
	if _, err := resolvePodcastTranscriptRoot(); err == nil {
		t.Fatal("resolvePodcastTranscriptRoot unexpectedly succeeded without env")
	}

	t.Setenv(podcastTranscriptRootEnv, "relative/path")
	if _, err := resolvePodcastTranscriptRoot(); err == nil {
		t.Fatal("resolvePodcastTranscriptRoot unexpectedly succeeded with relative path")
	}

	root := t.TempDir()
	t.Setenv(podcastTranscriptRootEnv, root)
	got, err := resolvePodcastTranscriptRoot()
	if err != nil {
		t.Fatalf("resolvePodcastTranscriptRoot: %v", err)
	}
	if got != root {
		t.Fatalf("root = %q, want %q", got, root)
	}
}

func TestDerivePodcastTranscriptEpisodeKeyMatchesNormalizedIdentityVectors(t *testing.T) {
	t.Run("uuid-shaped identity trims and lowercases before hashing", func(t *testing.T) {
		episodeKey, err := derivePodcastTranscriptEpisodeKey("cd068fd1-8d6c-41ed-aacc-9abf882e1cf3")
		if err != nil {
			t.Fatalf("derivePodcastTranscriptEpisodeKey: %v", err)
		}
		if episodeKey != "ep_d9933735fed5" {
			t.Fatalf("episodeKey = %q, want %q", episodeKey, "ep_d9933735fed5")
		}

		upperEpisodeKey, err := derivePodcastTranscriptEpisodeKey(" CD068FD1-8D6C-41ED-AACC-9ABF882E1CF3 ")
		if err != nil {
			t.Fatalf("derivePodcastTranscriptEpisodeKey uppercase: %v", err)
		}
		if upperEpisodeKey != episodeKey {
			t.Fatalf("upperEpisodeKey = %q, want %q", upperEpisodeKey, episodeKey)
		}
	})

	t.Run("generic identity trims and lowercases before hashing", func(t *testing.T) {
		episodeKey, err := derivePodcastTranscriptEpisodeKey("abc123-def456")
		if err != nil {
			t.Fatalf("derivePodcastTranscriptEpisodeKey: %v", err)
		}
		if episodeKey != "ep_ef65bd7806ca" {
			t.Fatalf("episodeKey = %q, want %q", episodeKey, "ep_ef65bd7806ca")
		}

		trimmedEpisodeKey, err := derivePodcastTranscriptEpisodeKey("  abc123-def456  ")
		if err != nil {
			t.Fatalf("derivePodcastTranscriptEpisodeKey trimmed: %v", err)
		}
		if trimmedEpisodeKey != episodeKey {
			t.Fatalf("trimmedEpisodeKey = %q, want %q", trimmedEpisodeKey, episodeKey)
		}

		upperEpisodeKey, err := derivePodcastTranscriptEpisodeKey("ABC123-DEF456")
		if err != nil {
			t.Fatalf("derivePodcastTranscriptEpisodeKey uppercase generic: %v", err)
		}
		if upperEpisodeKey != episodeKey {
			t.Fatalf("upperEpisodeKey = %q, want %q", upperEpisodeKey, episodeKey)
		}
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
	if strings.Contains(slug, "/") {
		t.Fatalf("slug = %q, contains path separator", slug)
	}
}

func TestBuildPodcastTranscriptAssetPathUsesStoredFileName(t *testing.T) {
	root := t.TempDir()
	filePath, err := buildPodcastTranscriptAssetPath(root, "1539020158", "ep_8f24a6f1d2aa", "tr_01-test.json.gz")
	if err != nil {
		t.Fatalf("buildPodcastTranscriptAssetPath: %v", err)
	}

	want := filepath.Join(root, "1539020158", "ep_8f24a6f1d2aa", "tr_01-test.json.gz")
	if filePath != want {
		t.Fatalf("filePath = %q, want %q", filePath, want)
	}
}

func TestStorePodcastTranscriptAssetPersistsAndRoundTripsCanonicalPayload(t *testing.T) {
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
		Payload: asrRelayResponsePayload{
			Cues: []asrRelayCue{
				{
					Start:     0,
					End:       2.4,
					Text:      "example",
					Words:     []asrRelayWord{{Word: "example", Start: 0, End: 2.4, Confidence: &confidence}},
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
	if err != nil {
		t.Fatalf("store first transcript asset: %v", err)
	}

	if first.EpisodeKey != "ep_d9933735fed5" {
		t.Fatalf("episodeKey = %q, want %q", first.EpisodeKey, "ep_d9933735fed5")
	}
	if first.AudioSourceFingerprint != "sha256:acc06e0e036c639b3891b901" {
		t.Fatalf("audioSourceFingerprint = %q, want %q", first.AudioSourceFingerprint, "sha256:acc06e0e036c639b3891b901")
	}

	stored, payload, err := loadPodcastTranscriptAssetByKey(context.Background(), db, root, first.TranscriptKey)
	if err != nil {
		t.Fatalf("loadPodcastTranscriptAssetByKey: %v", err)
	}
	if stored.FileName != first.FileName {
		t.Fatalf("stored file_name = %q, want %q", stored.FileName, first.FileName)
	}
	if stored.EpisodeTitle != first.EpisodeTitle {
		t.Fatalf("stored episode_title = %q, want %q", stored.EpisodeTitle, first.EpisodeTitle)
	}
	if payload.Provider != "cloudflare" || payload.Model != "@cf/openai/whisper-large-v3-turbo" {
		t.Fatalf("payload provider/model = %q/%q", payload.Provider, payload.Model)
	}
	if payload.DurationSeconds == nil || *payload.DurationSeconds != duration {
		t.Fatalf("payload durationSeconds = %#v, want %#v", payload.DurationSeconds, duration)
	}
	if len(payload.Cues) != 1 || payload.Cues[0].SpeakerID != "speaker-a" {
		t.Fatalf("payload cues = %#v", payload.Cues)
	}
	if len(payload.Cues[0].Words) != 1 || payload.Cues[0].Words[0].Confidence == nil || *payload.Cues[0].Words[0].Confidence != confidence {
		t.Fatalf("payload cue words = %#v", payload.Cues[0].Words)
	}

}

func TestReusablePodcastTranscriptLookupKeepsDuplicateClassifierMatches(t *testing.T) {
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
	if err != nil {
		t.Fatalf("store first transcript asset: %v", err)
	}

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
	if err != nil {
		t.Fatalf("store second transcript asset: %v", err)
	}

	matches, err := listReusablePodcastTranscriptAssets(context.Background(), db, reusablePodcastTranscriptLookup{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		SourceKind:   podcastTranscriptSourceKindBuiltinASR,
		Provider:     "cloudflare",
		Model:        "@cf/openai/whisper-large-v3-turbo",
		EnclosureURL: "https://example.com/audio.mp3?x=1",
	})
	if err != nil {
		t.Fatalf("listReusablePodcastTranscriptAssets: %v", err)
	}
	if len(matches) != 2 {
		t.Fatalf("match count = %d, want 2", len(matches))
	}
	if matches[0].TranscriptKey != first.TranscriptKey {
		t.Fatalf("first match transcript_key = %q, want %q", matches[0].TranscriptKey, first.TranscriptKey)
	}
	if matches[1].TranscriptKey != second.TranscriptKey {
		t.Fatalf("second match transcript_key = %q, want %q", matches[1].TranscriptKey, second.TranscriptKey)
	}
}

func TestStorePodcastTranscriptAssetRejectsMissingCanonicalIdentity(t *testing.T) {
	db, root := openTranscriptStorageTestDB(t)

	_, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "",
		EpisodeGUID:  "episode-guid",
		SourceKind:   podcastTranscriptSourceKindUpload,
		EpisodeTitle: "manual",
	})
	if err == nil || !strings.Contains(err.Error(), "itunes_id") {
		t.Fatalf("missing itunes_id error = %v, want mention of itunes_id", err)
	}

	_, err = storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "  ",
		SourceKind:   podcastTranscriptSourceKindUpload,
		EpisodeTitle: "manual",
	})
	if err == nil || !strings.Contains(err.Error(), "episode_guid") {
		t.Fatalf("missing episode_guid error = %v, want mention of episode_guid", err)
	}
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
			created_at
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
		time.Now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("opaque source_kind insert unexpectedly failed: %v", err)
	}
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
			created_at
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
		time.Now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		t.Fatalf("zero file_size_bytes insert unexpectedly failed: %v", err)
	}
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
	if tableCount != 1 {
		t.Fatalf("podcast_transcript_assets table count = %d, want 1", tableCount)
	}

	rows, err := db.QueryContext(context.Background(), `PRAGMA index_list('podcast_transcript_assets');`)
	if err != nil {
		t.Fatalf("query index_list: %v", err)
	}
	defer rows.Close()

	var foundReuseIndex bool
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			t.Fatalf("scan index_list: %v", err)
		}
		if name == "idx_podcast_transcript_assets_reuse_lookup" {
			foundReuseIndex = true
			if unique != 0 {
				t.Fatalf("reuse lookup index unique = %d, want 0", unique)
			}
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate index_list: %v", err)
	}
	if !foundReuseIndex {
		t.Fatal("reuse lookup index not found")
	}
}

func TestLoadPodcastTranscriptAssetTreatsMissingFileAsInvalid(t *testing.T) {
	db, root := openTranscriptStorageTestDB(t)

	asset, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook",
		SourceKind:   podcastTranscriptSourceKindUpload,
		Payload:      firstPayloadFixture(60),
		Now:          time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("storePodcastTranscriptAsset: %v", err)
	}

	path, err := buildPodcastTranscriptAssetPath(root, asset.ItunesID, asset.EpisodeKey, asset.FileName)
	if err != nil {
		t.Fatalf("buildPodcastTranscriptAssetPath: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove transcript asset file: %v", err)
	}

	if _, _, err := loadPodcastTranscriptAssetByKey(context.Background(), db, root, asset.TranscriptKey); err == nil {
		t.Fatal("loadPodcastTranscriptAssetByKey unexpectedly succeeded after file removal")
	} else if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("loadPodcastTranscriptAssetByKey error = %v, want os.ErrNotExist", err)
	}
}

func TestLoadPodcastTranscriptAssetDoesNotRequireExactTitleSlugEquality(t *testing.T) {
	db, root := openTranscriptStorageTestDB(t)

	asset, err := storePodcastTranscriptAsset(context.Background(), db, root, createPodcastTranscriptAssetInput{
		ItunesID:     "1539020158",
		EpisodeGUID:  "cd068fd1-8d6c-41ed-aacc-9abf882e1cf3",
		EpisodeTitle: "Bear Brook",
		SourceKind:   podcastTranscriptSourceKindUpload,
		Payload:      firstPayloadFixture(60),
		Now:          time.Date(2026, 4, 30, 8, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("storePodcastTranscriptAsset: %v", err)
	}

	if _, err := db.ExecContext(
		context.Background(),
		`UPDATE podcast_transcript_assets SET episode_title = ? WHERE transcript_key = ?`,
		"Completely Different Title",
		asset.TranscriptKey,
	); err != nil {
		t.Fatalf("update episode_title: %v", err)
	}

	stored, payload, err := loadPodcastTranscriptAssetByKey(context.Background(), db, root, asset.TranscriptKey)
	if err != nil {
		t.Fatalf("loadPodcastTranscriptAssetByKey: %v", err)
	}
	if stored.EpisodeTitle != "Completely Different Title" {
		t.Fatalf("stored episode_title = %q, want %q", stored.EpisodeTitle, "Completely Different Title")
	}
	if payload.Provider != "cloudflare" {
		t.Fatalf("payload provider = %q, want %q", payload.Provider, "cloudflare")
	}
}

func openTranscriptStorageTestDB(t *testing.T) (*sql.DB, string) {
	t.Helper()

	root := t.TempDir()
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := openCloudSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("openCloudSQLite: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
	return db, root
}

func firstPayloadFixture(duration float64) asrRelayResponsePayload {
	return asrRelayResponsePayload{
		Cues:            []asrRelayCue{{Start: 0, End: 2.4, Text: "example"}},
		Language:        "en",
		DurationSeconds: &duration,
		Provider:        "cloudflare",
		Model:           "@cf/openai/whisper-large-v3-turbo",
	}
}
