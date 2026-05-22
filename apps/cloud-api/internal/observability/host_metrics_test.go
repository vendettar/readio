package observability

import (
	"github.com/stretchr/testify/require"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHostMetricSnapshotCollectsSQLiteSizes(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "readio.db")
	err := os.WriteFile(dbPath, []byte("database"), 0o600)
	require.NoError(t, err)
	err = os.WriteFile(dbPath+"-wal", []byte("wal"), 0o600)
	require.NoError(t, err)

	snapshot := collectHostMetricsSnapshot(dbPath, "", "prod", hostMetricsSnapshot{}, time.Now())

	require.Equal(t, int64(8), snapshot.sqliteDBSizeBytes)
	require.Equal(t, int64(3), snapshot.sqliteWALSizeBytes)
	require.Equal(t, "production", snapshot.env)
	if snapshot.dataFSTotalBytes <= 0 {
		t.Fatalf("data filesystem total bytes = %d, want positive", snapshot.dataFSTotalBytes)
	}
}

func TestHostMetricSnapshotMissingWALIsZero(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "readio.db")
	err := os.WriteFile(dbPath, []byte("database"), 0o600)
	require.NoError(t, err)

	snapshot := collectHostMetricsSnapshot(dbPath, "", "production", hostMetricsSnapshot{}, time.Now())

	require.Equal(t, int64(0), snapshot.sqliteWALSizeBytes)
}

func TestBoundedDirectorySizeSumsFilesAndSkipsHiddenTempDirs(t *testing.T) {
	dir := t.TempDir()
	mustWriteFile(t, filepath.Join(dir, "a.json.gz"), "aa")
	mustWriteFile(t, filepath.Join(dir, "nested", "b.json.gz"), "bbb")
	mustWriteFile(t, filepath.Join(dir, ".tmp", "ignored"), "xxxx")
	mustWriteFile(t, filepath.Join(dir, "tmp-build", "ignored"), "xxxx")

	size, complete := boundedDirectorySize(dir, 100, time.Second, time.Now)

	require.True(t, complete)
	require.Equal(t, int64(5), size)
}

func TestBoundedDirectorySizeCapsFileCount(t *testing.T) {
	dir := t.TempDir()
	mustWriteFile(t, filepath.Join(dir, "a"), "a")
	mustWriteFile(t, filepath.Join(dir, "b"), "b")

	_, complete := boundedDirectorySize(dir, 1, time.Second, time.Now)

	require.False(t, complete)
}

func TestMissingTranscriptDirectoryDoesNotFailStartup(t *testing.T) {
	snapshot := collectHostMetricsSnapshot("", filepath.Join(t.TempDir(), "missing"), "preprod", hostMetricsSnapshot{}, time.Now())

	require.True(t, snapshot.transcriptConfigured)
	require.True(t, snapshot.transcriptWalkStale)
}

func TestHostRuntimeMetricsAreNonNegative(t *testing.T) {
	snapshot := collectHostMetricsSnapshot("", "", "unknown", hostMetricsSnapshot{}, time.Now())

	if snapshot.goroutines < 1 {
		t.Fatalf("goroutines = %d, want >= 1", snapshot.goroutines)
	}
	if snapshot.heapAllocBytes < 0 || snapshot.memorySysBytes < 0 || snapshot.uptimeSeconds < 0 {
		t.Fatalf("runtime metrics must be non-negative: %+v", snapshot)
	}
}

func TestNormalizeMetricEnvIsBounded(t *testing.T) {
	cases := map[string]string{
		"prod":          "production",
		"production":    "production",
		"pre":           "preproduction",
		"preprod":       "preproduction",
		"preproduction": "preproduction",
		"staging":       "preproduction",
		"dev":           "develop",
		"anything":      "unknown",
	}
	for input, want := range cases {
		got := NormalizeMetricEnv(input)
		require.Equal(t, want, got)
	}
}

func TestHostMetricPathAttributesDoNotLeakFullPaths(t *testing.T) {
	attrs := hostMetricPathAttributes("/tmp/readio/prod/data", "/tmp/readio/prod/data/readio.db")

	for _, attr := range attrs {
		require.NotEqual(t, "path", string(attr.Key))
		require.NotEqual(t, "/tmp/readio/prod/data/readio.db", attr.Value.AsString())
	}
	require.Equal(t, "path_class", string(attrs[2].Key))
	require.Equal(t, "unknown", attrs[2].Value.AsString())
}

func mustWriteFile(t *testing.T, path string, content string) {
	t.Helper()
	err := os.MkdirAll(filepath.Dir(path), 0o700)
	require.NoError(t, err)
	err = os.WriteFile(path, []byte(content), 0o600)
	require.NoError(t, err)
}
