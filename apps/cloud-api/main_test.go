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

	"github.com/stretchr/testify/require"
	"readio-cloud/internal/admin"
	"readio-cloud/internal/asr"
	"readio-cloud/internal/discovery"
	"readio-cloud/internal/httputil"
	"readio-cloud/internal/podcastindex"
)

// newRateLimiter is a test helper that wraps httputil.NewRateLimiter.
func newRateLimiter(limit int, window time.Duration, now func() time.Time) *httputil.RateLimiter {
	return httputil.NewRateLimiter(limit, window, now)
}

func decodeResponseJSON(t *testing.T, body interface{ String() string }, dest any) {
	t.Helper()
	err := json.Unmarshal([]byte(body.String()), dest)
	require.NoError(t, err)
}

const testProxyAllowedOrigin = "https://app.readio.test"

func TestProxyRequestSummaryEmitsCanonicalUpstreamFields(t *testing.T) {
	rb := admin.NewAdminRingBuffer(10)
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(admin.NewAdminSlogHandler(
		slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}),
		rb,
	)))
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	proxy, _ := newMediaProxyTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/audio.mp3", r.URL.Path)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = io.WriteString(w, "ok")
	}), nil)

	reqURL := "http://media.example.com/audio.mp3"
	req := newProxyJSONRequest(t, http.MethodGet, reqURL, nil)
	rr := httptest.NewRecorder()
	proxy.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	snap := rb.Snapshot()
	require.Len(t, snap, 1)
	entry := snap[0]
	require.Equal(t, "proxy/media", entry.Route)
	require.Equal(t, "proxy", entry.UpstreamKind)
	require.Equal(t, "media.example.com", entry.UpstreamHost)
	require.Equal(t, "none", entry.ErrorClass)
	require.Equal(t, http.StatusOK, entry.Status)
}

func TestProxyRequestSummaryUsesActualProxyErrorStatus(t *testing.T) {
	rb := admin.NewAdminRingBuffer(10)
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(admin.NewAdminSlogHandler(
		slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}),
		rb,
	)))
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	proxy := newProxyService()
	req := httptest.NewRequest(http.MethodPut, "/api/proxy", nil)
	rr := httptest.NewRecorder()
	proxy.ServeHTTP(rr, req)

	require.Equal(t, http.StatusMethodNotAllowed, rr.Code)

	snap := rb.Snapshot()
	var entry *admin.LogEntry
	for i := range snap {
		if snap[i].Route == "proxy/media" {
			entry = &snap[i]
		}
	}
	if entry == nil {
		t.Fatalf("proxy/media log entry not found in snapshot: %#v", snap)
		return
	}
	require.Equal(t, http.StatusMethodNotAllowed, entry.Status)
	require.Equal(t, "invalid_method", entry.ErrorClass)
}

func assertProxyErrorPayload(t *testing.T, body interface{ String() string }, wantCode string) {
	t.Helper()

	var payload map[string]string
	decodeResponseJSON(t, body, &payload)

	require.Equal(t, wantCode, payload["code"])
	require.NotEqual(t, "", strings.TrimSpace(payload["message"]))
	require.NotEqual(t, "", strings.TrimSpace(payload["request_id"]))
}

func TestCloudMuxServesDynamicJSONConfig(t *testing.T) {
	t.Setenv("READIO_APP_NAME", "Readio Cloud")
	t.Setenv("READIO_APP_VERSION", "2.0.0")
	t.Setenv(asr.RelayPublicTokenEnv, "relay-public-token")
	t.Setenv("READIO_ASR_PROVIDER", "groq")
	t.Setenv("READIO_ASR_MODEL", "whisper-large-v3")
	t.Setenv("READIO_ENABLED_ASR_PROVIDERS", "groq")
	t.Setenv("READIO_EN_DICTIONARY_API_TRANSPORT", "direct")
	t.Setenv("READIO_DEFAULT_LANGUAGE", "zh")
	t.Setenv("VITE_GRAFANA_FARO_URL", "https://faro.example.com/collect")
	t.Setenv("VITE_GRAFANA_FARO_APP_NAME", "readio-cloud")
	t.Setenv("VITE_GRAFANA_FARO_ENV", "production")
	t.Setenv("VITE_GRAFANA_FARO_SAMPLE_RATE", "0.25")
	t.Setenv(cloudDBEnv, "/srv/readio/data/readio.db")
	t.Setenv("ASR_RELAY_ALLOWED_ORIGINS", "https://readio.example")
	t.Setenv("ASR_RELAY_RATE_LIMIT_BURST", "9")
	t.Setenv("ASR_RELAY_RATE_LIMIT_WINDOW_MS", "1500")
	t.Setenv("PORT", "8080")

	mux := newCloudMux(http.NotFoundHandler(), http.NotFoundHandler(), http.NotFoundHandler())

	req := httptest.NewRequest(http.MethodGet, browserConfigRoute, nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	got := rr.Header().Get("Content-Type")
	require.Equal(t, "application/json; charset=utf-8", got)

	var payload map[string]any
	err := json.Unmarshal(rr.Body.Bytes(), &payload)
	require.NoError(t, err)

	require.Equal(t, "Readio Cloud", payload["READIO_APP_NAME"])
	require.Equal(t, "relay-public-token", payload["READIO_ASR_RELAY_PUBLIC_TOKEN"])
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

	require.Len(t, gotFaroKeys, len(wantFaroKeys))
	for i := range wantFaroKeys {
		require.Equal(t, wantFaroKeys[i], gotFaroKeys[i])
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
	require.NoError(t, err)

	var artifact []string
	err = json.Unmarshal(data, &artifact)
	require.NoError(t, err)

	require.Len(t, artifact, len(browserEnvAllowlist))

	for i := range browserEnvAllowlist {
		require.Equal(t, browserEnvAllowlist[i], artifact[i])
	}
}

func TestResolveCloudDBPathUsesEnvOverride(t *testing.T) {
	want := filepath.Join(t.TempDir(), "cloud.db")
	t.Setenv(cloudDBEnv, want)

	got, err := resolveCloudDBPath()
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestResolveCloudDBPathRequiresExplicitEnv(t *testing.T) {
	t.Setenv(cloudDBEnv, "")

	_, err := resolveCloudDBPath()
	require.NotNil(t, err)
	require.Contains(t, err.Error(), cloudDBEnv)
}

func TestResolveCloudDBPathRejectsRelativePath(t *testing.T) {
	t.Setenv(cloudDBEnv, filepath.Join("state", "cloud.db"))

	_, err := resolveCloudDBPath()
	require.NotNil(t, err)
	require.Contains(t, err.Error(), "absolute path")
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
			require.Equal(t, tc.wantBurst, got)
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
			require.Equal(t, tc.wantWindow, got)
		})
	}
}

func TestProxyServiceUsesConfiguredRateLimitBurst(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "2")

	proxy := newProxyService()
	require.NotNil(t, proxy.limiter)

	require.Equal(t, 2, proxy.limiter.Limit)
}

func TestProxyServiceRateLimiterDisableWhenBurstZero(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "0")

	proxy := newProxyService()
	require.NotNil(t, proxy.limiter)

	require.Equal(t, 0, proxy.limiter.Limit)

	for i := 0; i < 100; i++ {
		require.True(t, proxy.limiter.Allow("198.51.100.10"))
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

	require.Equal(t, proxyRateLimitBurst, got)
	require.Contains(t, logs.String(), proxyRateLimitBurstEnv)
}

func TestProxyServiceRateLimiterDisableWhenBurstNegative(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "-5")

	proxy := newProxyService()
	require.NotNil(t, proxy.limiter)

	require.Equal(t, -5, proxy.limiter.Limit)

	require.True(t, proxy.allowRequest("198.51.100.10"))
}

func TestProxyServiceRateLimiterDisableWhenBurstMinusOne(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "-1")

	proxy := newProxyService()
	require.NotNil(t, proxy.limiter)

	require.Equal(t, -1, proxy.limiter.Limit)

	for i := 0; i < 100; i++ {
		require.True(t, proxy.limiter.Allow("198.51.100.10"))
	}
}

func TestProxyServiceRateLimiterReenableWhenBurstOne(t *testing.T) {
	t.Setenv(proxyRateLimitBurstEnv, "1")

	proxy := newProxyService()
	require.NotNil(t, proxy.limiter)

	require.Equal(t, 1, proxy.limiter.Limit)

	require.True(t, proxy.limiter.Allow("198.51.100.10"))

	if proxy.limiter.Allow("198.51.100.10") {
		t.Fatal("expected second request to be rate limited with burst=1")
	}
}

func TestProxyServiceUsesConfiguredRateLimitWindow(t *testing.T) {
	t.Setenv(proxyRateLimitWindowMsEnv, "5000")

	proxy := newProxyService()
	require.NotNil(t, proxy.limiter)

	require.Equal(t, 5*time.Second, proxy.limiter.Window)
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
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})

	db.SetMaxIdleConns(0)
	db.SetMaxOpenConns(2)

	ctx := context.Background()
	conn1, err := db.Conn(ctx)
	require.NoError(t, err)
	defer func() { _ = conn1.Close() }()

	conn2, err := db.Conn(ctx)
	require.NoError(t, err)
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
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})

	_, err = os.Stat(dbPath)

	require.NoError(t, err)

	assertCloudSQLitePragmas(t, context.Background(), db)

	var gooseTableCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'goose_db_version';",
	).Scan(&gooseTableCount); err != nil {
		t.Fatalf("query goose table: %v", err)
	}
	require.Equal(t, 1, gooseTableCount)
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
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})
}

func assertCloudSQLitePragmas(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()

	var journalMode string
	err := db.QueryRowContext(ctx, "PRAGMA journal_mode;").Scan(&journalMode)
	require.NoError(t, err)
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
	err := queryer.QueryRowContext(ctx, "PRAGMA synchronous;").Scan(&synchronous)
	require.NoError(t, err)
	require.Equal(t, 1, synchronous)

	var foreignKeys int
	err = queryer.QueryRowContext(ctx, "PRAGMA foreign_keys;").Scan(&foreignKeys)
	require.NoError(t, err)
	require.Equal(t, 1, foreignKeys)

	var busyTimeout int
	err = queryer.QueryRowContext(ctx, "PRAGMA busy_timeout;").Scan(&busyTimeout)
	require.NoError(t, err)
	require.Equal(t, 5000, busyTimeout)
}

func TestOpenCloudSQLiteMigrationsAreIdempotentAcrossRestarts(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")

	db1, err := openCloudSQLite(context.Background(), dbPath)
	require.NoError(t, err)
	err = db1.Close()
	require.NoError(t, err)

	db2, err := openCloudSQLite(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db2.Close()
	})

	var version int64
	err = db2.QueryRowContext(context.Background(), "SELECT MAX(version_id) FROM goose_db_version;").Scan(&version)
	require.NoError(t, err)
	if version < 1 {
		t.Fatalf("goose version = %d, want >= 1", version)
	}
}

func TestRunCloudSQLiteMigrationsRetriesAfterFailedAttempt(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	db, err := openCloudSQLite(context.Background(), dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
	})

	badMigrations := fstest.MapFS{
		"migrations/00004_create_retry_table.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nCREATE TABLE retry_table (id INTEGER PRIMARY KEY);\n\n-- +goose Down\nDROP TABLE retry_table;\n"),
		},
		"migrations/00005_fail.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nTHIS IS NOT VALID SQL;\n\n-- +goose Down\nSELECT 1;\n"),
		},
	}

	err = runCloudSQLiteMigrationsFS(context.Background(), db, badMigrations, "migrations")
	require.NotNil(t, err)

	var retryTableCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'retry_table';",
	).Scan(&retryTableCount); err != nil {
		t.Fatalf("query retry table after failed run: %v", err)
	}
	require.Equal(t, 1, retryTableCount)

	fixedMigrations := fstest.MapFS{
		"migrations/00004_create_retry_table.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nCREATE TABLE retry_table (id INTEGER PRIMARY KEY);\n\n-- +goose Down\nDROP TABLE retry_table;\n"),
		},
		"migrations/00005_create_retry_index.sql": &fstest.MapFile{
			Data: []byte("-- +goose Up\nCREATE INDEX retry_table_id_idx ON retry_table (id);\n\n-- +goose Down\nDROP INDEX retry_table_id_idx;\n"),
		},
	}

	err = runCloudSQLiteMigrationsFS(context.Background(), db, fixedMigrations, "migrations")

	require.NoError(t, err)

	var retryIndexCount int
	if err := db.QueryRowContext(
		context.Background(),
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'retry_table_id_idx';",
	).Scan(&retryIndexCount); err != nil {
		t.Fatalf("query retry index after retry: %v", err)
	}
	require.Equal(t, 1, retryIndexCount)

	var latestVersion int64
	err = db.QueryRowContext(context.Background(), "SELECT MAX(version_id) FROM goose_db_version;").Scan(&latestVersion)
	require.NoError(t, err)
	require.Equal(t, int64(5), latestVersion)
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
	cloudNewProxyService = func() http.Handler {
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
		require.Equal(t, dbPath, gotPath)
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
	require.Equal(t, http.StatusNotFound, rr.Code)

	rr = httptest.NewRecorder()
	req = newProxyJSONRequest(t, http.MethodGet, "https://feeds.example.com/feed.xml", nil)
	server.Handler.ServeHTTP(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)
	require.Equal(t, "<rss>ok</rss>", rr.Body.String())

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/healthz", nil)
	server.Handler.ServeHTTP(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)
	require.Equal(t, "ok", rr.Body.String())

	cancel()

	select {
	case err := <-done:
		require.NoError(t, err)
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

func TestRunCloudServerInjectsPIEpisodeCacheStoreFromStartupDB(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "cloud.db")
	t.Setenv(cloudDBEnv, dbPath)

	origOpen := cloudOpenSQLite
	origClose := cloudCloseSQLite
	origNewDiscovery := cloudNewDiscoveryService
	origListen := cloudListenAndServe
	origShutdown := cloudShutdownServer
	t.Cleanup(func() {
		cloudOpenSQLite = origOpen
		cloudCloseSQLite = origClose
		cloudNewDiscoveryService = origNewDiscovery
		cloudListenAndServe = origListen
		cloudShutdownServer = origShutdown
	})

	openCount := 0
	var openedDB *sql.DB
	receivedStore := make(chan *podcastindex.PIEpisodeCacheStore, 1)
	listenStarted := make(chan struct{})
	shutdownCalled := make(chan struct{})

	cloudOpenSQLite = func(ctx context.Context, gotPath string) (sqliteCloser, error) {
		openCount++
		db, err := openCloudSQLite(ctx, gotPath)
		if err != nil {
			return nil, err
		}
		openedDB = db
		return db, nil
	}
	cloudCloseSQLite = func(db sqliteCloser) error {
		return db.Close()
	}
	cloudNewDiscoveryService = func(store *podcastindex.PIEpisodeCacheStore) http.Handler {
		receivedStore <- store
		return discovery.NewDiscoveryService(store)
	}
	cloudListenAndServe = func(ctx context.Context, _ *http.Server) error {
		close(listenStarted)
		<-ctx.Done()
		return http.ErrServerClosed
	}
	cloudShutdownServer = func(_ context.Context, _ *http.Server) error {
		close(shutdownCalled)
		return nil
	}

	parent, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- runCloudServer(parent)
	}()

	var store *podcastindex.PIEpisodeCacheStore
	select {
	case store = <-receivedStore:
	case <-time.After(time.Second):
		cancel()
		t.Fatal("timed out waiting for discovery service construction")
	}
	if store == nil {
		cancel()
		t.Fatal("PI episode cache store = nil, want injected store")
	}
	if openedDB == nil {
		cancel()
		t.Fatal("opened DB = nil, want startup-owned DB")
	}
	if store.DB() != openedDB {
		cancel()
		t.Fatal("PI episode cache store did not reuse startup-owned DB handle")
	}
	if openCount != 1 {
		cancel()
		t.Fatalf("sqlite open count = %d, want 1", openCount)
	}

	select {
	case <-listenStarted:
	case <-time.After(time.Second):
		cancel()
		t.Fatal("timed out waiting for server start")
	}

	cancel()

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for server shutdown")
	}

	select {
	case <-shutdownCalled:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for shutdown")
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
	require.False(t, listenCalled)
}

func TestRunCloudServerRequiresExplicitDBPath(t *testing.T) {

	t.Setenv(cloudDBEnv, "")

	err := runCloudServer(context.Background())
	require.NotNil(t, err)
	require.Contains(t, err.Error(), cloudDBEnv)
}

func TestRunCloudServerRejectsRelativeDBPath(t *testing.T) {

	t.Setenv(cloudDBEnv, filepath.Join("state", "cloud.db"))

	err := runCloudServer(context.Background())
	require.NotNil(t, err)
	require.Contains(t, err.Error(), "absolute path")
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
	cloudNewProxyService = func() http.Handler {
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

	require.False(t, shutdownCalled)

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

	require.True(t, limiter.Allow("198.51.100.1"))

	now = now.Add(2 * time.Minute)

	require.True(t, limiter.Allow("198.51.100.2"))

	if limiter.HasKey("198.51.100.1") {
		t.Fatal("expired key should have been swept")
	}
	require.True(t, limiter.HasKey("198.51.100.2"))
}
func TestProxyGetRangeForwarding(t *testing.T) {
	t.Run("POST proxy GET payload with Range header forwards Range to upstream", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)
			got := r.Header.Get("Range")
			require.Equal(t, "bytes=0-1023", got)

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

		require.Equal(t, http.StatusPartialContent, rr.Code)
		require.Equal(t, "203.0.113.10:80", *dialedAddress)
		require.Equal(t, "bytes 0-1023/2048", rr.Header().Get("Content-Range"))
	})

	t.Run("POST proxy GET payload with If-Range header forwards If-Range to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("If-Range")
			require.Equal(t, `"etag123"`, got)

			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"If-Range": `"etag123"`,
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("POST proxy GET payload with both Range and If-Range forwards both to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			gotRange := r.Header.Get("Range")
			require.Equal(t, "bytes=500-1000", gotRange)
			gotIfRange := r.Header.Get("If-Range")
			require.Equal(t, `"my-etag"`, gotIfRange)

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

		require.Equal(t, http.StatusPartialContent, rr.Code)
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

		require.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("POST proxy GET payload without Range header streams full response", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)
			got := r.Header.Get("Range")
			require.Equal(t, "", got)

			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, "full content")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, "203.0.113.10:80", *dialedAddress)
		require.Equal(t, "full content", rr.Body.String())
	})
}

func TestProxyDirectGetRouteForAudioFallback(t *testing.T) {
	t.Run("GET query request forwards allowlisted media headers to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)
			gotRange := r.Header.Get("Range")
			require.Equal(t, "bytes=0-1023", gotRange)
			gotIfRange := r.Header.Get("If-Range")
			require.Equal(t, `"etag123"`, gotIfRange)
			gotAuthorization := r.Header.Get("Authorization")
			require.Equal(t, "", gotAuthorization)

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
		req.Header.Set("Origin", testProxyAllowedOrigin)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusPartialContent, rr.Code)
		require.Equal(t, "bytes 0-1023/2048", rr.Header().Get("Content-Range"))
		require.Equal(t, "bytes", rr.Header().Get("Accept-Ranges"))
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

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.False(t, upstreamCalled)

		rr = httptest.NewRecorder()
		req = newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"items=1-2"},
		})
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.False(t, upstreamCalled)

		rr = httptest.NewRecorder()
		req = newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"bytes=0-5", "bytes=10-20"},
		})
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.False(t, upstreamCalled)
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

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.False(t, upstreamCalled)
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

		require.Equal(t, http.StatusForbidden, rr.Code)
		require.False(t, upstreamCalled)

		rr = httptest.NewRecorder()
		req = newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Referer", "https://attacker.example/player")
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusForbidden, rr.Code)
		require.False(t, upstreamCalled)
	})

	t.Run("GET query request rejects originless same-origin referer fallback", func(t *testing.T) {
		upstreamCalled := false
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, _ *http.Request) {
			upstreamCalled = true
			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
		}, testPublicLookupIP)
		proxy.allowedOrigins = nil

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Referer", "http://"+req.Host+"/player")
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusForbidden, rr.Code)
		require.False(t, upstreamCalled)
	})

	t.Run("GET query request allows configured origin for audio fallback", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("Range")
			require.Equal(t, "bytes=0-10", got)
			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusPartialContent)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyQueryRequest(t, "http://feeds.example.com/audio.mp3", http.Header{
			"Range": []string{"bytes=0-10"},
		})
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Origin", testProxyAllowedOrigin)
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusPartialContent, rr.Code)
	})

	t.Run("unsupported top-level method advertises GET and POST", func(t *testing.T) {
		proxy := newProxyService()
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPut, "/api/proxy", nil)
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusMethodNotAllowed, rr.Code)
		require.Equal(t, "GET, POST", rr.Header().Get("Allow"))

		var payload map[string]string
		decodeResponseJSON(t, rr.Body, &payload)
		require.Equal(t, "only GET and POST are allowed", payload["message"])
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

	require.Equal(t, http.StatusBadRequest, rr.Code)
	got := rr.Header().Get("Access-Control-Allow-Origin")
	require.Equal(t, testProxyAllowedOrigin, got)
	assertProxyErrorPayload(t, rr.Body, "PROXY_UNSUPPORTED_HEADER")
	require.False(t, upstreamCalled)
}

func TestProxyServiceMediaFallbackContract(t *testing.T) {
	t.Run("post head request preserves sizing headers and omits body", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodHead, r.Method)
			got := r.Header.Get("User-Agent")
			require.Equal(t, proxyBrowserLikeUserAgent, got)

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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, "203.0.113.10:80", *dialedAddress)
		require.Equal(t, 0, rr.Body.Len())
		require.Equal(t, "12345", rr.Header().Get("Content-Length"))
		require.Equal(t, "bytes", rr.Header().Get("Accept-Ranges"))
		require.Equal(t, `"head-etag"`, rr.Header().Get("ETag"))
		require.Equal(t, "", rr.Header().Get("X-Blocked"))
	})

	t.Run("range get returns 206 and passes through media headers", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)
			got := r.Header.Get("Range")
			require.Equal(t, "bytes=0-4", got)

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

		require.Equal(t, http.StatusPartialContent, rr.Code)
		require.Equal(t, "203.0.113.10:80", *dialedAddress)
		require.Equal(t, "hello", rr.Body.String())
		require.Equal(t, "bytes 0-4/10", rr.Header().Get("Content-Range"))
		require.Equal(t, "bytes", rr.Header().Get("Accept-Ranges"))
		require.Equal(t, "", rr.Header().Get("Content-Length"))
		require.Equal(t, "", rr.Header().Get("X-Blocked"))
	})

	t.Run("full get omits content-length to avoid downstream length mismatches", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)

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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, "203.0.113.10:80", *dialedAddress)
		require.Equal(t, "audio-bytes", rr.Body.String())
		require.Equal(t, "", rr.Header().Get("Content-Length"))
		require.Equal(t, "bytes", rr.Header().Get("Accept-Ranges"))
	})

	t.Run("range 416 passes through without collapsing", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("Range")
			require.Equal(t, "bytes=999-1000", got)

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

		require.Equal(t, http.StatusRequestedRangeNotSatisfiable, rr.Code)
		require.Equal(t, "bytes */10", rr.Header().Get("Content-Range"))
	})

	t.Run("follows a public redirect chain", func(t *testing.T) {
		lookupCalls := 0
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/start":
				w.Header().Set("Location", "http://other.example.com/final")
				w.WriteHeader(http.StatusFound)
			case "/final":
				got := r.Host
				require.Equal(t, "other.example.com", got)
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, "done", rr.Body.String())
		require.Equal(t, 2, lookupCalls)
	})

	t.Run("uses redirect addresses validated during redirect check", func(t *testing.T) {
		redirectLookups := 0
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/start":
				w.Header().Set("Location", "http://other.example.com/final")
				w.WriteHeader(http.StatusFound)
			case "/final":
				_, _ = io.WriteString(w, "done")
			default:
				t.Fatalf("unexpected path %q", r.URL.Path)
			}
		}, func(_ context.Context, host string) ([]net.IPAddr, error) {
			if host == "other.example.com" {
				redirectLookups++
				if redirectLookups > 1 {
					return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
				}
			}
			return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
		})

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/start", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, "done", rr.Body.String())
		require.Equal(t, 1, redirectLookups)
	})

	t.Run("rejects unsupported proxy methods and invalid range headers", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatalf("upstream should not be reached")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := newProxyJSONRequest(t, http.MethodPut, "http://feeds.example.com/audio.mp3", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)
		require.Equal(t, http.StatusBadRequest, rr.Code)

		rr = httptest.NewRecorder()
		req = newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Range": "items=1-2",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)
		require.Equal(t, http.StatusBadRequest, rr.Code)

		rr = httptest.NewRecorder()
		req = newProxyJSONRequest(t, http.MethodGet, "http://feeds.example.com/audio.mp3", map[string]string{
			"Authorization": "Bearer should-fail",
		})
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)
		require.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("validator rejects duplicate range values", func(t *testing.T) {
		_, err := validateProxyForwardHeaders(http.Header{
			"Range": []string{"bytes=0-5", "bytes=10-20"},
		})
		require.NotNil(t, err)
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

		require.Equal(t, http.StatusForbidden, rr.Code)
		require.False(t, upstreamCalled)
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
	require.NotNil(t, err)

	var proxyErr *proxyError
	if !errors.As(err, &proxyErr) {
		t.Fatalf("expected proxyError, got %T", err)
	}
	require.Equal(t, http.StatusBadRequest, proxyErr.Status)
	require.Equal(t, "invalid range header", proxyErr.Message)
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
	require.NoError(t, err)

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
