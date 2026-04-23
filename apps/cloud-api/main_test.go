package main

import (
	"bufio"
	"context"
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
	"strings"
	"testing"
	"time"
)

func TestAppHandlerServesStaticFilesAndSPA(t *testing.T) {
	indexDir := t.TempDir()
	distDir := filepath.Join(indexDir, "apps", "cloud-ui", "dist")
	if err := os.MkdirAll(filepath.Join(distDir, "assets"), 0o755); err != nil {
		t.Fatalf("mkdir dist: %v", err)
	}

	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	if err := os.WriteFile(filepath.Join(distDir, "assets", "app.js"), []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	if err := os.WriteFile(filepath.Join(distDir, "robots"), []byte("User-agent: *"), 0o644); err != nil {
		t.Fatalf("write extensionless asset: %v", err)
	}

	handler, err := newAppHandler(distDir)
	if err != nil {
		t.Fatalf("new app handler: %v", err)
	}

	t.Run("serves index for root", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Body.String() != "index" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "index")
		}
	})

	t.Run("serves spa fallback for client routes", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/settings/library", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Body.String() != "index" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "index")
		}
	})

	t.Run("serves static asset when present", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Body.String() != "console.log('ok')" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "console.log('ok')")
		}
	})

	t.Run("serves extensionless asset when present", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/robots", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Body.String() != "User-agent: *" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "User-agent: *")
		}
	})

	t.Run("rejects api routes before spa fallback", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://example.com", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
	})

	t.Run("rejects bare api route before spa fallback", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
	})

	t.Run("returns 404 for missing asset path", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
	})
}

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
	req := httptest.NewRequest(http.MethodGet, "/api/proxy?url="+url.QueryEscape(reqURL), nil)
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
	req := httptest.NewRequest(http.MethodPut, "/api/proxy?url="+url.QueryEscape("https://media.example.com/audio.mp3"), nil)
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

func TestCloudMuxServesDynamicEnvBeforeStaticFallback(t *testing.T) {
	indexDir := t.TempDir()
	distDir := filepath.Join(indexDir, "dist")
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		t.Fatalf("mkdir dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "env.js"), []byte("static-env"), 0o644); err != nil {
		t.Fatalf("write static env: %v", err)
	}

	app, err := newAppHandler(distDir)
	if err != nil {
		t.Fatalf("new app handler: %v", err)
	}

	t.Setenv("READIO_APP_NAME", "Readio Cloud")
	t.Setenv("READIO_APP_VERSION", "2.0.0")
	t.Setenv(asrRelayPublicTokenEnv, "relay-public-token")
	t.Setenv("READIO_ASR_PROVIDER", "groq")
	t.Setenv("READIO_ASR_MODEL", "whisper-large-v3")
	t.Setenv("READIO_ENABLED_ASR_PROVIDERS", "groq")
	t.Setenv("READIO_EN_DICTIONARY_API_TRANSPORT", "direct")
	t.Setenv("READIO_DEFAULT_LANGUAGE", "zh")
	t.Setenv(cloudDBEnv, "/srv/readio/data/readio.db")
	t.Setenv(cloudUIDistEnv, "/srv/readio/current/dist")
	t.Setenv(asrRelayAllowedOriginsEnv, "https://readio.example")
	t.Setenv(asrRelayRateLimitBurstEnv, "9")
	t.Setenv(asrRelayRateLimitWindowMsEnv, "1500")
	t.Setenv("PORT", "8080")

	mux := newCloudMux(app, http.NotFoundHandler(), http.NotFoundHandler(), http.NotFoundHandler())

	req := httptest.NewRequest(http.MethodGet, browserEnvRoute, nil)
	req.Host = "cloud.example"
	req.Header.Set("X-Forwarded-Proto", "https")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if got := rr.Header().Get("Content-Type"); got != "application/javascript; charset=utf-8" {
		t.Fatalf("content-type = %q, want %q", got, "application/javascript; charset=utf-8")
	}
	if got := rr.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("cache-control = %q, want %q", got, "no-store")
	}
	if rr.Body.String() == "static-env" {
		t.Fatalf("/env.js fell back to static file instead of dynamic handler")
	}

	body := strings.TrimSpace(rr.Body.String())
	const prefix = "window.__READIO_ENV__ = "
	if !strings.HasPrefix(body, prefix) || !strings.HasSuffix(body, ";") {
		t.Fatalf("unexpected body = %q", body)
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSuffix(strings.TrimPrefix(body, prefix), ";")), &payload); err != nil {
		t.Fatalf("unmarshal env payload: %v", err)
	}

	if payload["READIO_APP_NAME"] != "Readio Cloud" {
		t.Fatalf("READIO_APP_NAME = %#v, want %#v", payload["READIO_APP_NAME"], "Readio Cloud")
	}
	if payload["READIO_ASR_RELAY_PUBLIC_TOKEN"] != "relay-public-token" {
		t.Fatalf("READIO_ASR_RELAY_PUBLIC_TOKEN = %#v, want %#v", payload["READIO_ASR_RELAY_PUBLIC_TOKEN"], "relay-public-token")
	}
	for _, key := range browserEnvAllowlist {
		if _, ok := payload[key]; !ok {
			t.Fatalf("payload missing expected allowlist key %s", key)
		}
	}

	for _, forbidden := range []string{
		"PORT",
		"READIO_CLOUD_DB_PATH",
		"READIO_CLOUD_UI_DIST_DIR",
		"READIO_ASR_ALLOWED_ORIGINS",
		"READIO_ASR_RATE_LIMIT_BURST",
		"READIO_ASR_RATE_LIMIT_WINDOW_MS",
		"READIO_PROXY_RATE_LIMIT_BURST",
		"READIO_PROXY_RATE_LIMIT_WINDOW_MS",
		"READIO_ASR_API_KEY",
		"READIO_OPENAI_API_KEY",
	} {
		if _, ok := payload[forbidden]; ok {
			t.Fatalf("payload unexpectedly exposed %s", forbidden)
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

func TestResolveCloudUIDistDirFindsRepoRootFromWorkingDirectory(t *testing.T) {
	root := t.TempDir()
	distDir := filepath.Join(root, "apps", "cloud-ui", "dist")
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		t.Fatalf("mkdir dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	workDir := filepath.Join(root, "apps", "cloud-api")
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		t.Fatalf("mkdir work dir: %v", err)
	}

	oldWd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(workDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(oldWd)
	})

	resolved, err := resolveCloudUIDistDir()
	if err != nil {
		t.Fatalf("resolve cloud-ui dist: %v", err)
	}

	resolvedRealPath, err := filepath.EvalSymlinks(resolved)
	if err != nil {
		t.Fatalf("eval resolved path: %v", err)
	}

	distRealPath, err := filepath.EvalSymlinks(distDir)
	if err != nil {
		t.Fatalf("eval dist path: %v", err)
	}

	if resolvedRealPath != distRealPath {
		t.Fatalf("resolved = %q (real %q), want %q (real %q)", resolved, resolvedRealPath, distDir, distRealPath)
	}
}

func TestResolveCloudUIDistDirUsesEnvOverride(t *testing.T) {
	distDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	t.Setenv(cloudUIDistEnv, distDir)

	resolved, err := resolveCloudUIDistDir()
	if err != nil {
		t.Fatalf("resolve cloud-ui dist: %v", err)
	}

	if resolved != distDir {
		t.Fatalf("resolved = %q, want %q", resolved, distDir)
	}
}

func TestResolveCloudUIDistDirUsesCoLocatedDist(t *testing.T) {
	root := t.TempDir()
	distDir := filepath.Join(root, "dist")
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		t.Fatalf("mkdir dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	oldWd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(oldWd)
	})

	resolved, err := resolveCloudUIDistDir()
	if err != nil {
		t.Fatalf("resolve cloud-ui dist: %v", err)
	}

	resolvedRealPath, err := filepath.EvalSymlinks(resolved)
	if err != nil {
		t.Fatalf("eval resolved path: %v", err)
	}

	distRealPath, err := filepath.EvalSymlinks(distDir)
	if err != nil {
		t.Fatalf("eval dist path: %v", err)
	}

	if resolvedRealPath != distRealPath {
		t.Fatalf("resolved = %q (real %q), want %q (real %q)", resolved, resolvedRealPath, distDir, distRealPath)
	}
}

func TestResolveCloudDBPathUsesEnvOverride(t *testing.T) {
	t.Setenv(cloudDBEnv, filepath.Join("state", "cloud.db"))

	if got := resolveCloudDBPath(); got != filepath.Join("state", "cloud.db") {
		t.Fatalf("path = %q, want %q", got, filepath.Join("state", "cloud.db"))
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

func TestOpenCloudSQLiteInitializesPragmasAndCreatesParentDir(t *testing.T) {
	if testing.Short() {
		t.Skip("sqlite bootstrap integration test")
	}

	dbPath := filepath.Join(t.TempDir(), "nested", "cloud.db")
	db, err := openCloudSQLite(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if _, err := os.Stat(filepath.Dir(dbPath)); err != nil {
		t.Fatalf("stat db dir: %v", err)
	}
	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("stat db file: %v", err)
	}

	var journalMode string
	if err := db.QueryRowContext(context.Background(), "PRAGMA journal_mode;").Scan(&journalMode); err != nil {
		t.Fatalf("query journal_mode: %v", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("journal_mode = %q, want %q", journalMode, "wal")
	}

	var synchronous int
	if err := db.QueryRowContext(context.Background(), "PRAGMA synchronous;").Scan(&synchronous); err != nil {
		t.Fatalf("query synchronous: %v", err)
	}
	if synchronous != 1 {
		t.Fatalf("synchronous = %d, want %d", synchronous, 1)
	}

	var foreignKeys int
	if err := db.QueryRowContext(context.Background(), "PRAGMA foreign_keys;").Scan(&foreignKeys); err != nil {
		t.Fatalf("query foreign_keys: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("foreign_keys = %d, want %d", foreignKeys, 1)
	}
}

func TestRunCloudServerInitializesSQLiteAndShutsDownOnCancellation(t *testing.T) {
	distDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	dbPath := filepath.Join(t.TempDir(), "nested", "cloud.db")
	t.Setenv(cloudUIDistEnv, distDir)
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
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
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
	if rr.Code != http.StatusOK {
		t.Fatalf("unknown status = %d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Body.String() != "index" {
		t.Fatalf("unknown body = %q, want %q", rr.Body.String(), "index")
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
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

func TestRunCloudServerReturnsListenErrorWithoutBlocking(t *testing.T) {
	distDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	t.Setenv(cloudUIDistEnv, distDir)
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

func TestProxyRouteOwnershipAndContracts(t *testing.T) {
	t.Run("proxy route wins over spa fallback", func(t *testing.T) {
		distDir := t.TempDir()
		if err := os.MkdirAll(distDir, 0o755); err != nil {
			t.Fatalf("mkdir dist: %v", err)
		}
		if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
			t.Fatalf("write index: %v", err)
		}

		app, err := newAppHandler(distDir)
		if err != nil {
			t.Fatalf("new app handler: %v", err)
		}

		called := 0
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusOK,
					body:       "<rss>ok</rss>",
					headers: http.Header{
						"Content-Type": []string{"application/xml"},
					},
					onRequest: func(_ *http.Request) {
						called++
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		mux := http.NewServeMux()
		mux.Handle(proxyRoute, proxy)
		mux.Handle("/", app)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if called != 1 {
			t.Fatalf("upstream call count = %d, want %d", called, 1)
		}
		if rr.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("acao = %q, want empty", rr.Header().Get("Access-Control-Allow-Origin"))
		}
		if rr.Body.String() != "<rss>ok</rss>" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "<rss>ok</rss>")
		}

		rr = httptest.NewRecorder()
		req = httptest.NewRequest(http.MethodGet, "/api/other", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		mux.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
	})

	t.Run("rejects invalid and blocked targets", func(t *testing.T) {
		called := 0
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					onRequest: func(_ *http.Request) {
						called++
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		tests := []struct {
			name       string
			target     string
			wantStatus int
		}{
			{name: "missing", target: "", wantStatus: http.StatusBadRequest},
			{name: "invalid scheme", target: "ftp://example.com/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "localhost", target: "http://localhost/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "loopback v4", target: "http://127.0.0.1/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "loopback v6", target: "http://[::1]/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "private", target: "http://10.0.0.1/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "metadata", target: "http://169.254.169.254/feed.xml", wantStatus: http.StatusBadRequest},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				called = 0
				rr := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, "/api/proxy?url="+tc.target, nil)
				req.RemoteAddr = "198.51.100.10:12345"
				proxy.ServeHTTP(rr, req)

				if rr.Code != tc.wantStatus {
					t.Fatalf("status = %d, want %d", rr.Code, tc.wantStatus)
				}
				if called != 0 {
					t.Fatalf("upstream was called %d times, want %d", called, 0)
				}
			})
		}
	})

	t.Run("rejects hostname that resolves to private address", func(t *testing.T) {
		called := 0
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					onRequest: func(_ *http.Request) {
						called++
					},
				},
			},
			lookupIP: func(_ context.Context, host string) ([]net.IPAddr, error) {
				if host != "feeds.example.com" {
					t.Fatalf("lookup host = %q, want %q", host, "feeds.example.com")
				}

				return []net.IPAddr{{IP: net.ParseIP("10.0.0.8")}}, nil
			},
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if called != 0 {
			t.Fatalf("upstream was called %d times, want %d", called, 0)
		}
		if rr.Body.String() == "" {
			t.Fatalf("expected rejection body")
		}
	})

	t.Run("pins validated address on actual dial path", func(t *testing.T) {
		lookupCalls := 0
		dialedAddress := ""
		proxy := &proxyService{
			lookupIP: func(_ context.Context, host string) ([]net.IPAddr, error) {
				lookupCalls++
				if host != "feeds.example.com" {
					t.Fatalf("lookup host = %q, want %q", host, "feeds.example.com")
				}

				if lookupCalls == 1 {
					return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
				}

				return []net.IPAddr{{IP: net.ParseIP("10.0.0.8")}}, nil
			},
			dialContext: func(_ context.Context, _, address string) (net.Conn, error) {
				dialedAddress = address
				clientConn, serverConn := net.Pipe()
				go func() {
					defer func() { _ = serverConn.Close() }()
					req, err := http.ReadRequest(bufio.NewReader(serverConn))
					if err == nil {
						_ = req.Body.Close()
					}

					_, _ = io.WriteString(serverConn, "HTTP/1.1 200 OK\r\nContent-Type: application/xml\r\nContent-Length: 13\r\n\r\n<rss>ok</rss>")
				}()
				return clientConn, nil
			},
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if lookupCalls != 1 {
			t.Fatalf("lookup calls = %d, want %d", lookupCalls, 1)
		}
		if dialedAddress != "203.0.113.10:80" {
			t.Fatalf("dialed address = %q, want %q", dialedAddress, "203.0.113.10:80")
		}
		if rr.Body.String() != "<rss>ok</rss>" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "<rss>ok</rss>")
		}
	})

	t.Run("does not follow redirects to private targets", func(t *testing.T) {
		lookupCalls := 0
		dialCalls := 0
		proxy := &proxyService{
			lookupIP: func(_ context.Context, host string) ([]net.IPAddr, error) {
				lookupCalls++
				if host != "feeds.example.com" {
					t.Fatalf("lookup host = %q, want %q", host, "feeds.example.com")
				}

				return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
			},
			dialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				dialCalls++
				clientConn, serverConn := net.Pipe()
				go func() {
					defer func() { _ = serverConn.Close() }()
					req, err := http.ReadRequest(bufio.NewReader(serverConn))
					if err == nil {
						_ = req.Body.Close()
					}

					_, _ = io.WriteString(serverConn, "HTTP/1.1 302 Found\r\nLocation: http://10.0.0.8/feed.xml\r\nContent-Length: 0\r\n\r\n")
				}()
				return clientConn, nil
			},
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if lookupCalls != 1 {
			t.Fatalf("lookup calls = %d, want %d", lookupCalls, 1)
		}
		if dialCalls != 1 {
			t.Fatalf("dial calls = %d, want %d", dialCalls, 1)
		}
		if rr.Body.String() == "" {
			t.Fatalf("expected redirect rejection body")
		}
	})

	t.Run("returns timeout and custom ua on successful fetch", func(t *testing.T) {
		var gotUserAgent string
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusOK,
					body:       "<rss>feed</rss>",
					headers: http.Header{
						"Content-Type": []string{"application/rss+xml; charset=utf-8"},
					},
					onRequest: func(req *http.Request) {
						gotUserAgent = req.Header.Get("User-Agent")
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if gotUserAgent != proxyUserAgent {
			t.Fatalf("user-agent = %q, want %q", gotUserAgent, proxyUserAgent)
		}
		if rr.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("acao = %q, want empty", rr.Header().Get("Access-Control-Allow-Origin"))
		}
		if rr.Header().Get("Content-Type") != "application/rss+xml; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/rss+xml; charset=utf-8")
		}
		if rr.Body.String() != "<rss>feed</rss>" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "<rss>feed</rss>")
		}
	})

	t.Run("allows same-origin browser requests and reflects the origin", func(t *testing.T) {
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusOK,
					body:       "<rss>same-origin</rss>",
					headers: http.Header{
						"Content-Type": []string{"application/rss+xml"},
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Origin", "http://example.com")
		rr := httptest.NewRecorder()
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Header().Get("Access-Control-Allow-Origin") != "http://example.com" {
			t.Fatalf("acao = %q, want %q", rr.Header().Get("Access-Control-Allow-Origin"), "http://example.com")
		}
		if !strings.Contains(rr.Header().Get("Vary"), "Origin") {
			t.Fatalf("vary = %q, want to contain Origin", rr.Header().Get("Vary"))
		}
	})

	t.Run("rejects disallowed browser origin for proxy requests", func(t *testing.T) {
		proxy := &proxyService{
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		req.Header.Set("Origin", "https://evil.example")
		rr := httptest.NewRecorder()
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		assertProxyErrorPayload(t, rr.Body, "PROXY_ORIGIN_NOT_ALLOWED")
		if rr.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("acao = %q, want empty", rr.Header().Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("returns timeout on slow upstream", func(t *testing.T) {
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					delay: 100 * time.Millisecond,
					body:  "<rss>slow</rss>",
					headers: http.Header{
						"Content-Type": []string{"application/rss+xml"},
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   10 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusGatewayTimeout {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusGatewayTimeout)
		}
		if rr.Body.String() == "" {
			t.Fatalf("expected timeout body")
		}
	})

	t.Run("returns bad gateway on upstream error response", func(t *testing.T) {
		calls := 0
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusInternalServerError,
					body:       "boom",
					headers: http.Header{
						"Content-Type": []string{"text/plain"},
					},
					onRequest: func(_ *http.Request) {
						calls++
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusInternalServerError)
		}
		if calls != 1 {
			t.Fatalf("upstream calls = %d, want %d", calls, 1)
		}
		if rr.Body.String() == "" {
			t.Fatalf("expected error body")
		}
	})

	t.Run("rate limits repeated requests from same ip", func(t *testing.T) {
		calls := 0
		proxy := &proxyService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusOK,
					body:       "<rss>ok</rss>",
					headers: http.Header{
						"Content-Type": []string{"application/xml"},
					},
					onRequest: func(_ *http.Request) {
						calls++
					},
				},
			},
			lookupIP:  testPublicLookupIP,
			limiter:   newRateLimiter(1, time.Minute, func() time.Time { return time.Unix(0, 0) }),
			timeout:   100 * time.Millisecond,
			userAgent: proxyUserAgent,
			bodyLimit: proxyBodyLimit,
		}

		first := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(first, req)
		if first.Code != http.StatusOK {
			t.Fatalf("first status = %d, want %d", first.Code, http.StatusOK)
		}

		second := httptest.NewRecorder()
		req = httptest.NewRequest(http.MethodGet, "/api/proxy?url=https://feeds.example.com/feed.xml", nil)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(second, req)
		if second.Code != http.StatusTooManyRequests {
			t.Fatalf("second status = %d, want %d", second.Code, http.StatusTooManyRequests)
		}
		if calls != 1 {
			t.Fatalf("upstream calls = %d, want %d", calls, 1)
		}
	})
}

func TestProxyGetRangeForwarding(t *testing.T) {
	t.Run("GET proxy with Range header forwards Range to upstream", func(t *testing.T) {
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
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/audio.mp3", nil)
		req.Header.Set("Range", "bytes=0-1023")
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

	t.Run("GET proxy with If-Range header forwards If-Range to upstream", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("If-Range"); got != `"etag123"` {
				t.Fatalf("if-range = %q, want %q", got, `"etag123"`)
			}

			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(http.StatusOK)
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/audio.mp3", nil)
		req.Header.Set("If-Range", `"etag123"`)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
	})

	t.Run("GET proxy with both Range and If-Range forwards both to upstream", func(t *testing.T) {
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
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/audio.mp3", nil)
		req.Header.Set("Range", "bytes=500-1000")
		req.Header.Set("If-Range", `"my-etag"`)
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusPartialContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusPartialContent)
		}
	})

	t.Run("GET proxy with malformed Range returns 400", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("upstream should not be called with invalid Range header")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/audio.mp3", nil)
		req.Header.Set("Range", "garbage")
		req.RemoteAddr = "198.51.100.10:12345"
		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
	})

	t.Run("GET proxy without Range header works as before", func(t *testing.T) {
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
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/audio.mp3", nil)
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

func TestProxyServiceMediaFallbackContract(t *testing.T) {
	t.Run("post head request preserves sizing headers and omits body", func(t *testing.T) {
		proxy, dialedAddress := newMediaProxyTestService(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodHead {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodHead)
			}
			if got := r.Header.Get("User-Agent"); got != proxyUserAgent {
				t.Fatalf("user-agent = %q, want %q", got, proxyUserAgent)
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
		req := httptest.NewRequest(http.MethodGet, "/api/proxy?url=http://feeds.example.com/start", nil)
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
	})
}

func testPublicLookupIP(_ context.Context, _ string) ([]net.IPAddr, error) {
	return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
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
		limiter:   newRateLimiter(5, time.Minute, func() time.Time { return time.Unix(0, 0) }),
		timeout:   200 * time.Millisecond,
		userAgent: proxyUserAgent,
		bodyLimit: proxyBodyLimit,
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
