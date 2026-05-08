package main

import (
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const podcastTranscriptRootEnv = "PODCASR_TRANSCRIPTS_DIR"
const podcastTranscriptKeyPrefix = "tr_"
const podcastTranscriptEpisodeKeyPrefix = "ep_"
const podcastTranscriptFileSuffix = ".json.gz"
const podcastTranscriptFallbackSlug = "transcript"
const podcastTranscriptMaxSlugBytes = 30
const podcastTranscriptFingerprintPrefix = "sha256:"
const podcastTranscriptFingerprintHexChars = 24
const podcastTranscriptEpisodeKeyHashHexChars = 12
const podcastTranscriptULIDEncodedChars = 26

const podcastTranscriptSourceKindBuiltinASR = "builtin_asr"
const podcastTranscriptSourceKindBYOKASR = "byok_asr"
const podcastTranscriptSourceKindUpload = "upload"

var (
	podcastTranscriptULIDRadix = big.NewInt(32)
)

type podcastTranscriptAsset struct {
	TranscriptKey          string
	ItunesID               string
	EpisodeKey             string
	EpisodeGUID            string
	EpisodeTitle           string
	SourceKind             string
	Provider               string
	Model                  string
	AudioSourceFingerprint string
	FileName               string
	FileSizeBytes          int64
	CreatedAt              string
}

type createPodcastTranscriptAssetInput struct {
	ItunesID     string
	EpisodeGUID  string
	EpisodeTitle string
	SourceKind   string
	Provider     string
	Model        string
	EnclosureURL string
	Payload      asrRelayResponsePayload
	Now          time.Time
}

type reusablePodcastTranscriptLookup struct {
	ItunesID     string
	EpisodeGUID  string
	SourceKind   string
	Provider     string
	Model        string
	EnclosureURL string
}

func resolvePodcastTranscriptRoot() (string, error) {
	root := strings.TrimSpace(os.Getenv(podcastTranscriptRootEnv))
	if root == "" {
		return "", fmt.Errorf("%s is required", podcastTranscriptRootEnv)
	}
	if !filepath.IsAbs(root) {
		return "", fmt.Errorf("%s must be an absolute path", podcastTranscriptRootEnv)
	}
	if err := validatePodcastTranscriptRoot(root); err != nil {
		return "", err
	}
	return filepath.Clean(root), nil
}

func validatePodcastTranscriptRoot(root string) error {
	info, err := os.Stat(root)
	if err != nil {
		return fmt.Errorf("stat transcript root %q: %w", root, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("transcript root %q is not a directory", root)
	}
	return nil
}

func storePodcastTranscriptAsset(
	ctx context.Context,
	db *sql.DB,
	transcriptRoot string,
	input createPodcastTranscriptAssetInput,
) (*podcastTranscriptAsset, error) {
	if err := validatePodcastTranscriptRoot(transcriptRoot); err != nil {
		return nil, err
	}

	itunesID := strings.TrimSpace(input.ItunesID)
	if itunesID == "" {
		return nil, errors.New("itunes_id is required for shared transcript assets")
	}

	episodeGUID := normalizeEpisodeIdentity(input.EpisodeGUID)
	if episodeGUID == "" {
		return nil, errors.New("episode_guid is required for shared transcript assets")
	}

	episodeKey, err := derivePodcastTranscriptEpisodeKey(episodeGUID)
	if err != nil {
		return nil, err
	}

	sourceKind, err := normalizePodcastTranscriptSourceKind(input.SourceKind)
	if err != nil {
		return nil, err
	}

	metadata, err := normalizePodcastTranscriptMetadata(input.Provider, input.Model, input.EnclosureURL)
	if err != nil {
		return nil, err
	}

	now := input.Now.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
	}

	transcriptKey, err := newPodcastTranscriptKey(now, rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate transcript key: %w", err)
	}

	fileName := buildPodcastTranscriptFileName(transcriptKey, input.EpisodeTitle)
	filePath, err := buildPodcastTranscriptAssetPath(transcriptRoot, itunesID, episodeKey, fileName)
	if err != nil {
		return nil, err
	}

	payloadBytes, err := json.Marshal(input.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal transcript payload: %w", err)
	}

	fileSizeBytes, err := writeCompressedJSONAtomically(filePath, payloadBytes)
	if err != nil {
		return nil, err
	}

	asset := &podcastTranscriptAsset{
		TranscriptKey:          transcriptKey,
		ItunesID:               itunesID,
		EpisodeKey:             episodeKey,
		EpisodeGUID:            episodeGUID,
		EpisodeTitle:           strings.TrimSpace(input.EpisodeTitle),
		SourceKind:             sourceKind,
		Provider:               metadata.provider,
		Model:                  metadata.model,
		AudioSourceFingerprint: metadata.audioSourceFingerprint,
		FileName:               fileName,
		FileSizeBytes:          fileSizeBytes,
		CreatedAt:              formatPodcastTranscriptCreatedAt(now),
	}

	inserted := false
	defer func() {
		if inserted {
			return
		}
		_ = os.Remove(filePath)
	}()

	if _, err := db.ExecContext(
		ctx,
		`INSERT INTO podcast_transcript_assets (
			transcript_key,
			itunes_id,
			episode_key,
			episode_guid,
			episode_title,
			source_kind,
			provider,
			model,
			audio_source_fingerprint,
			file_name,
			file_size_bytes,
			created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		asset.TranscriptKey,
		asset.ItunesID,
		asset.EpisodeKey,
		asset.EpisodeGUID,
		nullIfEmpty(asset.EpisodeTitle),
		asset.SourceKind,
		nullIfEmpty(asset.Provider),
		nullIfEmpty(asset.Model),
		nullIfEmpty(asset.AudioSourceFingerprint),
		asset.FileName,
		asset.FileSizeBytes,
		asset.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("insert podcast transcript asset: %w", err)
	}

	inserted = true
	return asset, nil
}

func loadPodcastTranscriptAssetByKey(
	ctx context.Context,
	db *sql.DB,
	transcriptRoot string,
	transcriptKey string,
) (*podcastTranscriptAsset, *asrRelayResponsePayload, error) {
	row := db.QueryRowContext(
		ctx,
		`SELECT
			transcript_key,
			itunes_id,
			episode_key,
			episode_guid,
			COALESCE(episode_title, ''),
			source_kind,
			COALESCE(provider, ''),
			COALESCE(model, ''),
			COALESCE(audio_source_fingerprint, ''),
			file_name,
			file_size_bytes,
			created_at
		FROM podcast_transcript_assets
		WHERE transcript_key = ?`,
		strings.TrimSpace(transcriptKey),
	)

	asset := &podcastTranscriptAsset{}
	if err := row.Scan(
		&asset.TranscriptKey,
		&asset.ItunesID,
		&asset.EpisodeKey,
		&asset.EpisodeGUID,
		&asset.EpisodeTitle,
		&asset.SourceKind,
		&asset.Provider,
		&asset.Model,
		&asset.AudioSourceFingerprint,
		&asset.FileName,
		&asset.FileSizeBytes,
		&asset.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, fmt.Errorf("shared transcript asset %q: %w", strings.TrimSpace(transcriptKey), err)
		}
		return nil, nil, err
	}

	payload, err := readPodcastTranscriptPayload(transcriptRoot, asset)
	if err != nil {
		return nil, nil, err
	}

	return asset, payload, nil
}

func listReusablePodcastTranscriptAssets(
	ctx context.Context,
	db *sql.DB,
	lookup reusablePodcastTranscriptLookup,
) ([]podcastTranscriptAsset, error) {
	itunesID := strings.TrimSpace(lookup.ItunesID)
	if itunesID == "" {
		return nil, errors.New("itunes_id is required for shared transcript assets")
	}

	episodeGUID := normalizeEpisodeIdentity(lookup.EpisodeGUID)
	if episodeGUID == "" {
		return nil, errors.New("episode_guid is required for shared transcript assets")
	}

	episodeKey, err := derivePodcastTranscriptEpisodeKey(episodeGUID)
	if err != nil {
		return nil, err
	}

	sourceKind, err := normalizePodcastTranscriptSourceKind(lookup.SourceKind)
	if err != nil {
		return nil, err
	}

	metadata, err := normalizePodcastTranscriptMetadata(lookup.Provider, lookup.Model, lookup.EnclosureURL)
	if err != nil {
		return nil, err
	}

	// 023b enumerates storage-layer matches only. Any winner-selection policy belongs to 023c.
	rows, err := db.QueryContext(
		ctx,
		`SELECT
			transcript_key,
			itunes_id,
			episode_key,
			episode_guid,
			COALESCE(episode_title, ''),
			source_kind,
			COALESCE(provider, ''),
			COALESCE(model, ''),
			COALESCE(audio_source_fingerprint, ''),
			file_name,
			file_size_bytes,
			created_at
		FROM podcast_transcript_assets
		WHERE itunes_id = ?
		  AND episode_key = ?
		  AND source_kind = ?
		  AND ((? IS NULL AND provider IS NULL) OR provider = ?)
		  AND ((? IS NULL AND model IS NULL) OR model = ?)
		  AND ((? IS NULL AND audio_source_fingerprint IS NULL) OR audio_source_fingerprint = ?)
		ORDER BY created_at ASC, transcript_key ASC`,
		itunesID,
		episodeKey,
		sourceKind,
		nullIfEmpty(metadata.provider),
		metadata.provider,
		nullIfEmpty(metadata.model),
		metadata.model,
		nullIfEmpty(metadata.audioSourceFingerprint),
		metadata.audioSourceFingerprint,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assets := make([]podcastTranscriptAsset, 0)
	for rows.Next() {
		var asset podcastTranscriptAsset
		if err := rows.Scan(
			&asset.TranscriptKey,
			&asset.ItunesID,
			&asset.EpisodeKey,
			&asset.EpisodeGUID,
			&asset.EpisodeTitle,
			&asset.SourceKind,
			&asset.Provider,
			&asset.Model,
			&asset.AudioSourceFingerprint,
			&asset.FileName,
			&asset.FileSizeBytes,
			&asset.CreatedAt,
		); err != nil {
			return nil, err
		}
		assets = append(assets, asset)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return assets, nil
}

func derivePodcastTranscriptEpisodeKey(episodeGUID string) (string, error) {
	normalizedIdentity := normalizeEpisodeIdentity(episodeGUID)
	if normalizedIdentity == "" {
		return "", errors.New("episode identity is required")
	}

	sum := sha256.Sum256([]byte(normalizedIdentity))
	return podcastTranscriptEpisodeKeyPrefix + hex.EncodeToString(sum[:])[:podcastTranscriptEpisodeKeyHashHexChars], nil
}

func normalizeEpisodeIdentity(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	return strings.ToLower(trimmed)
}

func buildPodcastTranscriptAssetPath(transcriptRoot, itunesID, episodeKey, fileName string) (string, error) {
	if err := validatePodcastTranscriptRoot(transcriptRoot); err != nil {
		return "", err
	}

	normalizedItunesID := strings.TrimSpace(itunesID)
	if normalizedItunesID == "" {
		return "", errors.New("itunes_id is required")
	}

	normalizedEpisodeKey := strings.TrimSpace(episodeKey)
	if normalizedEpisodeKey == "" {
		return "", errors.New("episode_key is required")
	}

	normalizedFileName := strings.TrimSpace(fileName)
	if normalizedFileName == "" {
		return "", errors.New("file_name is required")
	}
	if normalizedFileName != filepath.Base(normalizedFileName) || strings.ContainsAny(normalizedFileName, `/\`) {
		return "", errors.New("file_name must be a base name only")
	}

	return filepath.Join(transcriptRoot, normalizedItunesID, normalizedEpisodeKey, normalizedFileName), nil
}

func buildPodcastTranscriptFileName(transcriptKey, episodeTitle string) string {
	return transcriptKey + "-" + slugifyPodcastTranscriptTitle(episodeTitle) + podcastTranscriptFileSuffix
}

func slugifyPodcastTranscriptTitle(episodeTitle string) string {
	var builder strings.Builder
	pendingHyphen := false

	for _, r := range strings.TrimSpace(episodeTitle) {
		switch {
		case unicode.IsLetter(r), unicode.IsNumber(r):
			lower := unicode.ToLower(r)
			runeSize := utf8.RuneLen(lower)
			if runeSize <= 0 {
				continue
			}
			additionalBytes := runeSize
			if pendingHyphen && builder.Len() > 0 {
				additionalBytes++
			}
			if builder.Len()+additionalBytes > podcastTranscriptMaxSlugBytes {
				return finalizePodcastTranscriptSlug(builder.String())
			}
			if pendingHyphen && builder.Len() > 0 {
				builder.WriteByte('-')
				pendingHyphen = false
			}
			builder.WriteRune(lower)
		case unicode.IsSpace(r), unicode.IsPunct(r), unicode.IsSymbol(r), unicode.IsControl(r), unicode.IsMark(r):
			if builder.Len() > 0 {
				pendingHyphen = true
			}
		default:
			if builder.Len() > 0 {
				pendingHyphen = true
			}
		}
	}

	return finalizePodcastTranscriptSlug(builder.String())
}

func finalizePodcastTranscriptSlug(slug string) string {
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return podcastTranscriptFallbackSlug
	}
	return slug
}

type podcastTranscriptMetadata struct {
	provider               string
	model                  string
	audioSourceFingerprint string
}

func normalizePodcastTranscriptSourceKind(sourceKind string) (string, error) {
	normalized := strings.TrimSpace(sourceKind)
	if normalized == "" {
		return "", errors.New("source_kind is required for shared transcript assets")
	}
	return normalized, nil
}

func normalizePodcastTranscriptMetadata(provider, model, enclosureURL string) (*podcastTranscriptMetadata, error) {
	normalizedProvider := strings.TrimSpace(provider)
	normalizedModel := strings.TrimSpace(model)
	normalizedEnclosureURL := strings.TrimSpace(enclosureURL)

	if normalizedProvider == "" && normalizedModel == "" && normalizedEnclosureURL == "" {
		return &podcastTranscriptMetadata{}, nil
	}

	if normalizedProvider == "" || normalizedModel == "" || normalizedEnclosureURL == "" {
		return nil, errors.New("provider, model, and enclosure_url must be set together when transcript classifier metadata is supplied")
	}

	fingerprint, err := deriveAudioSourceFingerprint(enclosureURL)
	if err != nil {
		return nil, err
	}
	return &podcastTranscriptMetadata{
		provider:               normalizedProvider,
		model:                  normalizedModel,
		audioSourceFingerprint: fingerprint,
	}, nil
}

func deriveAudioSourceFingerprint(enclosureURL string) (string, error) {
	normalized := normalizeEnclosureURL(enclosureURL)
	if normalized == "" {
		return "", errors.New("enclosure_url is required for ASR transcript assets")
	}
	sum := sha256.Sum256([]byte(normalized))
	return podcastTranscriptFingerprintPrefix + hex.EncodeToString(sum[:])[:podcastTranscriptFingerprintHexChars], nil
}

func normalizeEnclosureURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return trimmed
	}

	parsed.Fragment = ""
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)
	return parsed.String()
}

func readPodcastTranscriptPayload(
	transcriptRoot string,
	asset *podcastTranscriptAsset,
) (*asrRelayResponsePayload, error) {
	filePath, err := buildPodcastTranscriptAssetPath(transcriptRoot, asset.ItunesID, asset.EpisodeKey, asset.FileName)
	if err != nil {
		return nil, err
	}

	file, err := os.Open(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("shared transcript asset file missing for %s: %w", asset.TranscriptKey, err)
		}
		return nil, fmt.Errorf("open shared transcript asset %q: %w", filePath, err)
	}
	defer file.Close()

	reader, err := gzip.NewReader(file)
	if err != nil {
		return nil, fmt.Errorf("open gzip transcript asset %q: %w", filePath, err)
	}
	defer reader.Close()

	payloadBytes, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read transcript asset %q: %w", filePath, err)
	}

	var payload asrRelayResponsePayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("decode transcript asset %q: %w", filePath, err)
	}

	return &payload, nil
}

func writeCompressedJSONAtomically(filePath string, payload []byte) (int64, error) {
	if existing, err := os.Stat(filePath); err == nil && !existing.IsDir() {
		return 0, fmt.Errorf("transcript asset file %q already exists", filePath)
	}

	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return 0, fmt.Errorf("create transcript asset directory for %q: %w", filePath, err)
	}

	tempFile, err := os.CreateTemp(filepath.Dir(filePath), ".transcript-*.json.gz")
	if err != nil {
		return 0, fmt.Errorf("create transcript temp file for %q: %w", filePath, err)
	}

	tempPath := tempFile.Name()
	cleanupTemp := true
	defer func() {
		_ = tempFile.Close()
		if cleanupTemp {
			_ = os.Remove(tempPath)
		}
	}()

	gzipWriter := gzip.NewWriter(tempFile)
	if _, err := gzipWriter.Write(payload); err != nil {
		_ = gzipWriter.Close()
		return 0, fmt.Errorf("write transcript asset temp payload for %q: %w", filePath, err)
	}
	if err := gzipWriter.Close(); err != nil {
		return 0, fmt.Errorf("close transcript asset temp payload for %q: %w", filePath, err)
	}
	if err := tempFile.Close(); err != nil {
		return 0, fmt.Errorf("close transcript asset temp file for %q: %w", filePath, err)
	}
	if err := os.Rename(tempPath, filePath); err != nil {
		return 0, fmt.Errorf("rename transcript asset temp file for %q: %w", filePath, err)
	}

	cleanupTemp = false

	info, err := os.Stat(filePath)
	if err != nil {
		return 0, fmt.Errorf("stat transcript asset file %q: %w", filePath, err)
	}
	return info.Size(), nil
}

func newPodcastTranscriptKey(now time.Time, random io.Reader) (string, error) {
	var raw [16]byte
	millis := uint64(now.UTC().UnixMilli())
	raw[0] = byte(millis >> 40)
	raw[1] = byte(millis >> 32)
	raw[2] = byte(millis >> 24)
	raw[3] = byte(millis >> 16)
	raw[4] = byte(millis >> 8)
	raw[5] = byte(millis)

	if _, err := io.ReadFull(random, raw[6:]); err != nil {
		return "", err
	}

	return podcastTranscriptKeyPrefix + encodeULID(raw), nil
}

func formatPodcastTranscriptCreatedAt(now time.Time) string {
	return now.UTC().Format("2006-01-02T15:04:05.000000000Z")
}

func encodeULID(raw [16]byte) string {
	value := new(big.Int).SetBytes(raw[:])
	if value.Sign() == 0 {
		return strings.Repeat("0", podcastTranscriptULIDEncodedChars)
	}

	digits := make([]byte, 0, podcastTranscriptULIDEncodedChars)
	remainder := new(big.Int)
	for value.Sign() > 0 {
		value.QuoRem(value, podcastTranscriptULIDRadix, remainder)
		digits = append(digits, "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[remainder.Int64()])
	}

	for len(digits) < podcastTranscriptULIDEncodedChars {
		digits = append(digits, '0')
	}

	for i, j := 0, len(digits)-1; i < j; i, j = i+1, j-1 {
		digits[i], digits[j] = digits[j], digits[i]
	}

	return string(digits)
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
