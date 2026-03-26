package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
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

	cloudOpenSQLite = func(ctx context.Context, gotPath string) (sqliteCloser, error) {
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
	cloudShutdownServer = func(ctx context.Context, server *http.Server) error {
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

	cloudOpenSQLite = func(ctx context.Context, gotPath string) (sqliteCloser, error) {
		return &testSQLiteHandle{closed: closed}, nil
	}
	cloudNewProxyService = func() *proxyService {
		return newProxyService()
	}
	cloudListenAndServe = func(ctx context.Context, server *http.Server) error {
		return listenErr
	}
	cloudShutdownServer = func(ctx context.Context, server *http.Server) error {
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
					onRequest: func(req *http.Request) {
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
		if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
			t.Fatalf("acao = %q, want %q", rr.Header().Get("Access-Control-Allow-Origin"), "*")
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
					onRequest: func(req *http.Request) {
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
					onRequest: func(req *http.Request) {
						called++
					},
				},
			},
			lookupIP: func(ctx context.Context, host string) ([]net.IPAddr, error) {
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
			lookupIP: func(ctx context.Context, host string) ([]net.IPAddr, error) {
				lookupCalls++
				if host != "feeds.example.com" {
					t.Fatalf("lookup host = %q, want %q", host, "feeds.example.com")
				}

				if lookupCalls == 1 {
					return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
				}

				return []net.IPAddr{{IP: net.ParseIP("10.0.0.8")}}, nil
			},
			dialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				dialedAddress = address
				clientConn, serverConn := net.Pipe()
				go func() {
					defer serverConn.Close()
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
			lookupIP: func(ctx context.Context, host string) ([]net.IPAddr, error) {
				lookupCalls++
				if host != "feeds.example.com" {
					t.Fatalf("lookup host = %q, want %q", host, "feeds.example.com")
				}

				return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
			},
			dialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				dialCalls++
				clientConn, serverConn := net.Pipe()
				go func() {
					defer serverConn.Close()
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

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
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
		if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
			t.Fatalf("acao = %q, want %q", rr.Header().Get("Access-Control-Allow-Origin"), "*")
		}
		if rr.Header().Get("Content-Type") != "application/rss+xml; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/rss+xml; charset=utf-8")
		}
		if rr.Body.String() != "<rss>feed</rss>" {
			t.Fatalf("body = %q, want %q", rr.Body.String(), "<rss>feed</rss>")
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
					onRequest: func(req *http.Request) {
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

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
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
					onRequest: func(req *http.Request) {
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

func testPublicLookupIP(ctx context.Context, host string) ([]net.IPAddr, error) {
	return []net.IPAddr{{IP: net.ParseIP("203.0.113.10")}}, nil
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

	if headers == nil {
		headers = make(http.Header)
	}

	return &http.Response{
		StatusCode: rt.statusCode,
		Header:     headers,
		Body:       io.NopCloser(strings.NewReader(rt.body)),
		Request:    req,
	}, nil
}
