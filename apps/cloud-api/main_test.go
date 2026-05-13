package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

const testProxyAllowedOrigin = "https://app.readio.test"

func TestProxyRequestSummaryEmitsCanonicalUpstreamFields(t *testing.T) {
	rb := newAdminRingBuffer(10)
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(&adminSlogHandler{
		Handler: slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}),
		buffer:  rb,
	}))
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	proxy, _ := newMediaProxyTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/audio.mp3" {
			t.Fatalf("path = %q, want %q", r.URL.Path, "/audio.mp3")
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = io.WriteString(w, "ok")
	}), nil)

	reqURL := "http://media.example.com/audio.mp3"
	req := newProxyJSONRequest(t, http.MethodGet, reqURL, nil)
	rr := httptest.NewRecorder()
	proxy.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	snap := rb.snapshot()
	if len(snap) != 1 {
		t.Fatalf("snapshot len = %d, want 1", len(snap))
	}
	entry := snap[0]
	if entry.Route != "proxy/media" {
		t.Fatalf("route = %q, want %q", entry.Route, "proxy/media")
	}
	if entry.UpstreamKind != "proxy" {
		t.Fatalf("upstream_kind = %q, want %q", entry.UpstreamKind, "proxy")
	}
	if entry.UpstreamHost != "media.example.com" {
		t.Fatalf("upstream_host = %q, want %q", entry.UpstreamHost, "media.example.com")
	}
	if entry.ErrorClass != "none" {
		t.Fatalf("error_class = %q, want %q", entry.ErrorClass, "none")
	}
	if entry.Status != http.StatusOK {
		t.Fatalf("status = %d, want %d", entry.Status, http.StatusOK)
	}
}

func TestProxyRequestSummaryUsesActualProxyErrorStatus(t *testing.T) {
	rb := newAdminRingBuffer(10)
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(&adminSlogHandler{
		Handler: slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}),
		buffer:  rb,
	}))
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	proxy := newProxyService()
	req := httptest.NewRequest(http.MethodPut, "/api/proxy", nil)
	rr := httptest.NewRecorder()
	proxy.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusMethodNotAllowed)
	}

	snap := rb.snapshot()
	var entry *adminLogEntry
	for i := range snap {
		if snap[i].Route == "proxy/media" {
			entry = &snap[i]
		}
	}
	if entry == nil {
		t.Fatalf("proxy/media log entry not found in snapshot: %#v", snap)
		return
	}
	if entry.Status != http.StatusMethodNotAllowed {
		t.Fatalf("logged status = %d, want %d", entry.Status, http.StatusMethodNotAllowed)
	}
	if entry.ErrorClass != "invalid_method" {
		t.Fatalf("error_class = %q, want %q", entry.ErrorClass, "invalid_method")
	}
}

func assertProxyErrorPayload(t *testing.T, body interface{ String() string }, wantCode string) {
	t.Helper()

	var payload map[string]string
	decodeResponseJSON(t, body, &payload)

	if payload["code"] != wantCode {
		t.Fatalf("code = %q, want %q", payload["code"], wantCode)
	}
	if strings.TrimSpace(payload["message"]) == "" {
		t.Fatal("message is empty")
	}
	if strings.TrimSpace(payload["request_id"]) == "" {
		t.Fatal("request_id is empty")
	}
}

func TestCloudMuxServesDynamicJSONConfig(t *testing.T) {
	t.Setenv("READIO_APP_NAME", "Readio Cloud")
	t.Setenv("READIO_APP_VERSION", "2.0.0")
	t.Setenv(asrRelayPublicTokenEnv, "relay-public-token")
	t.Setenv("READIO_ASR_PROVIDER", "groq")
	t.Setenv("READIO_ASR_MODEL", "whisper-large-v3")
	t.Setenv("READIO_ENABLED_ASR_PROVIDERS", "groq")
	t.Setenv("READIO_EN_DICTIONARY_API_TRANSPORT", "direct")
	t.Setenv("READIO_DEFAULT_LANGUAGE", "zh")
	t.Setenv("READIO_NETWORK_PROXY_AUTH_HEADER", "x-proxy-token")
	t.Setenv("READIO_NETWORK_PROXY_AUTH_VALUE", "browser-public-proxy-token")
	t.Setenv("VITE_GRAFANA_FARO_URL", "https://faro.example.com/collect")
	t.Setenv("VITE_GRAFANA_FARO_APP_NAME", "readio-cloud")
	t.Setenv("VITE_GRAFANA_FARO_ENV", "production")
	t.Setenv("VITE_GRAFANA_FARO_SAMPLE_RATE", "0.25")
	t.Setenv(cloudDBEnv, "/srv/readio/data/readio.db")
	t.Setenv(asrRelayAllowedOriginsEnv, "https://readio.example")
	t.Setenv(asrRelayRateLimitBurstEnv, "9")
	t.Setenv(asrRelayRateLimitWindowMsEnv, "1500")
	t.Setenv("PORT", "8080")

	mux := newCloudMux(http.NotFoundHandler(), http.NotFoundHandler(), http.NotFoundHandler())

	req := httptest.NewRequest(http.MethodGet, browserConfigRoute, nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if got := rr.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("content-type = %q, want %q", got, "application/json; charset=utf-8")
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal env payload: %v", err)
	}

	if payload["READIO_APP_NAME"] != "Readio Cloud" {
		t.Fatalf("READIO_APP_NAME = %#v, want %#v", payload["READIO_APP_NAME"], "Readio Cloud")
	}
	if payload["READIO_ASR_RELAY_PUBLIC_TOKEN"] != "relay-public-token" {
		t.Fatalf("READIO_ASR_RELAY_PUBLIC_TOKEN = %#v, want %#v", payload["READIO_ASR_RELAY_PUBLIC_TOKEN"], "relay-public-token")
	}
}

func TestBrowserEnvAllowlistFaroKeysArePublicOnly(t *testing.T) {
	wantFaroKeys := []string{
		"VITE_GRAFANA_FARO_URL",
		"VITE_GRAFANA_FARO_APP_NAME",
		"VITE_GRAFANA_FARO_ENV",
		"VITE_GRAFANA_FARO_SAMPLE_RATE",
	}

	var gotFaroKeys []string
	for _, key := range browserEnvAllowlist {
		if strings.Contains(key, "GRAFANA_FARO") {
			gotFaroKeys = append(gotFaroKeys, key)
		}
	}

	if len(gotFaroKeys) != len(wantFaroKeys) {
		t.Fatalf("Faro allowlist keys = %#v, want %#v", gotFaroKeys, wantFaroKeys)
	}
	for i := range wantFaroKeys {
		if gotFaroKeys[i] != wantFaroKeys[i] {
			t.Fatalf("Faro key[%d] = %q, want %q", i, gotFaroKeys[i], wantFaroKeys[i])
		}
	}

	forbiddenPatterns := []*regexp.Regexp{
		regexp.MustCompile(`GRAFANA.*(API|WRITE|TOKEN|KEY|PASSWORD|SECRET)`),
		regexp.MustCompile(`LOKI.*(TOKEN|KEY|PASSWORD|SECRET|BASIC|AUTH)`),
		regexp.MustCompile(`PROMETHEUS.*(TOKEN|KEY|PASSWORD|SECRET|BASIC|AUTH)`),
		regexp.MustCompile(`^READIO_ADMIN_TOKEN$`),
		regexp.MustCompile(`^READIO_METRICS_TOKEN$`),
		regexp.MustCompile(`RELAY.*SECRET`),
		regexp.MustCompile(`^READIO_ASR_RELAY_TOKEN$`),
		regexp.MustCompile(`PROVIDER.*KEY$`),
		regexp.MustCompile(`BASIC.*AUTH`),
	}

	for _, key := range browserEnvAllowlist {
		for _, pattern := range forbiddenPatterns {
			if pattern.MatchString(key) {
				t.Fatalf("browser allowlist exposes forbidden key %q matching %q", key, pattern.String())
			}
		}
	}
}

func TestBrowserEnvAllowlistMatchesArtifact(t *testing.T) {
	data, err := os.ReadFile("browser-env-allowlist.json")
	if err != nil {
		t.Fatalf("read allowlist artifact: %v", err)
	}

	var artifact []string
	if err := json.Unmarshal(data, &artifact); err != nil {
		t.Fatalf("unmarshal allowlist artifact: %v", err)
	}

	if len(artifact) != len(browserEnvAllowlist) {
		t.Fatalf("allowlist length = %d, artifact length = %d", len(browserEnvAllowlist), len(artifact))
	}

	for i := range browserEnvAllowlist {
		if artifact[i] != browserEnvAllowlist[i] {
			t.Fatalf("key[%d] = %q, artifact[%d] = %q — browser-env-allowlist.json must be updated to match browserEnvAllowlist", i, browserEnvAllowlist[i], i, artifact[i])
		}
	}
}

func TestResolveCloudDBPathUsesEnvOverride(t *testing.T) {
	want := filepath.Join(t.TempDir(), "cloud.db")
	t.Setenv(cloudDBEnv, want)

	got, err := resolveCloudDBPath()
	if err != nil {
		t.Fatalf("resolve cloud db path: %v", err)
	}
	if got != want {
		t.Fatalf("path = %q, want %q", got, want)
	}
}

func TestResolveCloudDBPathRequiresExplicitEnv(t *testing.T) {
	t.Setenv(cloudDBEnv, "")

	_, err := resolveCloudDBPath()
	if err == nil {
		t.Fatal("resolve cloud db path unexpectedly succeeded without env")
	}
	if !strings.Contains(err.Error(), cloudDBEnv) {
		t.Fatalf("resolve cloud db path error = %v, want mention of %s", err, cloudDBEnv)
	}
}

func TestResolveCloudDBPathRejectsRelativePath(t *testing.T) {
	t.Setenv(cloudDBEnv, filepath.Join("state", "cloud.db"))

	_, err := resolveCloudDBPath()
	if err == nil {
		t.Fatal("resolve cloud db path unexpectedly succeeded with relative path")
	}
	if !strings.Contains(err.Error(), "absolute path") {
		t.Fatalf("resolve cloud db path error = %v, want mention of absolute path", err)
	}
}

func TestResolveProxyRateLimitBurstEnvOverrides(t *testing.T) {
	tests := []struct {
		name      string
		envValue  string
		wantBurst int
	}{
		{
			name:      "valid custom value",
			envValue:  "10",
			wantBurst: 10,
		},
		{
			name:      "zero disables",
			envValue:  "0",
			wantBurst: 0,
		},
		{
			name:      "negative disables",
			envValue:  "-1",
			wantBurst: -1,
		},
		{
			name:      "invalid uses default",
			envValue:  "abc",
			wantBurst: proxyRateLimitBurst,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(proxyRateLimitBurstEnv, tc.envValue)

			got := resolveProxyRateLimitBurst()
			if got != tc.wantBurst {
				t.Fatalf("burst = %d, want %d", got, tc.wantBurst)
			}
		})
	}
}

func TestResolveProxyRateLimitWindowEnvOverrides(t *testing.T) {
	tests := []struct {
		name       string
		envValue   string
		wantWindow time.Duration
	}{
		{
			name:       "valid custom value 30s",
			envValue:   "30000",
			wantWindow: 30 * time.Second,
		},
		{
			name:       "zero uses default",
			envValue:   "0",
			wantWindow: proxyRateLimitWindow,
		},
		{
			name:       "negative uses default",
			envValue:   "-1000",
			wantWindow: proxyRateLimitWindow,
		},
		{
			name:       "invalid uses default",
			envValue:   "abc",
			wantWindow: proxyRateLimitWindow,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(proxyRateLimitWindowMsEnv, tc.envValue)

			got := resolveProxyRateLimitWindow()
			if got != tc.wantWindow {
				t.Fatalf("window = %v, want %v", got, tc.wantWindow)
			}
		})
	}
}

func TestProxyServiceUsesConfiguredRateLimitBurst(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "2")

	proxy := newProxyService()
	if proxy.limiter == nil {
		t.Fatal("limiter = nil, want non-nil")
	}

	if proxy.limiter.limit != 2 {
		t.Fatalf("limiter.limit = %d, want 2", proxy.limiter.limit)
	}
}

func TestProxyServiceRateLimiterDisableWhenBurstZero(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "0")

	proxy := newProxyService()
	if proxy.limiter == nil {
		t.Fatal("limiter = nil, want non-nil")
	}

	if proxy.limiter.limit != 0 {
		t.Fatalf("limiter.limit = %d, want 0", proxy.limiter.limit)
	}

	for i := 0; i < 100; i++ {
		if !proxy.limiter.allow("198.51.100.10") {
			t.Fatalf("request %d should pass when burst=0 (disabled)", i+1)
		}
	}
}

func TestWriteProxyErrorUsesExplicitCode(t *testing.T) {
	rr := httptest.NewRecorder()

	writeProxyError(context.Background(), rr, http.StatusBadGateway, "PROXY_DIAL_FAILED", "upstream request failed", "")

	assertProxyErrorPayload(t, rr.Body, "PROXY_DIAL_FAILED")
}

func TestConfigParsingLogsInvalidEnv(t *testing.T) {
	var logs strings.Builder
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	t.Setenv(proxyRateLimitBurstEnv, "not-an-int")
	got := resolveProxyRateLimitBurst()

	if got != proxyRateLimitBurst {
		t.Fatalf("burst = %d, want %d", got, proxyRateLimitBurst)
	}
	if !strings.Contains(logs.String(), proxyRateLimitBurstEnv) {
		t.Fatalf("invalid env parse was not logged: %s", logs.String())
	}
}

func TestProxyServiceRateLimiterDisableWhenBurstNegative(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "-5")

	proxy := newProxyService()
	if proxy.limiter == nil {
		t.Fatal("limiter = nil, want non-nil")
	}

	if proxy.limiter.limit != -5 {
		t.Fatalf("limiter.limit = %d, want -5 (disabled)", proxy.limiter.limit)
	}

	if !proxy.allowRequest("198.51.100.10") {
		t.Fatal("expected request to pass when limit < 0 (disabled)")
	}
}

func TestProxyServiceRateLimiterDisableWhenBurstMinusOne(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "-1")

	proxy := newProxyService()
	if proxy.limiter == nil {
		t.Fatal("limiter = nil, want non-nil")
	}

	if proxy.limiter.limit != -1 {
		t.Fatalf("limiter.limit = %d, want -1", proxy.limiter.limit)
	}

	for i := 0; i < 100; i++ {
		if !proxy.limiter.allow("198.51.100.10") {
			t.Fatalf("request %d should pass when burst=-1 (disabled)", i+1)
		}
	}
}

func TestProxyServiceRateLimiterReenableWhenBurstOne(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "1")

	proxy := newProxyService()
	if proxy.limiter == nil {
		t.Fatal("limiter = nil, want non-nil")
	}

	if proxy.limiter.limit != 1 {
		t.Fatalf("limiter.limit = %d, want 1", proxy.limiter.limit)
	}

	if !proxy.limiter.allow("198.51.100.10") {
		t.Fatal("expected first request to pass with burst=1")
	}

	if proxy.limiter.allow("198.51.100.10") {
		t.Fatal("expected second request to be rate limited with burst=1")
	}
}

func TestProxyServiceUsesConfiguredRateLimitWindow(t *testing.T) {
	t.Setenv(proxyRateLimitWindowMsEnv, "5000")

	proxy := newProxyService()
	if proxy.limiter == nil {
		t.Fatal("limiter = nil, want non-nil")
	}

	if proxy.limiter.window != 5*time.Second {
		t.Fatalf("limiter.window = %v, want 5s", proxy.limiter.window)
	}
}

func TestOpenCloudSQLiteFailsWhenParentDirMissing(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "missing", "cloud.db")

	db, err := openCloudSQLite(context.Background(), dbPath)
	if err == nil {
		if db != nil {
			_ = db.Close()
		}
		t.Fatal("open sqlite unexpectedly succeeded with missing parent dir")
	}
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("open sqlite error = %v, want os.ErrNotExist", err)
	}
}

func TestCloudSQLiteDSNAppliesConnectionPragmasOnEveryConnection(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := sql.Open("sqlite", buildCloudSQLiteDSN(dbPath))
	if err != nil {
		t.Fatalf("open sqlite with cloud dsn: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	db.SetMaxIdleConns(0)
	db.SetMaxOpenConns(2)

	ctx := context.Background()
	conn1, err := db.Conn(ctx)
	if err != nil {
		t.Fatalf("open first sqlite conn: %v", err)
	}
	defer func() { _ = conn1.Close() }()

	conn2, err := db.Conn(ctx)
	if err != nil {
		t.Fatalf("open second sqlite conn: %v", err)
	}
	defer func() { _ = conn2.Close() }()

	assertCloudSQLiteConnectionPragmas(t, ctx, conn1)
	assertCloudSQLiteConnectionPragmas(t, ctx, conn2)
}

func TestOpenCloudSQLiteInitializesPragmasAndRunsMigrations(t *testing.T) {
	if testing.Short() {
		t.Skip("sqlite bootstrap integration test")
	}

	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := openCloudSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("stat db file: %v", err)
	}

	assertCloudSQLitePragmas(t, context.Background(), db)

	var gooseTableCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'goose_db_version';",
	).Scan(&gooseTableCount); err != nil {
		t.Fatalf("query goose table: %v", err)
	}
	if gooseTableCount != 1 {
		t.Fatalf("goose table count = %d, want %d", gooseTableCount, 1)
	}
}

func TestOpenCloudSQLiteRunsMigrationsAfterPragmas(t *testing.T) {
	origRunMigrations := cloudRunSQLiteMigrations
	t.Cleanup(func() {
		cloudRunSQLiteMigrations = origRunMigrations
	})

	cloudRunSQLiteMigrations = func(ctx context.Context, db *sql.DB) error {
		assertCloudSQLitePragmas(t, ctx, db)
		return nil
	}

	db, err := openCloudSQLite(context.Background(), filepath.Join(t.TempDir(), "cloud.db"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
}

func assertCloudSQLitePragmas(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()

	var journalMode string
	if err := db.QueryRowContext(ctx, "PRAGMA journal_mode;").Scan(&journalMode); err != nil {
		t.Fatalf("query journal_mode: %v", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("journal_mode = %q, want %q", journalMode, "wal")
	}

	assertCloudSQLiteConnectionPragmas(t, ctx, db)
}

type pragmaQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func assertCloudSQLiteConnectionPragmas(t *testing.T, ctx context.Context, queryer pragmaQueryer) {
	t.Helper()

	var synchronous int
	if err := queryer.QueryRowContext(ctx, "PRAGMA synchronous;").Scan(&synchronous); err != nil {
		t.Fatalf("query synchronous: %v", err)
	}
	if synchronous != 1 {
		t.Fatalf("synchronous = %d, want %d", synchronous, 1)
	}

	var foreignKeys int
	if err := queryer.QueryRowContext(ctx, "PRAGMA foreign_keys;").Scan(&foreignKeys); err != nil {
		t.Fatalf("query foreign_keys: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("foreign_keys = %d, want %d", foreignKeys, 1)
	}

	var busyTimeout int
	if err := queryer.QueryRowContext(ctx, "PRAGMA busy_timeout;").Scan(&busyTimeout); err != nil {
		t.Fatalf("query busy_timeout: %v", err)
	}
	if busyTimeout != 5000 {
		t.Fatalf("busy_timeout = %d, want %d", busyTimeout, 5000)
	}
}

func TestOpenCloudSQLiteMigrationsAreIdempotentAcrossRestarts(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")

	db1, err := openCloudSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("first open sqlite: %v", err)
	}
	if err := db1.Close(); err != nil {
		t.Fatalf("close first db: %v", err)
	}

	db2, err := openCloudSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("second open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = db2.Close()
	})

	var version int64
	if err := db2.QueryRowContext(context.Background(), "SELECT MAX(version_id) FROM goose_db_version;").Scan(&version); err != nil {
		t.Fatalf("query goose version: %v", err)
	}
	if version < 1 {
		t.Fatalf("goose version = %d, want >= 1", version)
	}
}

func TestRunCloudSQLiteMigrationsRetriesAfterFailedAttempt(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := openCloudSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	badMigrations := fstest.MapFS{
		"migrations/00003_create_retry_table.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nCREATE TABLE retry_table (id INTEGER PRIMARY KEY);\n\n-- +goose Down\nDROP TABLE retry_table;\n"),
		},
		"migrations/00004_fail.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nTHIS IS NOT VALID SQL;\n\n-- +goose Down\nSELECT 1;\n"),
		},
	}

	err = runCloudSQLiteMigrationsFS(context.Background(), db, badMigrations, "migrations")
	if err == nil {
		t.Fatal("runCloudSQLiteMigrationsFS unexpectedly succeeded with failing migration")
	}

	var retryTableCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'retry_table';",
	).Scan(&retryTableCount); err != nil {
		t.Fatalf("query retry table after failed run: %v", err)
	}
	if retryTableCount != 1 {
		t.Fatalf("retry table count after failed run = %d, want 1", retryTableCount)
	}

	fixedMigrations := fstest.MapFS{
		"migrations/00003_create_retry_table.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nCREATE TABLE retry_table (id INTEGER PRIMARY KEY);\n\n-- +goose Down\nDROP TABLE retry_table;\n"),
		},
		"migrations/00004_create_retry_index.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nCREATE INDEX retry_table_id_idx ON retry_table (id);\n\n-- +goose Down\nDROP INDEX retry_table_id_idx;\n"),
		},
	}

	if err := runCloudSQLiteMigrationsFS(context.Background(), db, fixedMigrations, "migrations"); err != nil {
		t.Fatalf("runCloudSQLiteMigrationsFS retry: %v", err)
	}

	var retryIndexCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'retry_table_id_idx';",
	).Scan(&retryIndexCount); err != nil {
		t.Fatalf("query retry index after retry: %v", err)
	}
	if retryIndexCount != 1 {
		t.Fatalf("retry index count after retry = %d, want 1", retryIndexCount)
	}

	var latestVersion int64
	if err := db.QueryRowContext(context.Background(), "SELECT MAX(version_id) FROM goose_db_version;").Scan(&latestVersion); err != nil {
		t.Fatalf("query goose version after retry: %v", err)
	}
	if latestVersion != 4 {
		t.Fatalf("goose version after retry = %d, want 4", latestVersion)
	}
}

func TestRunCloudServerInitializesSQLiteAndShutsDownOnCancellation(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "nested", "cloud.db")

	t.Setenv(cloudDBEnv, dbPath)

	origOpen := cloudOpenSQLite
	origNewProxy := cloudNewProxyService
	origClose := cloudCloseSQLite
	origListen := cloudListenAndServe
	origShutdown := cloudShutdownServer
	origNotify := cloudNotifyContext
	t.Cleanup(func() {
		cloudOpenSQLite = origOpen
		cloudNewProxyService = origNewProxy
		cloudCloseSQLite = origClose
		cloudListenAndServe = origListen
		cloudShutdownServer = origShutdown
		cloudNotifyContext = origNotify
	})

	openPath := make(chan string, 1)
	listenStarted := make(chan struct{})
	serverReady := make(chan *http.Server, 1)
	shutdownCalled := make(chan struct{})
	closed := make(chan struct{})

	cloudOpenSQLite = func(_ context.Context, gotPath string) (sqliteCloser, error) {
		openPath <- gotPath
		return &testSQLiteHandle{closed: closed}, nil
	}
	cloudNewProxyService = func() *proxyService {
		return &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusOK,
					body:       "<rss>ok</rss>",
					headers: http.Header{
						"Content-Type": []string{"application/xml"},
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyBrowserLikeUserAgent,
			bodyLimit: proxyBodyLimit,
			allowedOrigins: []string{
				testProxyAllowedOrigin,
			},
		}
	}
	cloudListenAndServe = func(ctx context.Context, server *http.Server) error {
		close(listenStarted)
		serverReady <- server
		<-ctx.Done()
		return http.ErrServerClosed
	}
	cloudShutdownServer = func(_ context.Context, _ *http.Server) error {
		close(shutdownCalled)
		return nil
	}

	parent, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- runCloudServer(parent)
	}()

	select {
	case gotPath := <-openPath:
		if gotPath != dbPath {
			t.Fatalf("db path = %q, want %q", gotPath, dbPath)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for sqlite open")
	}

	select {
	case <-listenStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for server start")
	}

	var server *http.Server
	select {
	case server = <-serverReady:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for server reference")
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/unknown", nil)
	server.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("unknown status = %d, want %d", rr.Code, http.StatusNotFound)
	}

	rr = httptest.NewRecorder()
	req = newProxyJSONRequest(t, http.MethodGet, "https://feeds.example.com/feed.xml", nil)
	server.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("proxy status = %d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Body.String() != "<rss>ok</rss>" {
		t.Fatalf("proxy body = %q, want %q", rr.Body.String(), "<rss>ok</rss>")
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/healthz", nil)
	server.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("health status = %d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Body.String() != "ok" {
		t.Fatalf("health body = %q, want %q", rr.Body.String(), "ok")
	}

	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runCloudServer returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for server shutdown")
	}

	select {
	case <-shutdownCalled:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for shutdown")
	}

	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for sqlite close")
	}
}

func TestRunCloudServerReturnsMigrationErrorBeforeListen(t *testing.T) {

	t.Setenv(cloudDBEnv, filepath.Join(t.TempDir(), "cloud.db"))

	origRunMigrations := cloudRunSQLiteMigrations
	origListen := cloudListenAndServe
	t.Cleanup(func() {
		cloudRunSQLiteMigrations = origRunMigrations
		cloudListenAndServe = origListen
	})

	migrationErr := errors.New("migration failed")
	listenCalled := false

	cloudRunSQLiteMigrations = func(context.Context, *sql.DB) error {
		return migrationErr
	}
	cloudListenAndServe = func(_ context.Context, _ *http.Server) error {
		listenCalled = true
		return nil
	}

	err := runCloudServer(context.Background())
	if !errors.Is(err, migrationErr) {
		t.Fatalf("runCloudServer error = %v, want %v", err, migrationErr)
	}
	if listenCalled {
		t.Fatal("listen should not run when migrations fail")
	}
}

func TestRunCloudServerRequiresExplicitDBPath(t *testing.T) {

	t.Setenv(cloudDBEnv, "")

	err := runCloudServer(context.Background())
	if err == nil {
		t.Fatal("runCloudServer unexpectedly succeeded without READIO_CLOUD_DB_PATH")
	}
	if !strings.Contains(err.Error(), cloudDBEnv) {
		t.Fatalf("runCloudServer error = %v, want mention of %s", err, cloudDBEnv)
	}
}

func TestRunCloudServerRejectsRelativeDBPath(t *testing.T) {

	t.Setenv(cloudDBEnv, filepath.Join("state", "cloud.db"))

	err := runCloudServer(context.Background())
	if err == nil {
		t.Fatal("runCloudServer unexpectedly succeeded with relative READIO_CLOUD_DB_PATH")
	}
	if !strings.Contains(err.Error(), "absolute path") {
		t.Fatalf("runCloudServer error = %v, want mention of absolute path", err)
	}
}

func TestRunCloudServerReturnsListenErrorWithoutBlocking(t *testing.T) {

	t.Setenv(cloudDBEnv, filepath.Join(t.TempDir(), "cloud.db"))

	origOpen := cloudOpenSQLite
	origNewProxy := cloudNewProxyService
	origClose := cloudCloseSQLite
	origListen := cloudListenAndServe
	origShutdown := cloudShutdownServer
	origNotify := cloudNotifyContext
	t.Cleanup(func() {
		cloudOpenSQLite = origOpen
		cloudNewProxyService = origNewProxy
		cloudCloseSQLite = origClose
		cloudListenAndServe = origListen
		cloudShutdownServer = origShutdown
		cloudNotifyContext = origNotify
	})

	closed := make(chan struct{})
	shutdownCalled := false
	listenErr := errors.New("listen failed")

	cloudOpenSQLite = func(_ context.Context, _ string) (sqliteCloser, error) {
		return &testSQLiteHandle{closed: closed}, nil
	}
	cloudNewProxyService = func() *proxyService {
		return newProxyService()
	}
	cloudListenAndServe = func(_ context.Context, _ *http.Server) error {
		return listenErr
	}
	cloudShutdownServer = func(_ context.Context, _ *http.Server) error {
		shutdownCalled = true
		return nil
	}

	done := make(chan error, 1)
	go func() {
		done <- runCloudServer(context.Background())
	}()

	select {
	case err := <-done:
		if !errors.Is(err, listenErr) {
			t.Fatalf("runCloudServer error = %v, want %v", err, listenErr)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for listen failure")
	}

	if shutdownCalled {
		t.Fatal("shutdown should not run after immediate listen failure")
	}

	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for sqlite close")
	}
}

func TestRateLimiterSweepsExpiredBuckets(t *testing.T) {
	now := time.Unix(100, 0)
	limiter := newRateLimiter(2, time.Minute, func() time.Time {
		return now
	})

	if !limiter.allow("198.51.100.1") {
		t.Fatal("expected first request to pass")
	}

	now = now.Add(2 * time.Minute)

	if !limiter.allow("198.51.100.2") {
		t.Fatal("expected second key request to pass")
	}

	if _, ok := limiter.hits["198.51.100.1"]; ok {
		t.Fatal("expired key should have been swept")
	}
	if _, ok := limiter.hits["198.51.100.2"]; !ok {
		t.Fatal("active key should remain present")
	}
}
func TestProxyGetRangeForwarding(t *testing.T) {
	t.Run("POST proxy GET payload with Range header forwards Range to upstream", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodGet)
			}
			if got := r.Header.Get("Range"); got != "bytes=0-1023" {
				t.Fatalf("range = %q, want %q", got, "bytes=0-1023")
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Content-Range", "bytes 0-1023/2048")
			w.Header().Set("Accept-Ranges", "bytes")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = io.WriteString(w, "partial content")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range": "bytes=0-1023",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusPartialContent)
		}
		if *dialedAddress != "203.0.113.10:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "203.0.113.10:80")
		}
		if rr.Header().Get("Content-Range") != "bytes 0-1023/2048" {
			t.Fatalf("content-range = %q, want %q", rr.Header().Get("Content-Range"), "bytes 0-1023/2048")
		}
	})

	t.Run("POST proxy GET payload with If-Range header forwards If-Range to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("If-Range"); got != `"etag123"` {
				t.Fatalf("if-range = %q, want %q", got, `"etag123"`)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"If-Range": `"etag123"`,
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
	})

	t.Run("POST proxy GET payload with both Range and If-Range forwards both to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Range"); got != "bytes=500-1000" {
				t.Fatalf("range = %q, want %q", got, "bytes=500-1000")
			}
			if got := r.Header.Get("If-Range"); got != `"my-etag"` {
				t.Fatalf("if-range = %q, want %q", got, `"my-etag"`)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Content-Range", "bytes 500-1000/2048")
			w.WriteHeader(http.StatusPartialContent)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range":    "bytes=500-1000",
			"If-Range": `"my-etag"`,
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusPartialContent)
		}
	})

	t.Run("POST proxy GET payload with malformed Range returns 400", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("upstream should not be called with invalid Range header")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range": "garbage",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
	})

	t.Run("POST proxy GET payload without Range header streams full response", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodGet)
			}
			if got := r.Header.Get("Range"); got != "" {
				t.Fatalf("range = %q, want empty", got)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, "full content")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if *dialedAddress != "203.0.113.10:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "203.0.113.10:80")
		}
		if rr.Body.String() != "full content" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "full content")
		}
	})
}

func TestProxyDirectGetRouteForAudioFallback(t *testing.T) {
	t.Run("GET query request forwards allowlisted media headers to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodGet)
			}
			if got := r.Header.Get("Range"); got != "bytes=0-1023" {
				t.Fatalf("range = %q, want %q", got, "bytes=0-1023")
			}
			if got := r.Header.Get("If-Range"); got != `"etag123"` {
				t.Fatalf("if-range = %q, want %q", got, `"etag123"`)
			}
			if got := r.Header.Get("Authorization"); got != "" {
				t.Fatalf("authorization = %q, want empty", got)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Content-Range", "bytes 0-1023/2048")
			w.Header().Set("Accept-Ranges", "bytes")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = io.WriteString(w, "partial content")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range":         []string{"bytes=0-1023"},
			"If-Range":      []string{`"etag123"`},
			"Authorization": []string{"Bearer should-not-forward"},
		})
		req.Header.Set("Referer", testProxyAllowedOrigin+"/player")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusPartialContent)
		}
		if rr.Header().Get("Content-Range") != "bytes 0-1023/2048" {
			t.Fatalf("content-range = %q, want %q", rr.Header().Get("Content-Range"), "bytes 0-1023/2048")
		}
		if rr.Header().Get("Accept-Ranges") != "bytes" {
			t.Fatalf("accept-ranges = %q, want %q", rr.Header().Get("Accept-Ranges"), "bytes")
		}
	})

	t.Run("GET query request rejects missing url and malformed range before upstream", func(t *testing.T) {
		upstreamCalled := false
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			upstreamCalled = true
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy", nil)
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("missing url status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if upstreamCalled {
			t.Fatal("upstream called for missing url")
		}

		rr = httptest.NewRecorder()
		req = newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"items=1-2"},
		})
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("invalid range status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if upstreamCalled {
			t.Fatal("upstream called for invalid range")
		}

		rr = httptest.NewRecorder()
		req = newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"bytes=0-5", "bytes=10-20"},
		})
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("duplicate range status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if upstreamCalled {
			t.Fatal("upstream called for duplicate range")
		}
	})

	t.Run("GET query request rejects duplicate Range headers before upstream", func(t *testing.T) {
		upstreamCalled := false
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			upstreamCalled = true
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"bytes=0-10", "bytes=20-30"},
		})
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if upstreamCalled {
			t.Fatal("upstream called for duplicate range")
		}
	})

	t.Run("GET query request rejects originless public relay usage without same-origin referer", func(t *testing.T) {
		upstreamCalled := false
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			upstreamCalled = true
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("missing referer status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		if upstreamCalled {
			t.Fatal("upstream called for originless public relay request")
		}

		rr = httptest.NewRecorder()
		req = newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Referer", "https://attacker.example/player")
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("cross-origin referer status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		if upstreamCalled {
			t.Fatal("upstream called for cross-origin referer")
		}
	})

	t.Run("GET query request does not trust bare host for same-origin fallback", func(t *testing.T) {
		upstreamCalled := false
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			upstreamCalled = true
		}, testPublicLookupIP)
		proxy.allowedOrigins = nil

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		if upstreamCalled {
			t.Fatal("upstream called for bare-host same-origin fallback")
		}
	})

	t.Run("GET query request allows same-origin referer for audio fallback", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Range"); got != "bytes=0-10" {
				t.Fatalf("range = %q, want %q", got, "bytes=0-10")
			}
			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusPartialContent)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"bytes=0-10"},
		})
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Referer", testProxyAllowedOrigin+"/player")
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusPartialContent)
		}
	})

	t.Run("unsupported top-level method advertises GET and POST", func(t *testing.T) {
		proxy := newProxyService()
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPut, "/api/proxy", nil)
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusMethodNotAllowed)
		}
		if rr.Header().Get("Allow") != "GET, POST" {
			t.Fatalf("allow = %q, want %q", rr.Header().Get("Allow"), "GET, POST")
		}

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		if payload["message"] != "only GET and POST are allowed" {
			t.Fatalf("message = %q, want %q", payload["message"], "only GET and POST are allowed")
		}
	})
}

func TestProxyParseErrorsKeepAllowedOriginCORS(t *testing.T) {
	upstreamCalled := false
	proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
		upstreamCalled = true
	}, testPublicLookupIP)

	rr := httptest.NewRecorder()
	req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
		"Authorization": "Bearer should-fail",
	})
	req.RemoteAddr = "198.51.100.10:12345"
	proxy.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != testProxyAllowedOrigin {
		t.Fatalf("allow-origin = %q, want %q", got, testProxyAllowedOrigin)
	}
	assertProxyErrorPayload(t, rr.Body, "PROXY_UNSUPPORTED_HEADER")
	if upstreamCalled {
		t.Fatal("upstream called for invalid proxy headers")
	}
}

func TestProxyServiceMediaFallbackContract(t *testing.T) {
	t.Run("post head request preserves sizing headers and omits body", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodHead {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodHead)
			}
			if got := r.Header.Get("User-Agent"); got != proxyBrowserLikeUserAgent {
				t.Fatalf("user-agent = %q, want %q", got, proxyBrowserLikeUserAgent)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Content-Length", "12345")
			w.Header().Set("Accept-Ranges", "bytes")
			w.Header().Set("ETag", `"head-etag"`)
			w.Header().Set("Cache-Control", "public, max-age=60")
			w.Header().Set("X-Blocked", "hidden")
			w.WriteHeader(http.StatusOK)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodHead, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if *dialedAddress != "203.0.113.10:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "203.0.113.10:80")
		}
		if rr.Body.Len() != 0 {
			t.Fatalf("body length = %d, want %d", rr.Body.Len(), 0)
		}
		if rr.Header().Get("Content-Length") != "12345" {
			t.Fatalf("content-length = %q, want %q", rr.Header().Get("Content-Length"), "12345")
		}
		if rr.Header().Get("Accept-Ranges") != "bytes" {
			t.Fatalf("accept-ranges = %q, want %q", rr.Header().Get("Accept-Ranges"), "bytes")
		}
		if rr.Header().Get("ETag") != `"head-etag"` {
			t.Fatalf("etag = %q, want %q", rr.Header().Get("ETag"), `"head-etag"`)
		}
		if rr.Header().Get("X-Blocked") != "" {
			t.Fatalf("unexpected disallowed header passthrough: %q", rr.Header().Get("X-Blocked"))
		}
	})

	t.Run("range get returns 206 and passes through media headers", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodGet)
			}
			if got := r.Header.Get("Range"); got != "bytes=0-4" {
				t.Fatalf("range = %q, want %q", got, "bytes=0-4")
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Content-Length", "5")
			w.Header().Set("Content-Range", "bytes 0-4/10")
			w.Header().Set("Accept-Ranges", "bytes")
			w.Header().Set("ETag", `"range-etag"`)
			w.Header().Set("Cache-Control", "public, max-age=60")
			w.Header().Set("Vary", "Accept-Encoding")
			w.Header().Set("X-Blocked", "hidden")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = io.WriteString(w, "hello")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range": "bytes=0-4",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusPartialContent)
		}
		if *dialedAddress != "203.0.113.10:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "203.0.113.10:80")
		}
		if rr.Body.String() != "hello" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "hello")
		}
		if rr.Header().Get("Content-Range") != "bytes 0-4/10" {
			t.Fatalf("content-range = %q, want %q", rr.Header().Get("Content-Range"), "bytes 0-4/10")
		}
		if rr.Header().Get("Accept-Ranges") != "bytes" {
			t.Fatalf("accept-ranges = %q, want %q", rr.Header().Get("Accept-Ranges"), "bytes")
		}
		if rr.Header().Get("Content-Length") != "" {
			t.Fatalf("content-length = %q, want empty for streamed GET proxy response", rr.Header().Get("Content-Length"))
		}
		if rr.Header().Get("X-Blocked") != "" {
			t.Fatalf("unexpected disallowed header passthrough: %q", rr.Header().Get("X-Blocked"))
		}
	})

	t.Run("full get omits content-length to avoid downstream length mismatches", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodGet)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Content-Length", "56719585")
			w.Header().Set("Accept-Ranges", "bytes")
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, "audio-bytes")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if *dialedAddress != "203.0.113.10:80" {
			t.Fatalf("dialed address = %q, want %q", *dialedAddress, "203.0.113.10:80")
		}
		if rr.Body.String() != "audio-bytes" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "audio-bytes")
		}
		if rr.Header().Get("Content-Length") != "" {
			t.Fatalf("content-length = %q, want empty for streamed GET proxy response", rr.Header().Get("Content-Length"))
		}
		if rr.Header().Get("Accept-Ranges") != "bytes" {
			t.Fatalf("accept-ranges = %q, want %q", rr.Header().Get("Accept-Ranges"), "bytes")
		}
	})

	t.Run("range 416 passes through without collapsing", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Range"); got != "bytes=999-1000" {
				t.Fatalf("range = %q, want %q", got, "bytes=999-1000")
			}

			w.Header().Set("Content-Range", "bytes */10")
			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range": "bytes=999-1000",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusRequestedRangeNotSatisfiable {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusRequestedRangeNotSatisfiable)
		}
		if rr.Header().Get("Content-Range") != "bytes */10" {
			t.Fatalf("content-range = %q, want %q", rr.Header().Get("Content-Range"), "bytes */10")
		}
	})

	t.Run("follows a public redirect chain", func(t *testing.T) {
		lookupCalls := 0
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/start":
				w.Header().Set("Location", "http://other.example.com/final")
				w.WriteHeader(http.StatusFound)
			case "/final":
				if got := r.Host; got != "other.example.com" {
					t.Fatalf("host = %q, want %q", got, "other.example.com")
				}
				_, _ = io.WriteString(w, "done")
			default:
				t.Fatalf("unexpected path %q", r.URL.Path)
			}
		}, func(ctx context.Context, host string) ([]net.IPAddr, error) {
			lookupCalls++
			return testPublicLookupIP(ctx, host)
		})

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/start", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Body.String() != "done" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "done")
		}
		if lookupCalls < 2 {
			t.Fatalf("lookup calls = %d, want at least %d", lookupCalls, 2)
		}
	})

	t.Run("rejects unsupported proxy methods and invalid range headers", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatalf("upstream should not be reached")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodPut, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("method status = %d, want %d", rr.Code, http.StatusBadRequest)
		}

		rr = httptest.NewRecorder()
		req = newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range": "items=1-2",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("range status = %d, want %d", rr.Code, http.StatusBadRequest)
		}

		rr = httptest.NewRecorder()
		req = newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Authorization": "Bearer should-fail",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("header status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
	})

	t.Run("validator rejects duplicate range values", func(t *testing.T) {
		_, err := validateProxyForwardHeaders(http.Header{
			"Range": []string{"bytes=0-5", "bytes=10-20"},
		})
		if err == nil {
			t.Fatal("expected duplicate range validation error")
		}
	})

	t.Run("POST request rejects missing origin", func(t *testing.T) {
		upstreamCalled := false
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			upstreamCalled = true
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", nil)
		req.Header.Del("Origin")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		if upstreamCalled {
			t.Fatal("upstream called for missing-origin programmable proxy request")
		}
	})
}

func testPublicLookupIP(_ context.Context, _ string) ([]net.IPAddr, error) {
	return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
}

func TestValidateProxyForwardHeadersRejectsDuplicateRangeValues(t *testing.T) {
	headers := http.Header{
		"Range": []string{"bytes=0-10", "bytes=20-30"},
	}

	_, err := validateProxyForwardHeaders(headers)
	if err == nil {
		t.Fatal("expected duplicate range header to be rejected")
	}

	var proxyErr *proxyError
	if !errors.As(err, &proxyErr) {
		t.Fatalf("expected proxyError, got %T", err)
	}
	if proxyErr.status != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", proxyErr.status, http.StatusBadRequest)
	}
	if proxyErr.message != "invalid range header" {
		t.Fatalf("message = %q, want %q", proxyErr.message, "invalid range header")
	}
}

func newMediaProxyTestService(
	t *testing.T,
	handler http.HandlerFunc,
	lookupIP func(context.Context, string) ([]net.IPAddr, error),
) (*proxyService, *string) {
	t.Helper()

	backend := httptest.NewServer(handler)
	t.Cleanup(backend.Close)

	dialedAddress := ""
	if lookupIP == nil {
		lookupIP = testPublicLookupIP
	}

	proxy := &proxyService{
		lookupIP: lookupIP,
		dialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			dialedAddress = address
			var d net.Dialer
			return d.DialContext(ctx, network, backend.Listener.Addr().String())
		},
		limiter:        newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
		timeout:        200 * time.Millisecond,
		userAgent:      proxyBrowserLikeUserAgent,
		bodyLimit:      proxyBodyLimit,
		allowedOrigins: []string{testProxyAllowedOrigin},
	}

	return proxy, &dialedAddress
}

func newProxyJSONRequest(t *testing.T, method, targetURL string, headers map[string]string) *http.Request {
	t.Helper()

	payload := proxyRequestPayload{
		URL:     targetURL,
		Method:  method,
		Headers: headers,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal proxy payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/proxy", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", testProxyAllowedOrigin)
	return req
}

func newProxyQueryRequest(t *testing.T, targetURL string, headers http.Header) *http.Request {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/api/proxy?url="+url.QueryEscape(targetURL), nil)
	for name, values := range headers {
		for _, value := range values {
			req.Header.Add(name, value)
		}
	}
	return req
}

type testSQLiteHandle struct {
	closed chan struct{}
}

func (h *testSQLiteHandle) Close() error {
	select {
	case <-h.closed:
	default:
		close(h.closed)
	}

	return nil
}

type proxyRoundTripper struct {
	statusCode int
	body       string
	headers    http.Header
	delay      time.Duration
	onRequest  func(*http.Request)
}

func (rt *proxyRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if rt.onRequest != nil {
		rt.onRequest(req)
	}

	if rt.delay > 0 {
		timer := time.NewTimer(rt.delay)
		defer timer.Stop()

		select {
		case <-timer.C:
		case <-req.Context().Done():
			return nil, req.Context().Err()
		}
	}

	headers := make(http.Header)
	for key, values := range rt.headers {
		headers[key] = append([]string(nil), values...)
	}

	return &http.Response{
		StatusCode: rt.statusCode,
		Header:     headers,
		Body:       io.NopCloser(strings.NewReader(rt.body)),
		Request:    req,
	}, nil
}
