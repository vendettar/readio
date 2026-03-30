package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "modernc.org/sqlite"
)

const defaultPort = "8080"

const cloudUIDistEnv = "READIO_CLOUD_UI_DIST_DIR"
const proxyUserAgent = "Readio/1.0 (Cloud Proxy)"
const proxyRequestTimeout = 10 * time.Second
const proxyBodyLimit = 2 << 20
const proxyRateLimitWindow = time.Minute
const proxyRateLimitBurst = 5
const proxyRoute = "/api/proxy"
const proxyMaxRedirects = 5
const cloudDBEnv = "READIO_CLOUD_DB_PATH"
const cloudDBDefaultPath = "./data/readio.db"

var proxyAllowedRequestHeaders = map[string]struct{}{
	"accept":            {},
	"accept-language":   {},
	"cache-control":     {},
	"if-modified-since": {},
	"if-none-match":     {},
	"if-range":          {},
	"pragma":            {},
	"range":             {},
}

var proxyAllowedResponseHeaders = []string{
	"Accept-Ranges",
	"Age",
	"Cache-Control",
	"Content-Disposition",
	"Content-Encoding",
	"Content-Length",
	"Content-Range",
	"Content-Type",
	"ETag",
	"Expires",
	"Last-Modified",
	"Retry-After",
	"Vary",
}

var proxyRangePattern = regexp.MustCompile(`^bytes=(?:\d+-\d*|\d*-\d+)$`)

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

type proxyRequestPayload struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers,omitempty"`
}

type proxyRequestSpec struct {
	targetURL *url.URL
	method    string
	headers   http.Header
	legacyGET bool
}

type proxyError struct {
	status  int
	message string
}

func (e *proxyError) Error() string {
	return e.message
}

var (
	cloudOpenSQLite sqliteOpener = func(ctx context.Context, dbPath string) (sqliteCloser, error) {
		return openCloudSQLite(ctx, dbPath)
	}
	cloudNewProxyService    = newProxyService
	cloudNewASRRelayService = newASRRelayService
	cloudCloseSQLite        = func(db sqliteCloser) error { return db.Close() }
	cloudListenAndServe     = func(ctx context.Context, server *http.Server) error {
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

	distDir, err := resolveCloudUIDistDir()
	if err != nil {
		return fmt.Errorf("unable to resolve cloud-ui dist: %w", err)
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
	asrRelay := cloudNewASRRelayService()
	discovery := newDiscoveryService()

	addr := ":" + port

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.Handle(asrRelayRoute, asrRelay)
	mux.Handle(asrVerifyRoute, asrRelay)
	mux.Handle(discoveryRoutePrefix, discovery)
	mux.Handle(proxyRoute, proxy)
	mux.Handle("/", handler)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
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
		return nil, fmt.Errorf("missing index.html in cloud-ui dist: %w", err)
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

func resolveCloudUIDistDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv(cloudUIDistEnv)); override != "" {
		if err := validateDistDir(override); err != nil {
			return "", err
		}

		return override, nil
	}

	candidates := candidateRoots()
	for _, root := range candidates {
		for {
			distDir := filepath.Join(root, "dist")
			if err := validateDistDir(distDir); err == nil {
				return distDir, nil
			}

			distDir = filepath.Join(root, "apps", "cloud-ui", "dist")
			if err := validateDistDir(distDir); err == nil {
				return distDir, nil
			}

			parent := filepath.Dir(root)
			if parent == root {
				break
			}
			root = parent
		}
	}

	return "", fmt.Errorf("unable to locate cloud-ui dist; set %s", cloudUIDistEnv)
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
	spec, err := p.parseProxyRequest(w, r)
	if err != nil {
		p.respondProxyError(w, err)
		return
	}

	if !p.allowRequest(remoteIP(r.RemoteAddr)) {
		writeProxyError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), p.timeout)
	defer cancel()

	validatedAddrs, err := p.resolveProxyTargetAddresses(ctx, spec.targetURL)
	if err != nil {
		p.respondProxyError(w, err)
		return
	}

	client := p.client
	if client == nil {
		client = p.newProxyClient(validatedAddrs)
	}

	req, err := http.NewRequestWithContext(ctx, spec.method, spec.targetURL.String(), nil)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, "unable to create upstream request")
		return
	}

	req.Header.Set("User-Agent", p.userAgent)
	for key, values := range spec.headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	if spec.legacyGET && req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8")
	}

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) {
			writeProxyError(w, http.StatusGatewayTimeout, "upstream request timed out")
			return
		}

		var proxyErr *proxyError
		if errors.As(err, &proxyErr) {
			writeProxyError(w, proxyErr.status, proxyErr.message)
			return
		}

		writeProxyError(w, http.StatusBadGateway, "upstream request failed")
		return
	}
	defer resp.Body.Close()

	copyProxyResponseHeaders(w.Header(), resp.Header)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Expose-Headers", strings.Join(proxyAllowedResponseHeaders, ", "))
	w.WriteHeader(resp.StatusCode)

	if spec.method == http.MethodHead {
		return
	}

	if _, err := io.Copy(w, resp.Body); err != nil && ctx.Err() != nil {
		slog.Warn("proxy body copy interrupted", "error", err)
	}
}

func (p *proxyService) parseProxyRequest(w http.ResponseWriter, r *http.Request) (*proxyRequestSpec, error) {
	switch r.Method {
	case http.MethodGet:
		rawTarget := strings.TrimSpace(r.URL.Query().Get("url"))
		if rawTarget == "" {
			return nil, &proxyError{status: http.StatusBadRequest, message: "missing url"}
		}

		parsedURL, err := parseProxyTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}

		if err := validateProxyTarget(parsedURL); err != nil {
			return nil, &proxyError{status: http.StatusBadRequest, message: err.Error()}
		}

		return &proxyRequestSpec{
			targetURL: parsedURL,
			method:    http.MethodGet,
			headers:   make(http.Header),
			legacyGET: true,
		}, nil
	case http.MethodPost:
		if ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))); ct != "" && !strings.HasPrefix(ct, "application/json") {
			return nil, &proxyError{status: http.StatusBadRequest, message: "content-type must be application/json"}
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, p.bodyLimit+1))
		if err != nil {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy request payload"}
		}
		if int64(len(body)) > p.bodyLimit {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy request payload"}
		}

		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()

		var payload proxyRequestPayload
		if err := decoder.Decode(&payload); err != nil {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy request payload"}
		}

		var trailing json.RawMessage
		if err := decoder.Decode(&trailing); err != io.EOF {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy request payload"}
		}

		rawTarget := strings.TrimSpace(payload.URL)
		if rawTarget == "" {
			return nil, &proxyError{status: http.StatusBadRequest, message: "missing url"}
		}

		parsedURL, err := parseProxyTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}

		if err := validateProxyTarget(parsedURL); err != nil {
			return nil, &proxyError{status: http.StatusBadRequest, message: err.Error()}
		}

		method := strings.ToUpper(strings.TrimSpace(payload.Method))
		if method == "" {
			return nil, &proxyError{status: http.StatusBadRequest, message: "missing method"}
		}
		if method != http.MethodGet && method != http.MethodHead {
			return nil, &proxyError{status: http.StatusBadRequest, message: "unsupported proxy method"}
		}

		headers, err := validateProxyForwardHeaders(payload.Headers)
		if err != nil {
			var proxyErr *proxyError
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy headers"}
		}

		return &proxyRequestSpec{
			targetURL: parsedURL,
			method:    method,
			headers:   headers,
		}, nil
	default:
		return nil, &proxyError{status: http.StatusMethodNotAllowed, message: "only GET and POST are allowed"}
	}
}

func (p *proxyService) respondProxyError(w http.ResponseWriter, err error) {
	var proxyErr *proxyError
	if errors.As(err, &proxyErr) {
		writeProxyError(w, proxyErr.status, proxyErr.message)
		return
	}

	writeProxyError(w, http.StatusBadGateway, err.Error())
}

func parseProxyTargetURL(raw string) (*url.URL, error) {
	parsedURL, err := url.ParseRequestURI(raw)
	if err != nil {
		return nil, &proxyError{status: http.StatusBadRequest, message: "invalid url"}
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, &proxyError{status: http.StatusBadRequest, message: "only http and https urls are allowed"}
	}
	if parsedURL.User != nil {
		return nil, &proxyError{status: http.StatusBadRequest, message: "userinfo is not allowed"}
	}

	return parsedURL, nil
}

func validateProxyForwardHeaders(headers map[string]string) (http.Header, error) {
	forwarded := make(http.Header)
	for rawName, rawValue := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		value := strings.TrimSpace(rawValue)
		if name == "" {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy headers"}
		}

		if _, ok := proxyAllowedRequestHeaders[strings.ToLower(name)]; !ok {
			return nil, &proxyError{status: http.StatusBadRequest, message: "unsupported proxy header"}
		}

		if name == "Range" && !proxyRangePattern.MatchString(value) {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid range header"}
		}

		if value == "" {
			return nil, &proxyError{status: http.StatusBadRequest, message: "invalid proxy headers"}
		}

		forwarded.Set(name, value)
	}

	return forwarded, nil
}

func copyProxyResponseHeaders(dst http.Header, src http.Header) {
	for _, headerName := range proxyAllowedResponseHeaders {
		value := strings.TrimSpace(src.Get(headerName))
		if value != "" {
			dst.Set(headerName, value)
		}
	}
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
			return nil, &proxyError{status: http.StatusBadRequest, message: "target host is not allowed"}
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
			return nil, &proxyError{status: http.StatusBadRequest, message: "target host is not allowed"}
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
	pinnedAddrs := append([]netip.Addr(nil), addrs...)
	var pinnedOnce sync.Mutex
	pinnedUsed := false

	transport := &http.Transport{
		DisableCompression: true,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}

			pinnedOnce.Lock()
			usePinned := !pinnedUsed && len(pinnedAddrs) > 0
			if usePinned {
				pinnedUsed = true
			}
			pinnedOnce.Unlock()

			if usePinned {
				return p.dialValidatedTargets(ctx, network, port, pinnedAddrs)
			}

			validatedAddrs, err := p.resolveProxyTargetAddresses(ctx, &url.URL{Host: host})
			if err != nil {
				return nil, err
			}

			return p.dialValidatedTargets(ctx, network, port, validatedAddrs)
		},
	}

	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= proxyMaxRedirects {
				return &proxyError{status: http.StatusBadGateway, message: "redirect chain too long"}
			}

			if err := validateProxyTarget(req.URL); err != nil {
				return &proxyError{status: http.StatusBadRequest, message: err.Error()}
			}

			if _, err := p.resolveProxyTargetAddresses(req.Context(), req.URL); err != nil {
				return &proxyError{status: http.StatusBadRequest, message: err.Error()}
			}

			if len(via) > 0 && len(via[0].Header) > 0 {
				copyProxyRequestHeaders(req.Header, via[0].Header)
			}

			req.Header.Set("User-Agent", p.userAgent)
			return nil
		},
	}

	if p != nil && p.timeout > 0 {
		client.Timeout = p.timeout
	}

	return client
}

func copyProxyRequestHeaders(dst http.Header, src http.Header) {
	dst.Del("Accept")
	dst.Del("Accept-Language")
	dst.Del("Cache-Control")
	dst.Del("If-Modified-Since")
	dst.Del("If-None-Match")
	dst.Del("If-Range")
	dst.Del("Pragma")
	dst.Del("Range")

	for _, headerName := range []string{
		"Accept",
		"Accept-Language",
		"Cache-Control",
		"If-Modified-Since",
		"If-None-Match",
		"If-Range",
		"Pragma",
		"Range",
	} {
		if value := strings.TrimSpace(src.Get(headerName)); value != "" {
			dst.Set(headerName, value)
		}
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

func validateDistDir(distDir string) error {
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
