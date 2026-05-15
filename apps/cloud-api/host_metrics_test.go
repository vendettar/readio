package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHostMetricSnapshotCollectsSQLiteSizes(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "readio.db")
	if err := os.WriteFile(dbPath, []byte("database"), 0o600); err != nil {
		t.Fatalf("write db: %v", err)
	}
	if err := os.WriteFile(dbPath+"-wal", []byte("wal"), 0o600); err != nil {
		t.Fatalf("write wal: %v", err)
	}

	snapshot := collectHostMetricsSnapshot(dbPath, "", "prod", hostMetricsSnapshot{}, time.Now())

	if snapshot.sqliteDBSizeBytes != 8 {
		t.Fatalf("db size = %d, want 8", snapshot.sqliteDBSizeBytes)
	}
	if snapshot.sqliteWALSizeBytes != 3 {
		t.Fatalf("wal size = %d, want 3", snapshot.sqliteWALSizeBytes)
	}
	if snapshot.env != "production" {
		t.Fatalf("env = %q, want production", snapshot.env)
	}
	if snapshot.dataFSTotalBytes <= 0 {
		t.Fatalf("data filesystem total bytes = %d, want positive", snapshot.dataFSTotalBytes)
	}
}

func TestHostMetricSnapshotMissingWALIsZero(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "readio.db")
	if err := os.WriteFile(dbPath, []byte("database"), 0o600); err != nil {
		t.Fatalf("write db: %v", err)
	}

	snapshot := collectHostMetricsSnapshot(dbPath, "", "production", hostMetricsSnapshot{}, time.Now())

	if snapshot.sqliteWALSizeBytes != 0 {
		t.Fatalf("wal size = %d, want 0", snapshot.sqliteWALSizeBytes)
	}
}

func TestBoundedDirectorySizeSumsFilesAndSkipsHiddenTempDirs(t *testing.T) {
	dir := t.TempDir()
	mustWriteFile(t, filepath.Join(dir, "a.json.gz"), "aa")
	mustWriteFile(t, filepath.Join(dir, "nested", "b.json.gz"), "bbb")
	mustWriteFile(t, filepath.Join(dir, ".tmp", "ignored"), "xxxx")
	mustWriteFile(t, filepath.Join(dir, "tmp-build", "ignored"), "xxxx")

	size, complete := boundedDirectorySize(dir, 100, time.Second, time.Now)

	if !complete {
		t.Fatal("walk unexpectedly incomplete")
	}
	if size != 5 {
		t.Fatalf("size = %d, want 5", size)
	}
}

func TestBoundedDirectorySizeCapsFileCount(t *testing.T) {
	dir := t.TempDir()
	mustWriteFile(t, filepath.Join(dir, "a"), "a")
	mustWriteFile(t, filepath.Join(dir, "b"), "b")

	_, complete := boundedDirectorySize(dir, 1, time.Second, time.Now)

	if complete {
		t.Fatal("walk complete = true, want false when file cap is exceeded")
	}
}

func TestMissingTranscriptDirectoryDoesNotFailStartup(t *testing.T) {
	snapshot := collectHostMetricsSnapshot("", filepath.Join(t.TempDir(), "missing"), "preprod", hostMetricsSnapshot{}, time.Now())

	if !snapshot.transcriptConfigured {
		t.Fatal("transcriptConfigured = false, want true for configured missing dir")
	}
	if !snapshot.transcriptWalkStale {
		t.Fatal("transcriptWalkStale = false, want true for missing dir")
	}
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
		if got := normalizeMetricEnv(input); got != want {
			t.Fatalf("normalizeMetricEnv(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestHostMetricPathAttributesDoNotLeakFullPaths(t *testing.T) {
	attrs := hostMetricPathAttributes("/tmp/readio/prod/data", "/tmp/readio/prod/data/readio.db")

	for _, attr := range attrs {
		if attr.Key == "path" || attr.Key == "file" {
			t.Fatalf("unexpected high-cardinality path key: %s", attr.Key)
		}
		if attr.Value.AsString() == "/tmp/readio/prod/data/readio.db" {
			t.Fatalf("unexpected full path label value: %s", attr.Value.AsString())
		}
	}
	if attrs[2].Key != "path_class" || attrs[2].Value.AsString() != "unknown" {
		t.Fatalf("path_class = %s/%s, want unknown closed enum", attrs[2].Key, attrs[2].Value.AsString())
	}
}

func mustWriteFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}
}
