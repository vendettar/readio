package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
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

func TestResolveCloudUIDistDirPrefersColocatedDist(t *testing.T) {
	releaseDir := t.TempDir()
	distDir := filepath.Join(releaseDir, "dist")
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
	if err := os.Chdir(releaseDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(oldWd)
	})

	resolved, err := resolveCloudUIDistDir()
	if err != nil {
		t.Fatalf("resolve cloud ui dist: %v", err)
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
		t.Fatalf("resolve cloud ui dist: %v", err)
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
		t.Fatalf("resolve cloud ui dist: %v", err)
	}

	if resolved != distDir {
		t.Fatalf("resolved = %q, want %q", resolved, distDir)
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
	origNewDiscovery := cloudNewDiscoveryService
	origClose := cloudCloseSQLite
	origListen := cloudListenAndServe
	origShutdown := cloudShutdownServer
	origNotify := cloudNotifyContext
	t.Cleanup(func() {
		cloudOpenSQLite = origOpen
		cloudNewProxyService = origNewProxy
		cloudNewDiscoveryService = origNewDiscovery
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
	cloudNewDiscoveryService = func() *discoveryService {
		return &discoveryService{
			client: &http.Client{
				Transport: &proxyRoundTripper{
					statusCode: http.StatusOK,
					body:       `{"feed":{"results":[{"id":"101","name":"Top Show","artistName":"Host","artworkUrl100":"https://example.com/art.jpg","url":"https://podcasts.apple.com/us/podcast/example/id101","collectionId":"101","description":"Top discovery","releaseDate":"2024-01-01","feedUrl":"https://example.com/feed.xml"}]}}`,
					headers: http.Header{
						"Content-Type": []string{"application/json"},
					},
					onRequest: func(req *http.Request) {
						if req.Header.Get("User-Agent") != discoveryUserAgent {
							t.Fatalf("discovery user-agent = %q, want %q", req.Header.Get("User-Agent"), discoveryUserAgent)
						}
						if req.Header.Get("Accept") != "application/json" {
							t.Fatalf("discovery accept = %q, want %q", req.Header.Get("Accept"), "application/json")
						}
					},
				},
			},
			timeout:   100 * time.Millisecond,
			userAgent: discoveryUserAgent,
			baseURL:   discoveryBaseURL,
			maxLimit:  discoveryMaxLimit,
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

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/v1/discovery/top-podcasts?country=US&limit=20", nil)
	server.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("discovery podcasts status = %d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("discovery podcasts content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
	}

	type discoveryResponse struct {
		Country string `json:"country"`
		Limit   int    `json:"limit"`
		Results []struct {
			ID                string `json:"id"`
			Name              string `json:"name"`
			ArtistName        string `json:"artistName"`
			URL               string `json:"url"`
			ProviderPodcastID string `json:"providerPodcastId"`
			ProviderEpisodeID string `json:"providerEpisodeId"`
		} `json:"results"`
	}

	var podcasts discoveryResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &podcasts); err != nil {
		t.Fatalf("unmarshal podcasts response: %v", err)
	}
	if podcasts.Country != "us" {
		t.Fatalf("discovery country = %q, want %q", podcasts.Country, "us")
	}
	if podcasts.Limit != 20 {
		t.Fatalf("discovery limit = %d, want %d", podcasts.Limit, 20)
	}
	if len(podcasts.Results) != 1 {
		t.Fatalf("discovery results = %d, want %d", len(podcasts.Results), 1)
	}
	if podcasts.Results[0].ID != "101" || podcasts.Results[0].Name != "Top Show" {
		t.Fatalf("discovery result = %#v, want top show", podcasts.Results[0])
	}
	if podcasts.Results[0].ProviderPodcastID != "101" {
		t.Fatalf("providerPodcastId = %q, want %q", podcasts.Results[0].ProviderPodcastID, "101")
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/v1/discovery/top-episodes?country=us&limit=20", nil)
	server.Handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("discovery episodes status = %d, want %d", rr.Code, http.StatusOK)
	}

	var episodes discoveryResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &episodes); err != nil {
		t.Fatalf("unmarshal episodes response: %v", err)
	}
	if episodes.Country != "us" {
		t.Fatalf("episodes country = %q, want %q", episodes.Country, "us")
	}
	if len(episodes.Results) != 1 {
		t.Fatalf("episodes results = %d, want %d", len(episodes.Results), 1)
	}
	if episodes.Results[0].ProviderEpisodeID != "101" {
		t.Fatalf("providerEpisodeId = %q, want %q", episodes.Results[0].ProviderEpisodeID, "101")
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

func TestDiscoveryServiceReturnsJSONFromMockedUpstream(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name           string
		path           string
		wantUpstream   string
		wantResultName string
		wantPodcastID  string
		wantEpisodeID  string
	}{
		{
			name:           "top podcasts",
			path:           "/api/v1/discovery/top-podcasts?country=US&limit=20",
			wantUpstream:   "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/20/podcasts.json",
			wantResultName: "Top Show",
			wantPodcastID:  "101",
		},
		{
			name:           "top episodes",
			path:           "/api/v1/discovery/top-episodes?country=US&limit=20",
			wantUpstream:   "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/20/podcast-episodes.json",
			wantResultName: "Top Show",
			wantPodcastID:  "101",
			wantEpisodeID:  "101",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotRequest *http.Request
			svc := newTestDiscoveryService(&proxyRoundTripper{
				statusCode: http.StatusOK,
				body:       `{"feed":{"results":[{"id":"101","name":"Top Show","artistName":"Host","artworkUrl100":"https://example.com/art.jpg","url":"https://podcasts.apple.com/us/podcast/example/id101","collectionId":"101","description":"Top discovery","releaseDate":"2024-01-01","feedUrl":"https://example.com/feed.xml"}]}}`,
				headers: http.Header{
					"Content-Type": []string{"application/json"},
				},
				onRequest: func(req *http.Request) {
					gotRequest = req
				},
			}, 100*time.Millisecond)

			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			svc.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
			}
			if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
				t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
			}

			type discoveryResponse struct {
				Country string `json:"country"`
				Limit   int    `json:"limit"`
				Results []struct {
					ID                string `json:"id"`
					Name              string `json:"name"`
					ArtistName        string `json:"artistName"`
					URL               string `json:"url"`
					ProviderPodcastID string `json:"providerPodcastId"`
					ProviderEpisodeID string `json:"providerEpisodeId"`
				} `json:"results"`
			}

			var payload discoveryResponse
			if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}
			if payload.Country != "us" {
				t.Fatalf("country = %q, want %q", payload.Country, "us")
			}
			if payload.Limit != 20 {
				t.Fatalf("limit = %d, want %d", payload.Limit, 20)
			}
			if len(payload.Results) != 1 {
				t.Fatalf("results = %d, want %d", len(payload.Results), 1)
			}
			if payload.Results[0].Name != tc.wantResultName {
				t.Fatalf("result name = %q, want %q", payload.Results[0].Name, tc.wantResultName)
			}
			if payload.Results[0].ProviderPodcastID != tc.wantPodcastID {
				t.Fatalf("providerPodcastId = %q, want %q", payload.Results[0].ProviderPodcastID, tc.wantPodcastID)
			}
			if payload.Results[0].ProviderEpisodeID != tc.wantEpisodeID {
				t.Fatalf("providerEpisodeId = %q, want %q", payload.Results[0].ProviderEpisodeID, tc.wantEpisodeID)
			}
			if gotRequest == nil {
				t.Fatal("expected upstream request")
			}
			if gotRequest.Header.Get("User-Agent") != discoveryUserAgent {
				t.Fatalf("user-agent = %q, want %q", gotRequest.Header.Get("User-Agent"), discoveryUserAgent)
			}
			if gotRequest.Header.Get("Accept") != "application/json" {
				t.Fatalf("accept = %q, want %q", gotRequest.Header.Get("Accept"), "application/json")
			}
			if gotRequest.URL.String() != tc.wantUpstream {
				t.Fatalf("upstream url = %q, want %q", gotRequest.URL.String(), tc.wantUpstream)
			}
		})
	}
}

func TestDiscoverySearchServiceReturnsNormalizedJSONFromMockedUpstream(t *testing.T) {
	t.Parallel()

	t.Run("search podcasts", func(t *testing.T) {
		var gotRequest *http.Request
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       `{"results":[{"wrapperType":"track","kind":"podcast","collectionId":101,"collectionName":"Cloud Podcast","artistName":"Readio","artworkUrl100":"https://example.com/podcast.jpg","description":"Podcast summary","releaseDate":"2024-02-03","collectionViewUrl":"https://podcasts.apple.com/us/podcast/example/id101"}]}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
			onRequest: func(req *http.Request) {
				gotRequest = req
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/search/podcasts?term=%20%20Cloud%20Search%20%20&country=US&limit=20", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}

		type searchResponse struct {
			Country string `json:"country"`
			Term    string `json:"term"`
			Limit   int    `json:"limit"`
			Results []struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				ArtistName        string `json:"artistName"`
				ArtworkURL100     string `json:"artworkUrl100"`
				Description       string `json:"description"`
				ReleaseDate       string `json:"releaseDate"`
				ProviderPodcastID string `json:"providerPodcastId"`
				ProviderEpisodeID string `json:"providerEpisodeId"`
			} `json:"results"`
		}

		var payload searchResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if payload.Country != "us" {
			t.Fatalf("country = %q, want %q", payload.Country, "us")
		}
		if payload.Term != "Cloud Search" {
			t.Fatalf("term = %q, want %q", payload.Term, "Cloud Search")
		}
		if payload.Limit != 20 {
			t.Fatalf("limit = %d, want %d", payload.Limit, 20)
		}
		if len(payload.Results) != 1 {
			t.Fatalf("results = %d, want %d", len(payload.Results), 1)
		}
		if payload.Results[0].Name != "Cloud Podcast" {
			t.Fatalf("result name = %q, want %q", payload.Results[0].Name, "Cloud Podcast")
		}
		if payload.Results[0].ProviderPodcastID != "101" {
			t.Fatalf("providerPodcastId = %q, want %q", payload.Results[0].ProviderPodcastID, "101")
		}
		if gotRequest == nil {
			t.Fatal("expected upstream request")
		}
		if gotRequest.URL.String() != "https://itunes.apple.com/search?term=Cloud+Search&country=us&media=podcast&entity=podcast&limit=20" {
			t.Fatalf("upstream url = %q, want %q", gotRequest.URL.String(), "https://itunes.apple.com/search?term=Cloud+Search&country=us&media=podcast&entity=podcast&limit=20")
		}
	})

	t.Run("search episodes", func(t *testing.T) {
		var gotRequest *http.Request
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       `{"results":[{"wrapperType":"track","kind":"podcast-episode","trackId":201,"collectionId":101,"trackName":"Episode One","artistName":"Readio","artworkUrl100":"https://example.com/episode-1.jpg","description":"Episode one summary","releaseDate":"2024-02-04","trackViewUrl":"https://podcasts.apple.com/us/podcast/example/id201"}]}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
			onRequest: func(req *http.Request) {
				gotRequest = req
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/search/episodes?term=%20%20Cloud%20Search%20%20&country=US&limit=20", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}

		type searchResponse struct {
			Country string `json:"country"`
			Term    string `json:"term"`
			Limit   int    `json:"limit"`
			Results []struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				ArtistName        string `json:"artistName"`
				ArtworkURL100     string `json:"artworkUrl100"`
				Description       string `json:"description"`
				ReleaseDate       string `json:"releaseDate"`
				ProviderPodcastID string `json:"providerPodcastId"`
				ProviderEpisodeID string `json:"providerEpisodeId"`
			} `json:"results"`
		}

		var payload searchResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if payload.Country != "us" {
			t.Fatalf("country = %q, want %q", payload.Country, "us")
		}
		if payload.Term != "Cloud Search" {
			t.Fatalf("term = %q, want %q", payload.Term, "Cloud Search")
		}
		if payload.Limit != 20 {
			t.Fatalf("limit = %d, want %d", payload.Limit, 20)
		}
		if len(payload.Results) != 1 {
			t.Fatalf("results = %d, want %d", len(payload.Results), 1)
		}
		if payload.Results[0].Name != "Episode One" {
			t.Fatalf("result name = %q, want %q", payload.Results[0].Name, "Episode One")
		}
		if payload.Results[0].ProviderPodcastID != "101" {
			t.Fatalf("providerPodcastId = %q, want %q", payload.Results[0].ProviderPodcastID, "101")
		}
		if payload.Results[0].ProviderEpisodeID != "201" {
			t.Fatalf("providerEpisodeId = %q, want %q", payload.Results[0].ProviderEpisodeID, "201")
		}
		if gotRequest == nil {
			t.Fatal("expected upstream request")
		}
		if gotRequest.URL.String() != "https://itunes.apple.com/search?term=Cloud+Search&country=us&media=podcast&entity=podcastEpisode&limit=20" {
			t.Fatalf("upstream url = %q, want %q", gotRequest.URL.String(), "https://itunes.apple.com/search?term=Cloud+Search&country=us&media=podcast&entity=podcastEpisode&limit=20")
		}
	})
}

func TestDiscoveryServiceRejectsInvalidParamsAndUpstreamFailures(t *testing.T) {
	t.Parallel()

	t.Run("rejects invalid params without upstream call", func(t *testing.T) {
		calls := 0
		svc := newTestDiscoveryService(&proxyRoundTripper{
			onRequest: func(req *http.Request) {
				calls++
				t.Fatalf("upstream should not be called for invalid params")
			},
		}, 100*time.Millisecond)

		tests := []struct {
			name       string
			path       string
			wantStatus int
		}{
			{name: "invalid country", path: "/api/v1/discovery/top-podcasts?country=usa&limit=20", wantStatus: http.StatusBadRequest},
			{name: "invalid limit zero", path: "/api/v1/discovery/top-episodes?country=us&limit=0", wantStatus: http.StatusBadRequest},
			{name: "invalid limit text", path: "/api/v1/discovery/top-episodes?country=us&limit=abc", wantStatus: http.StatusBadRequest},
			{name: "missing search term", path: "/api/v1/discovery/search/podcasts?country=us&limit=20", wantStatus: http.StatusBadRequest},
			{name: "blank search term", path: "/api/v1/discovery/search/episodes?term=%20%20&country=us&limit=20", wantStatus: http.StatusBadRequest},
			{name: "invalid search country", path: "/api/v1/discovery/search/podcasts?term=cloud&country=usa&limit=20", wantStatus: http.StatusBadRequest},
			{name: "invalid search limit zero", path: "/api/v1/discovery/search/episodes?term=cloud&country=us&limit=0", wantStatus: http.StatusBadRequest},
			{name: "invalid search limit text", path: "/api/v1/discovery/search/episodes?term=cloud&country=us&limit=abc", wantStatus: http.StatusBadRequest},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				calls = 0
				rr := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, tc.path, nil)
				svc.ServeHTTP(rr, req)

				if rr.Code != tc.wantStatus {
					t.Fatalf("status = %d, want %d", rr.Code, tc.wantStatus)
				}
				if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
					t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
				}
				if calls != 0 {
					t.Fatalf("upstream calls = %d, want %d", calls, 0)
				}
			})
		}
	})

	t.Run("maps upstream failure to backend error", func(t *testing.T) {
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusInternalServerError,
			body:       "boom",
			headers: http.Header{
				"Content-Type": []string{"text/plain"},
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/top-podcasts?country=us&limit=20", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}
		if rr.Body.String() == "" {
			t.Fatal("expected error body")
		}
	})

	t.Run("maps search upstream failure to backend error", func(t *testing.T) {
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusBadGateway,
			body:       "boom",
			headers: http.Header{
				"Content-Type": []string{"text/plain"},
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/search/podcasts?term=cloud&country=us&limit=20", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}
		if rr.Body.String() == "" {
			t.Fatal("expected error body")
		}
	})

	t.Run("times out on slow upstream", func(t *testing.T) {
		svc := newTestDiscoveryService(&proxyRoundTripper{
			delay: 100 * time.Millisecond,
			body:  `{"feed":{"results":[]}}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
		}, 10*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/top-episodes?country=us&limit=20", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusGatewayTimeout {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusGatewayTimeout)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}
		if rr.Body.String() == "" {
			t.Fatal("expected timeout body")
		}
	})
}

func TestDiscoveryLookupServiceReturnsNormalizedJSONFromMockedUpstream(t *testing.T) {
	t.Parallel()

	t.Run("podcast detail", func(t *testing.T) {
		var gotRequest *http.Request
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       `{"results":[{"wrapperType":"track","kind":"podcast","collectionId":101,"trackName":"Cloud Podcast","artistName":"Readio","artworkUrl100":"https://example.com/podcast.jpg","description":"Podcast summary","releaseDate":"2024-02-03","feedUrl":"https://example.com/feed.xml","collectionViewUrl":"https://podcasts.apple.com/us/podcast/example/id101"}]}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
			onRequest: func(req *http.Request) {
				gotRequest = req
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/lookup/podcast?id=00101&country=US", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}

		type podcastResponse struct {
			Country string `json:"country"`
			Podcast struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				ArtistName        string `json:"artistName"`
				ArtworkURL100     string `json:"artworkUrl100"`
				Description       string `json:"description"`
				ReleaseDate       string `json:"releaseDate"`
				ProviderPodcastID string `json:"providerPodcastId"`
			} `json:"podcast"`
		}

		var payload podcastResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if payload.Country != "us" {
			t.Fatalf("country = %q, want %q", payload.Country, "us")
		}
		if payload.Podcast.ID != "101" {
			t.Fatalf("podcast id = %q, want %q", payload.Podcast.ID, "101")
		}
		if payload.Podcast.Name != "Cloud Podcast" {
			t.Fatalf("podcast name = %q, want %q", payload.Podcast.Name, "Cloud Podcast")
		}
		if payload.Podcast.ProviderPodcastID != "101" {
			t.Fatalf("providerPodcastId = %q, want %q", payload.Podcast.ProviderPodcastID, "101")
		}
		if payload.Podcast.ArtistName != "Readio" {
			t.Fatalf("artistName = %q, want %q", payload.Podcast.ArtistName, "Readio")
		}
		if payload.Podcast.Description != "Podcast summary" {
			t.Fatalf("description = %q, want %q", payload.Podcast.Description, "Podcast summary")
		}
		if gotRequest == nil {
			t.Fatal("expected upstream request")
		}
		if gotRequest.URL.String() != "https://itunes.apple.com/lookup?id=101&country=us&entity=podcast" {
			t.Fatalf("upstream url = %q, want %q", gotRequest.URL.String(), "https://itunes.apple.com/lookup?id=101&country=us&entity=podcast")
		}
	})

	t.Run("podcast episode list", func(t *testing.T) {
		var gotRequest *http.Request
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       `{"results":[{"wrapperType":"track","kind":"podcast","collectionId":101,"trackName":"Cloud Podcast","artistName":"Readio","artworkUrl100":"https://example.com/podcast.jpg","description":"Podcast summary","releaseDate":"2024-02-03"},{"wrapperType":"track","kind":"podcast-episode","trackId":201,"collectionId":101,"trackName":"Episode One","artistName":"Readio","artworkUrl100":"https://example.com/episode-1.jpg","description":"Episode one summary","releaseDate":"2024-02-04"},{"wrapperType":"track","kind":"podcast-episode","trackId":202,"collectionId":101,"trackName":"Episode Two","artistName":"Readio","artworkUrl100":"https://example.com/episode-2.jpg","description":"Episode two summary","releaseDate":"2024-02-05"}]}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
			onRequest: func(req *http.Request) {
				gotRequest = req
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/lookup/podcast-episodes?id=00101&country=US", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}

		type episodesResponse struct {
			Country string `json:"country"`
			Limit   int    `json:"limit"`
			Podcast struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				ArtistName        string `json:"artistName"`
				ArtworkURL100     string `json:"artworkUrl100"`
				Description       string `json:"description"`
				ReleaseDate       string `json:"releaseDate"`
				ProviderPodcastID string `json:"providerPodcastId"`
			} `json:"podcast"`
			Results []struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				ArtistName        string `json:"artistName"`
				ArtworkURL100     string `json:"artworkUrl100"`
				Description       string `json:"description"`
				ReleaseDate       string `json:"releaseDate"`
				ProviderPodcastID string `json:"providerPodcastId"`
				ProviderEpisodeID string `json:"providerEpisodeId"`
			} `json:"results"`
		}

		var payload episodesResponse
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if payload.Country != "us" {
			t.Fatalf("country = %q, want %q", payload.Country, "us")
		}
		if payload.Limit != 100 {
			t.Fatalf("limit = %d, want %d", payload.Limit, 100)
		}
		if payload.Podcast.ID != "101" {
			t.Fatalf("podcast id = %q, want %q", payload.Podcast.ID, "101")
		}
		if payload.Podcast.Name != "Cloud Podcast" {
			t.Fatalf("podcast name = %q, want %q", payload.Podcast.Name, "Cloud Podcast")
		}
		if len(payload.Results) != 2 {
			t.Fatalf("results = %d, want %d", len(payload.Results), 2)
		}
		if payload.Results[0].ID != "201" || payload.Results[0].ProviderEpisodeID != "201" {
			t.Fatalf("episode one = %#v, want id/providerEpisodeId 201", payload.Results[0])
		}
		if payload.Results[1].ID != "202" || payload.Results[1].ProviderEpisodeID != "202" {
			t.Fatalf("episode two = %#v, want id/providerEpisodeId 202", payload.Results[1])
		}
		if gotRequest == nil {
			t.Fatal("expected upstream request")
		}
		if gotRequest.URL.String() != "https://itunes.apple.com/lookup?id=101&country=us&entity=podcastEpisode&limit=100" {
			t.Fatalf("upstream url = %q, want %q", gotRequest.URL.String(), "https://itunes.apple.com/lookup?id=101&country=us&entity=podcastEpisode&limit=100")
		}
	})
}

func TestDiscoveryLookupServiceRejectsInvalidParamsAndUpstreamFailures(t *testing.T) {
	t.Parallel()

	t.Run("rejects invalid params without upstream call", func(t *testing.T) {
		calls := 0
		svc := newTestDiscoveryService(&proxyRoundTripper{
			onRequest: func(req *http.Request) {
				calls++
				t.Fatalf("upstream should not be called for invalid params")
			},
		}, 100*time.Millisecond)

		tests := []struct {
			name       string
			path       string
			wantStatus int
		}{
			{name: "missing id", path: "/api/v1/discovery/lookup/podcast?country=us", wantStatus: http.StatusBadRequest},
			{name: "invalid id text", path: "/api/v1/discovery/lookup/podcast?id=abc&country=us", wantStatus: http.StatusBadRequest},
			{name: "invalid country", path: "/api/v1/discovery/lookup/podcast?id=101&country=usa", wantStatus: http.StatusBadRequest},
			{name: "invalid limit zero", path: "/api/v1/discovery/lookup/podcast-episodes?id=101&country=us&limit=0", wantStatus: http.StatusBadRequest},
			{name: "invalid limit text", path: "/api/v1/discovery/lookup/podcast-episodes?id=101&country=us&limit=abc", wantStatus: http.StatusBadRequest},
			{name: "invalid limit too large", path: "/api/v1/discovery/lookup/podcast-episodes?id=101&country=us&limit=101", wantStatus: http.StatusBadRequest},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				calls = 0
				rr := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, tc.path, nil)
				svc.ServeHTTP(rr, req)

				if rr.Code != tc.wantStatus {
					t.Fatalf("status = %d, want %d", rr.Code, tc.wantStatus)
				}
				if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
					t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
				}
				if calls != 0 {
					t.Fatalf("upstream calls = %d, want %d", calls, 0)
				}
			})
		}
	})

	t.Run("maps upstream failure and timeout to backend errors", func(t *testing.T) {
		t.Run("upstream failure", func(t *testing.T) {
			svc := newTestDiscoveryService(&proxyRoundTripper{
				statusCode: http.StatusInternalServerError,
				body:       "boom",
				headers: http.Header{
					"Content-Type": []string{"text/plain"},
				},
			}, 100*time.Millisecond)

			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/lookup/podcast?id=101&country=us", nil)
			svc.ServeHTTP(rr, req)

			if rr.Code != http.StatusBadGateway {
				t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
			}
			if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
				t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
			}
			if rr.Body.String() == "" {
				t.Fatal("expected error body")
			}
		})

		t.Run("timeout", func(t *testing.T) {
			svc := newTestDiscoveryService(&proxyRoundTripper{
				delay: 100 * time.Millisecond,
				body:  `{"results":[{"wrapperType":"track","kind":"podcast","collectionId":101,"trackName":"Cloud Podcast"}]}`,
				headers: http.Header{
					"Content-Type": []string{"application/json"},
				},
			}, 10*time.Millisecond)

			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/lookup/podcast-episodes?id=101&country=us&limit=25", nil)
			svc.ServeHTTP(rr, req)

			if rr.Code != http.StatusGatewayTimeout {
				t.Fatalf("status = %d, want %d", rr.Code, http.StatusGatewayTimeout)
			}
			if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
				t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
			}
			if rr.Body.String() == "" {
				t.Fatal("expected timeout body")
			}
		})
	})

	t.Run("returns not found when lookup podcast is missing", func(t *testing.T) {
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       `{"results":[]}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/lookup/podcast?id=101&country=us", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}
		if rr.Body.String() == "" {
			t.Fatal("expected not found body")
		}
	})

	t.Run("returns not found when lookup podcast episode root is missing", func(t *testing.T) {
		svc := newTestDiscoveryService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       `{"results":[{"wrapperType":"track","kind":"podcast-episode","trackId":201,"collectionId":101,"trackName":"Episode One"}]}`,
			headers: http.Header{
				"Content-Type": []string{"application/json"},
			},
		}, 100*time.Millisecond)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/lookup/podcast-episodes?id=101&country=us&limit=25", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
		}
		if rr.Body.String() == "" {
			t.Fatal("expected not found body")
		}
	})
}

func TestDiscoveryFeedServiceReturnsNormalizedJSONFromMockedUpstream(t *testing.T) {
	t.Parallel()

	var gotRequest *http.Request
	svc := newTestFeedService(&proxyRoundTripper{
		statusCode: http.StatusOK,
		body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Cloud Feed</title>
    <link>https://example.com/feed</link>
    <description>Cloud feed summary</description>
    <lastBuildDate>Mon, 24 Mar 2026 09:00:00 GMT</lastBuildDate>
    <image>
      <url>https://example.com/feed.jpg</url>
    </image>
    <item>
      <title>Episode One</title>
      <guid>episode-1</guid>
      <link>https://example.com/feed/episode-1</link>
      <description>Episode one summary</description>
      <pubDate>Mon, 24 Mar 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/audio-1.mp3" length="12345" type="audio/mpeg"></enclosure>
    </item>
  </channel>
</rss>`,
		headers: http.Header{
			"Content-Type": []string{"application/rss+xml; charset=utf-8"},
		},
		onRequest: func(req *http.Request) {
			gotRequest = req
		},
	}, 100*time.Millisecond)
	svc.lookupIP = testPublicLookupIP

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url=https://feeds.example.com/feed.xml", nil)
	svc.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("content-type = %q, want %q", rr.Header().Get("Content-Type"), "application/json; charset=utf-8")
	}

	type feedResponse struct {
		SourceURL string `json:"sourceUrl"`
		Feed      struct {
			Title       string `json:"title"`
			Subtitle    string `json:"subtitle"`
			Description string `json:"description"`
			Link        string `json:"link"`
			ImageURL    string `json:"imageUrl"`
			UpdatedAt   string `json:"updatedAt"`
		} `json:"feed"`
		Episodes []struct {
			ID          string `json:"id"`
			Title       string `json:"title"`
			Description string `json:"description"`
			Link        string `json:"link"`
			AudioURL    string `json:"audioUrl"`
			PublishedAt string `json:"publishedAt"`
		} `json:"episodes"`
	}

	var payload feedResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if payload.SourceURL != "https://feeds.example.com/feed.xml" {
		t.Fatalf("sourceUrl = %q, want %q", payload.SourceURL, "https://feeds.example.com/feed.xml")
	}
	if payload.Feed.Title != "Cloud Feed" {
		t.Fatalf("feed title = %q, want %q", payload.Feed.Title, "Cloud Feed")
	}
	if payload.Feed.Link != "https://example.com/feed" {
		t.Fatalf("feed link = %q, want %q", payload.Feed.Link, "https://example.com/feed")
	}
	if payload.Feed.ImageURL != "https://example.com/feed.jpg" {
		t.Fatalf("feed imageUrl = %q, want %q", payload.Feed.ImageURL, "https://example.com/feed.jpg")
	}
	if len(payload.Episodes) != 1 {
		t.Fatalf("episodes = %d, want %d", len(payload.Episodes), 1)
	}
	if payload.Episodes[0].Title != "Episode One" {
		t.Fatalf("episode title = %q, want %q", payload.Episodes[0].Title, "Episode One")
	}
	if payload.Episodes[0].AudioURL != "https://example.com/audio-1.mp3" {
		t.Fatalf("episode audioUrl = %q, want %q", payload.Episodes[0].AudioURL, "https://example.com/audio-1.mp3")
	}
	if gotRequest == nil {
		t.Fatal("expected upstream request")
	}
	if gotRequest.URL.String() != "https://feeds.example.com/feed.xml" {
		t.Fatalf("upstream url = %q, want %q", gotRequest.URL.String(), "https://feeds.example.com/feed.xml")
	}
	if gotRequest.Header.Get("User-Agent") != discoveryUserAgent {
		t.Fatalf("user-agent = %q, want %q", gotRequest.Header.Get("User-Agent"), discoveryUserAgent)
	}
	if !strings.Contains(gotRequest.Header.Get("Accept"), "application/rss+xml") {
		t.Fatalf("accept = %q, want rss/xml accept header", gotRequest.Header.Get("Accept"))
	}
}

func TestDiscoveryFeedServiceRejectsUnsafeTargetsAndFailures(t *testing.T) {
	t.Parallel()

	t.Run("rejects unsafe targets before upstream call", func(t *testing.T) {
		calls := 0
		svc := newTestFeedService(&proxyRoundTripper{
			onRequest: func(req *http.Request) {
				calls++
				t.Fatalf("upstream should not be called for unsafe targets")
			},
		}, 100*time.Millisecond)

		tests := []struct {
			name       string
			target     string
			wantStatus int
		}{
			{name: "invalid scheme", target: "ftp://feeds.example.com/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "localhost", target: "http://localhost/feed.xml", wantStatus: http.StatusBadRequest},
			{name: "loopback", target: "http://127.0.0.1/feed.xml", wantStatus: http.StatusBadRequest},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				calls = 0
				rr := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url="+url.QueryEscape(tc.target), nil)
				svc.ServeHTTP(rr, req)

				if rr.Code != tc.wantStatus {
					t.Fatalf("status = %d, want %d", rr.Code, tc.wantStatus)
				}
				if calls != 0 {
					t.Fatalf("upstream calls = %d, want %d", calls, 0)
				}
			})
		}
	})

	t.Run("rejects hostname that resolves to private address", func(t *testing.T) {
		calls := 0
		svc := newTestFeedService(&proxyRoundTripper{
			onRequest: func(req *http.Request) {
				calls++
				t.Fatalf("upstream should not be called for unsafe resolved targets")
			},
		}, 100*time.Millisecond)
		svc.lookupIP = func(ctx context.Context, host string) ([]net.IPAddr, error) {
			if host != "feeds.example.com" {
				t.Fatalf("lookup host = %q, want %q", host, "feeds.example.com")
			}

			return []net.IPAddr{{IP: net.ParseIP("10.0.0.8")}}, nil
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url=https://feeds.example.com/feed.xml", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		if calls != 0 {
			t.Fatalf("upstream calls = %d, want %d", calls, 0)
		}
	})

	t.Run("does not follow redirects to private targets", func(t *testing.T) {
		lookupCalls := 0
		dialCalls := 0
		svc := &feedService{
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
			timeout:   100 * time.Millisecond,
			bodyLimit: proxyBodyLimit,
			userAgent: discoveryUserAgent,
		}

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url=http://feeds.example.com/feed.xml", nil)
		svc.ServeHTTP(rr, req)

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

	t.Run("rejects oversized responses", func(t *testing.T) {
		svc := newTestFeedService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       strings.Repeat("x", int(proxyBodyLimit)+1),
			headers: http.Header{
				"Content-Type": []string{"application/rss+xml"},
			},
		}, 100*time.Millisecond)
		svc.lookupIP = testPublicLookupIP

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url=https://feeds.example.com/feed.xml", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}
		if rr.Body.String() == "" {
			t.Fatal("expected oversize rejection body")
		}
	})

	t.Run("times out on slow upstream", func(t *testing.T) {
		svc := newTestFeedService(&proxyRoundTripper{
			delay: 100 * time.Millisecond,
			body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Cloud Feed</title>
    <item><title>Episode One</title></item>
  </channel>
</rss>`,
			headers: http.Header{
				"Content-Type": []string{"application/rss+xml"},
			},
		}, 10*time.Millisecond)
		svc.lookupIP = testPublicLookupIP

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url=https://feeds.example.com/feed.xml", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusGatewayTimeout {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusGatewayTimeout)
		}
		if rr.Body.String() == "" {
			t.Fatal("expected timeout body")
		}
	})

	t.Run("rejects invalid XML", func(t *testing.T) {
		svc := newTestFeedService(&proxyRoundTripper{
			statusCode: http.StatusOK,
			body:       "<rss><channel><title>Broken Feed",
			headers: http.Header{
				"Content-Type": []string{"application/rss+xml"},
			},
		}, 100*time.Millisecond)
		svc.lookupIP = testPublicLookupIP

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery/feed?url=https://feeds.example.com/feed.xml", nil)
		svc.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadGateway {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadGateway)
		}
		if rr.Body.String() == "" {
			t.Fatal("expected parse rejection body")
		}
	})
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

func newTestDiscoveryService(rt http.RoundTripper, timeout time.Duration) *discoveryService {
	return &discoveryService{
		client: &http.Client{
			Transport: rt,
		},
		timeout:       timeout,
		userAgent:     discoveryUserAgent,
		baseURL:       discoveryBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		maxLimit:      discoveryMaxLimit,
	}
}

func newTestFeedService(rt http.RoundTripper, timeout time.Duration) *feedService {
	return &feedService{
		client: &http.Client{
			Transport: rt,
		},
		timeout:   timeout,
		bodyLimit: proxyBodyLimit,
		userAgent: discoveryUserAgent,
	}
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
