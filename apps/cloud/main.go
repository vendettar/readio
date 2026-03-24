package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "modernc.org/sqlite"
)

const defaultPort = "8080"

const liteDistEnv = "READIO_LITE_DIST_DIR"
const proxyUserAgent = "Readio/1.0 (Cloud Proxy)"
const proxyRequestTimeout = 10 * time.Second
const proxyBodyLimit = 2 << 20
const proxyRateLimitWindow = time.Minute
const proxyRateLimitBurst = 5
const proxyRoute = "/api/proxy"
const cloudDBEnv = "READIO_CLOUD_DB_PATH"
const cloudDBDefaultPath = "./data/readio.db"

type appHandler struct {
	distDir   string
	fileServe http.Handler
	indexPath string
}

type proxyService struct {
	client      *http.Client
	limiter     *rateLimiter
	timeout     time.Duration
	userAgent   string
	bodyLimit   int64
	lookupIP    func(context.Context, string) ([]net.IPAddr, error)
	dialContext func(context.Context, string, string) (net.Conn, error)
}

type rateLimiter struct {
	mu     sync.Mutex
	now    func() time.Time
	window time.Duration
	limit  int
	swept  time.Time
	hits   map[string]rateBucket
}

type rateBucket struct {
	started time.Time
	count   int
}

type sqliteCloser interface {
	Close() error
}

type sqliteOpener func(context.Context, string) (sqliteCloser, error)

var (
	cloudOpenSQLite    sqliteOpener = func(ctx context.Context, dbPath string) (sqliteCloser, error) {
		return openCloudSQLite(ctx, dbPath)
	}
	cloudNewProxyService = newProxyService
	cloudCloseSQLite   = func(db sqliteCloser) error { return db.Close() }
	cloudListenAndServe = func(ctx context.Context, server *http.Server) error {
		return server.ListenAndServe()
	}
	cloudShutdownServer = func(ctx context.Context, server *http.Server) error {
		return server.Shutdown(ctx)
	}
	cloudNotifyContext = signal.NotifyContext
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	if err := runCloudServer(context.Background()); err != nil {
		logger.Error("cloud server stopped", "error", err)
		os.Exit(1)
	}
}

func runCloudServer(parent context.Context) error {
	port, err := resolvePort()
	if err != nil {
		return fmt.Errorf("invalid cloud port: %w", err)
	}

	distDir, err := resolveLiteDistDir()
	if err != nil {
		return fmt.Errorf("unable to resolve lite dist: %w", err)
	}

	handler, err := newAppHandler(distDir)
	if err != nil {
		return fmt.Errorf("invalid lite dist: %w", err)
	}

	dbPath := resolveCloudDBPath()
	db, err := cloudOpenSQLite(parent, dbPath)
	if err != nil {
		return fmt.Errorf("unable to open sqlite db: %w", err)
	}
	defer func() {
		if closeErr := cloudCloseSQLite(db); closeErr != nil {
			slog.Warn("sqlite database close failed", "error", closeErr)
		}
	}()

	slog.Info("sqlite database ready", "path", dbPath)

	proxy := cloudNewProxyService()

	addr := ":" + port

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.Handle(proxyRoute, proxy)
	mux.Handle("/", handler)

	server := &http.Server{
		Addr:             addr,
		Handler:          mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("starting cloud scaffold server", "addr", addr, "distDir", distDir, "dbPath", dbPath)

	ctx, stop := cloudNotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- cloudListenAndServe(ctx, server)
	}()

	var serveErr error
	serverExited := false
	select {
	case <-ctx.Done():
	case serveErr = <-serverErr:
		serverExited = true
	}

	if serverExited {
		if serveErr != nil && serveErr != http.ErrServerClosed {
			return serveErr
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := cloudShutdownServer(shutdownCtx, server); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}

	if !serverExited {
		serveErr = <-serverErr
	}

	if serveErr != nil && serveErr != http.ErrServerClosed {
		return serveErr
	}

	return nil
}

func newAppHandler(distDir string) (http.Handler, error) {
	indexPath := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		return nil, fmt.Errorf("missing index.html in lite dist: %w", err)
	}

	return &appHandler{
		distDir:   distDir,
		fileServe: http.FileServer(http.Dir(distDir)),
		indexPath: indexPath,
	}, nil
}

func (h *appHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}

	cleanPath := path.Clean("/" + r.URL.Path)
	if cleanPath == "/" || strings.HasSuffix(r.URL.Path, "/") {
		http.ServeFile(w, r, h.indexPath)
		return
	}

	if fileExists(h.distDir, cleanPath) {
		h.fileServe.ServeHTTP(w, r)
		return
	}

	if path.Ext(cleanPath) != "" {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, h.indexPath)
}

func fileExists(distDir, requestPath string) bool {
	fullPath := filepath.Join(distDir, filepath.FromSlash(strings.TrimPrefix(requestPath, "/")))
	info, err := os.Stat(fullPath)
	return err == nil && !info.IsDir()
}

func resolveLiteDistDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv(liteDistEnv)); override != "" {
		if err := validateLiteDistDir(override); err != nil {
			return "", err
		}

		return override, nil
	}

	candidates := candidateRoots()
	for _, root := range candidates {
		for {
			distDir := filepath.Join(root, "apps", "lite", "dist")
			if err := validateLiteDistDir(distDir); err == nil {
				return distDir, nil
			}

			parent := filepath.Dir(root)
			if parent == root {
				break
			}
			root = parent
		}
	}

	return "", fmt.Errorf("unable to locate apps/lite/dist; set %s", liteDistEnv)
}

func newProxyService() *proxyService {
	return &proxyService{
		limiter:   newRateLimiter(proxyRateLimitBurst, proxyRateLimitWindow, time.Now),
		timeout:   proxyRequestTimeout,
		userAgent: proxyUserAgent,
		bodyLimit: proxyBodyLimit,
		lookupIP:  net.DefaultResolver.LookupIPAddr,
	}
}

func newRateLimiter(limit int, window time.Duration, now func() time.Time) *rateLimiter {
	if now == nil {
		now = time.Now
	}

	return &rateLimiter{
		now:    now,
		window: window,
		limit:  limit,
		hits:   make(map[string]rateBucket),
	}
}

func (p *proxyService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeProxyError(w, http.StatusMethodNotAllowed, "only GET is allowed")
		return
	}

	targetURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if targetURL == "" {
		writeProxyError(w, http.StatusBadRequest, "missing url")
		return
	}

	parsedURL, err := url.ParseRequestURI(targetURL)
	if err != nil {
		writeProxyError(w, http.StatusBadRequest, "invalid url")
		return
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		writeProxyError(w, http.StatusBadRequest, "only http and https urls are allowed")
		return
	}

	if err := validateProxyTarget(parsedURL); err != nil {
		writeProxyError(w, http.StatusBadRequest, err.Error())
		return
	}

	if !p.allowRequest(remoteIP(r.RemoteAddr)) {
		writeProxyError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), p.timeout)
	defer cancel()

	validatedAddrs, err := p.resolveProxyTargetAddresses(ctx, parsedURL)
	if err != nil {
		writeProxyError(w, http.StatusBadRequest, err.Error())
		return
	}

	client := p.client
	if client == nil {
		client = p.newProxyClient(validatedAddrs)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, "unable to create upstream request")
		return
	}

	req.Header.Set("User-Agent", p.userAgent)
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			writeProxyError(w, http.StatusGatewayTimeout, "upstream request timed out")
			return
		}

		writeProxyError(w, http.StatusBadGateway, "upstream request failed")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		writeProxyError(w, http.StatusBadGateway, "upstream returned an invalid response")
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, p.bodyLimit+1))
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, "unable to read upstream response")
		return
	}

	if int64(len(body)) > p.bodyLimit {
		writeProxyError(w, http.StatusBadGateway, "upstream response too large")
		return
	}

	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "application/xml; charset=utf-8"
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (p *proxyService) allowRequest(remoteAddr string) bool {
	if p == nil || p.limiter == nil {
		return true
	}

	return p.limiter.allow(remoteAddr)
}

func (r *rateLimiter) allow(key string) bool {
	if r == nil || r.limit <= 0 {
		return true
	}

	nowFn := r.now
	if nowFn == nil {
		nowFn = time.Now
	}
	now := nowFn()

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.swept.IsZero() || now.Sub(r.swept) >= r.window {
		for hitKey, bucket := range r.hits {
			if bucket.started.IsZero() || now.Sub(bucket.started) >= r.window {
				delete(r.hits, hitKey)
			}
		}
		r.swept = now
	}

	bucket := r.hits[key]
	if bucket.started.IsZero() || now.Sub(bucket.started) >= r.window {
		bucket = rateBucket{started: now}
	}

	bucket.count++
	r.hits[key] = bucket

	return bucket.count <= r.limit
}

func validateProxyTarget(target *url.URL) error {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return fmt.Errorf("target host is required")
	}

	lowerHost := strings.ToLower(host)
	switch {
	case lowerHost == "localhost",
		strings.HasSuffix(lowerHost, ".localhost"),
		strings.HasSuffix(lowerHost, ".local"),
		lowerHost == "metadata",
		lowerHost == "metadata.google.internal":
		return fmt.Errorf("target host is not allowed")
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		return nil
	}

	if isDisallowedProxyAddr(addr) {
		return fmt.Errorf("target host is not allowed")
	}

	return nil
}

func (p *proxyService) resolveProxyTargetAddresses(ctx context.Context, target *url.URL) ([]netip.Addr, error) {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return nil, fmt.Errorf("target host is required")
	}

	if _, err := netip.ParseAddr(host); err == nil {
		addr, _ := netip.ParseAddr(host)
		if isDisallowedProxyAddr(addr) {
			return nil, fmt.Errorf("target host is not allowed")
		}

		return []netip.Addr{addr.Unmap()}, nil
	}

	lookup := net.DefaultResolver.LookupIPAddr
	if p != nil && p.lookupIP != nil {
		lookup = p.lookupIP
	}

	addresses, err := lookup(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("unable to resolve target host")
	}

	if len(addresses) == 0 {
		return nil, fmt.Errorf("unable to resolve target host")
	}

	allowed := make([]netip.Addr, 0, len(addresses))
	for _, addr := range addresses {
		ip, ok := netip.AddrFromSlice(addr.IP)
		if !ok || isDisallowedProxyAddr(ip) {
			return nil, fmt.Errorf("target host is not allowed")
		}
		allowed = append(allowed, ip.Unmap())
	}

	return allowed, nil
}

func isDisallowedProxyAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsUnspecified() || addr.IsMulticast()
}

func (p *proxyService) newProxyClient(addrs []netip.Addr) *http.Client {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			_, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}

			return p.dialValidatedTargets(ctx, network, port, addrs)
		},
	}

	return &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func (p *proxyService) dialValidatedTargets(ctx context.Context, network, port string, addrs []netip.Addr) (net.Conn, error) {
	if len(addrs) == 0 {
		return nil, fmt.Errorf("target host is not allowed")
	}

	var lastErr error
	for _, addr := range addrs {
		conn, err := p.dialTarget(ctx, network, net.JoinHostPort(addr.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("unable to dial upstream")
	}

	return nil, lastErr
}

func (p *proxyService) dialTarget(ctx context.Context, network, address string) (net.Conn, error) {
	if p != nil && p.dialContext != nil {
		return p.dialContext(ctx, network, address)
	}

	var d net.Dialer
	return d.DialContext(ctx, network, address)
}

func remoteIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}

	return host
}

func writeProxyError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(message))
}

func candidateRoots() []string {
	roots := make([]string, 0, 2)

	if exe, err := os.Executable(); err == nil {
		roots = append(roots, filepath.Dir(exe))
	}

	if wd, err := os.Getwd(); err == nil {
		roots = append(roots, wd)
	}

	return roots
}

func validateLiteDistDir(distDir string) error {
	info, err := os.Stat(distDir)
	if err != nil {
		return err
	}

	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", distDir)
	}

	indexPath := filepath.Join(distDir, "index.html")
	indexInfo, err := os.Stat(indexPath)
	if err != nil {
		return err
	}

	if indexInfo.IsDir() {
		return fmt.Errorf("%s is not a file", indexPath)
	}

	return nil
}

func resolveCloudDBPath() string {
	if override := strings.TrimSpace(os.Getenv(cloudDBEnv)); override != "" {
		return override
	}

	return cloudDBDefaultPath
}

func openCloudSQLite(ctx context.Context, dbPath string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
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

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA foreign_keys=ON",
	}
	for _, pragma := range pragmas {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("initialize sqlite pragma %q: %w", pragma, err)
		}
	}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("verify sqlite database: %w", err)
	}

	return db, nil
}

func resolvePort() (string, error) {
	port := os.Getenv("PORT")
	if port == "" {
		return defaultPort, nil
	}

	n, err := strconv.Atoi(port)
	if err != nil {
		return "", fmt.Errorf("PORT must be numeric: %w", err)
	}

	if n < 1 || n > 65535 {
		return "", fmt.Errorf("PORT must be between 1 and 65535")
	}

	return port, nil
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
