package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"flag"

	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"

	"os/signal"

	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

const defaultPort = "8080"

const browserConfigRoute = "/api/v1/config"

const proxyBrowserLikeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Readio/1.0"
const proxyRequestTimeout = 10 * time.Second
const proxyBodyLimit = 2 << 20
const proxyRateLimitWindow = time.Minute
const proxyRateLimitBurst = 5
const proxyRateLimitBurstEnv = "READIO_PROXY_RATE_LIMIT_BURST"
const proxyRateLimitWindowMsEnv = "READIO_PROXY_RATE_LIMIT_WINDOW_MS"
const proxyAllowedOriginsEnv = "READIO_PROXY_ALLOWED_ORIGINS"
const proxyRoute = "/api/proxy"
const proxyMaxRedirects = 20
const proxyAuthHeader = "X-Proxy-Token"
const cloudDBEnv = "READIO_CLOUD_DB_PATH"
const defaultRuntimeAppName = "Readio"
const defaultRuntimeAppVersion = "1.0.0"
const defaultDictionaryAPIURL = "https://api.dictionaryapi.dev/api/v2/entries/en/"
const defaultDictionaryTransport = "direct"
const defaultPodcastCountry = "us"
const defaultLanguage = "en"
const defaultFallbackPodcastImage = "/placeholder-podcast.svg"
const cloudSQLiteMigrationDialect = "sqlite3"
const cloudSQLiteMigrationDir = "migrations"

// browserEnvAllowlist is the exhaustive set of keys emitted into /env.js.
// Every key listed here MUST have a corresponding entry in buildBrowserRuntimeEnv.
var browserEnvAllowlist = []string{
	"READIO_APP_NAME",
	"READIO_APP_VERSION",
	"READIO_ASR_RELAY_PUBLIC_TOKEN",
	"READIO_ASR_PROVIDER",
	"READIO_ASR_MODEL",
	"READIO_ENABLED_ASR_PROVIDERS",
	"READIO_DISABLED_ASR_PROVIDERS",
	"READIO_EN_DICTIONARY_API_URL",
	"READIO_EN_DICTIONARY_API_TRANSPORT",
	"READIO_DEFAULT_PODCAST_CONTENT_COUNTRY",
	"READIO_DEFAULT_LANGUAGE",
	"READIO_FALLBACK_PODCAST_IMAGE",
	"READIO_NETWORK_PROXY_URL",
	"READIO_NETWORK_PROXY_AUTH_HEADER",
	"READIO_NETWORK_PROXY_AUTH_VALUE",
	"VITE_GRAFANA_FARO_URL",
	"VITE_GRAFANA_FARO_APP_NAME",
	"VITE_GRAFANA_FARO_ENV",
	"VITE_GRAFANA_FARO_SAMPLE_RATE",
}

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

var proxyAllowedCORSRequestHeaders = []string{
	"Content-Type",
	"Accept",
	proxyAuthHeader,
	"Range",
	"If-Range",
	"If-None-Match",
	"If-Modified-Since",
	"Cache-Control",
	"Pragma",
	"Accept-Language",
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

type proxyService struct {
	client         *http.Client
	limiter        *rateLimiter
	allowedOrigins []string
	timeout        time.Duration
	userAgent      string
	bodyLimit      int64
	lookupIP       func(context.Context, string) ([]net.IPAddr, error)
	dialContext    func(context.Context, string, string) (net.Conn, error)
	trustedProxies trustedProxySet
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
}

type proxyError struct {
	status  int
	code    string
	message string
}

func (e *proxyError) Error() string {
	return e.message
}

func newProxyError(status int, code, message string) *proxyError {
	return &proxyError{status: status, code: code, message: message}
}

//go:embed migrations/*.sql
var cloudSQLiteMigrations embed.FS

var (
	cloudOpenSQLite sqliteOpener = func(ctx context.Context, dbPath string) (sqliteCloser, error) {
		return openCloudSQLite(ctx, dbPath)
	}
	cloudNewProxyService     = newProxyService
	cloudNewASRRelayService  = newASRRelayService
	cloudRunSQLiteMigrations = func(ctx context.Context, db *sql.DB) error {
		return runCloudSQLiteMigrations(ctx, db)
	}
	cloudCloseSQLite    = func(db sqliteCloser) error { return db.Close() }
	cloudListenAndServe = func(_ context.Context, server *http.Server) error {
		return server.ListenAndServe()
	}
	cloudShutdownServer = func(ctx context.Context, server *http.Server) error {
		return server.Shutdown(ctx)
	}
	cloudNotifyContext = signal.NotifyContext
)

func main() {
	checkHealth := flag.Bool("check-health", false, "执行健康检查并退出")
	flag.Parse()

	if *checkHealth {
		port := os.Getenv("PORT")
		if port == "" {
			port = defaultPort
		}
		client := http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get("http://localhost:" + port + "/healthz")
		if err != nil {
			fmt.Printf("Health check failed: %v\n", err)
			os.Exit(1)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			fmt.Printf("Health check failed: status %d\n", resp.StatusCode)
			os.Exit(1)
		}
		os.Exit(0)
	}

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

	dbPath, err := resolveCloudDBPath()
	if err != nil {
		return fmt.Errorf("invalid cloud db path: %w", err)
	}
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

	shutdownObservability, err := initObservability(parent)
	if err != nil {
		return fmt.Errorf("unable to initialize observability: %w", err)
	}
	defer func() {
		flushCtx, flushCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer flushCancel()
		if flushErr := shutdownObservability(flushCtx); flushErr != nil {
			slog.Warn("observability shutdown failed", "error", flushErr)
		}
	}()

	lokiShipper, err := initLokiShipper()
	if err != nil {
		return fmt.Errorf("unable to initialize Loki log shipping: %w", err)
	}
	defer func() {
		flushCtx, flushCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer flushCancel()
		if flushErr := lokiShipper.Shutdown(flushCtx); flushErr != nil {
			slog.Warn("loki shutdown failed", "error", flushErr)
		}
	}()

	proxy := cloudNewProxyService()
	asrRelay := cloudNewASRRelayService()
	discovery := newDiscoveryService()

	addr := ":" + port

	mux := newCloudMux(proxy, asrRelay, discovery)

	_ = setupAdminHandler(mux, lokiShipper)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("starting cloud scaffold server", "addr", addr, "dbPath", dbPath)

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

func newCloudMux(proxy http.Handler, asrRelay http.Handler, discovery http.Handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc(browserConfigRoute, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Access-Control-Allow-Origin", "*") // Config is public-info
		_ = json.NewEncoder(w).Encode(buildBrowserRuntimeEnv(r))
	})
	mux.Handle(asrRelayRoute, asrRelay)
	mux.Handle(asrVerifyRoute, asrRelay)
	mux.Handle(discoveryRoutePrefix, discovery)
	mux.Handle(proxyRoute, proxy)

	return mux
}

// buildBrowserRuntimeEnv returns browser-safe runtime config.
// Key set must match browserEnvAllowlist. Do not add keys here
// without also adding them to the allowlist slice.
func buildBrowserRuntimeEnv(r *http.Request) map[string]any {
	return map[string]any{
		"READIO_APP_NAME":    envOrDefault("READIO_APP_NAME", defaultRuntimeAppName),
		"READIO_APP_VERSION": envOrDefault("READIO_APP_VERSION", defaultRuntimeAppVersion),
		// This browser-visible value is abuse-control only; it is not a secret boundary.
		"READIO_ASR_RELAY_PUBLIC_TOKEN":      strings.TrimSpace(os.Getenv(asrRelayPublicTokenEnv)),
		"READIO_ASR_PROVIDER":                strings.TrimSpace(os.Getenv("READIO_ASR_PROVIDER")),
		"READIO_ASR_MODEL":                   strings.TrimSpace(os.Getenv("READIO_ASR_MODEL")),
		"READIO_ENABLED_ASR_PROVIDERS":       strings.TrimSpace(os.Getenv("READIO_ENABLED_ASR_PROVIDERS")),
		"READIO_DISABLED_ASR_PROVIDERS":      strings.TrimSpace(os.Getenv("READIO_DISABLED_ASR_PROVIDERS")),
		"READIO_EN_DICTIONARY_API_URL":       envOrDefault("READIO_EN_DICTIONARY_API_URL", defaultDictionaryAPIURL),
		"READIO_EN_DICTIONARY_API_TRANSPORT": envOrDefault("READIO_EN_DICTIONARY_API_TRANSPORT", defaultDictionaryTransport),
		"READIO_DEFAULT_PODCAST_CONTENT_COUNTRY": envOrDefault(
			"READIO_DEFAULT_PODCAST_CONTENT_COUNTRY",
			defaultPodcastCountry,
		),
		"READIO_DEFAULT_LANGUAGE": envOrDefault("READIO_DEFAULT_LANGUAGE", defaultLanguage),
		"READIO_FALLBACK_PODCAST_IMAGE": envOrDefault(
			"READIO_FALLBACK_PODCAST_IMAGE",
			defaultFallbackPodcastImage,
		),
		"READIO_NETWORK_PROXY_URL":         envOrDefault("READIO_NETWORK_PROXY_URL", "/api/proxy"),
		"READIO_NETWORK_PROXY_AUTH_HEADER": envOrDefault("READIO_NETWORK_PROXY_AUTH_HEADER", ""),
		"READIO_NETWORK_PROXY_AUTH_VALUE":  envOrDefault("READIO_NETWORK_PROXY_AUTH_VALUE", ""),
		"VITE_GRAFANA_FARO_URL":            envOrDefault("VITE_GRAFANA_FARO_URL", ""),
		"VITE_GRAFANA_FARO_APP_NAME":       envOrDefault("VITE_GRAFANA_FARO_APP_NAME", ""),
		"VITE_GRAFANA_FARO_ENV":            envOrDefault("VITE_GRAFANA_FARO_ENV", ""),
		"VITE_GRAFANA_FARO_SAMPLE_RATE":    envOrDefault("VITE_GRAFANA_FARO_SAMPLE_RATE", "0"),
	}
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func resolveProxyRateLimitBurst() int {
	return envIntOrDefault(proxyRateLimitBurstEnv, proxyRateLimitBurst, true)
}

func resolveProxyRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(proxyRateLimitWindowMsEnv, proxyRateLimitWindow)
}

func newProxyService() *proxyService {
	burst := resolveProxyRateLimitBurst()
	if burst <= 0 {
		slog.Warn("application-layer rate limiting disabled for /api/proxy", "READIO_PROXY_RATE_LIMIT_BURST", burst)
	}
	return &proxyService{
		limiter:        newRateLimiter(burst, resolveProxyRateLimitWindow(), time.Now),
		allowedOrigins: resolveProxyAllowedOrigins(),
		timeout:        proxyRequestTimeout,
		userAgent:      resolveProxyUpstreamUserAgent(),
		bodyLimit:      proxyBodyLimit,
		lookupIP:       net.DefaultResolver.LookupIPAddr,
		trustedProxies: loadTrustedProxySet(slog.Default()),
	}
}

func resolveProxyUpstreamUserAgent() string {
	// Some media hosts reject obvious service-style proxy user agents. The proxy
	// keeps a browser-like upstream UA so audio fetch and playback fallback share
	// the same acceptance profile.
	return proxyBrowserLikeUserAgent
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
	start := time.Now()
	errClass := "none"
	var httpStatus int
	var upstreamKind string
	var upstreamHost string
	attemptedUpstream := false
	allowedOrigin := ""

	defer func() {
		elapsed := time.Since(start)
		recordHTTPMetric("proxy/media", httpStatus, errClass, elapsed)
		if attemptedUpstream && upstreamKind != "" {
			recordUpstreamMetric(upstreamKind, "proxy/media", httpStatus, errClass, CacheStatusUncached, elapsed)
		}
		slog.Info("proxy request",
			"route", "proxy/media",
			"upstream_kind", upstreamKind,
			"upstream_host", upstreamHost,
			"elapsed_ms", elapsed.Milliseconds(),
			"error_class", errClass,
			"status", httpStatus,
		)
	}()

	// CORS Preflight
	if r.Method == http.MethodOptions {
		httpStatus = http.StatusNoContent
		allowedOrigin, originErr := p.authorizeOrigin(r)
		if originErr == nil && allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(proxyAllowedCORSRequestHeaders, ", "))
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.Header().Set("Vary", "Origin")
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	allowedOrigin = p.corsAllowedOrigin(r)

	spec, pErr := p.parseProxyRequest(w, r)
	if pErr != nil {
		httpStatus = http.StatusBadRequest
		errClass = "invalid_request"
		var proxyErr *proxyError
		if errors.As(pErr, &proxyErr) {
			httpStatus = proxyErr.status
			errClass = classifyProxyParseError(proxyErr)
		}
		p.respondProxyError(w, pErr, allowedOrigin)
		return
	}
	upstreamKind = "proxy"
	upstreamHost = spec.targetURL.Host

	var originErr error
	allowedOrigin, originErr = p.authorizeOrigin(r)
	if originErr != nil {
		httpStatus = http.StatusForbidden
		errClass = "origin_not_allowed"
		p.respondProxyError(w, originErr, allowedOrigin)
		return
	}

	if !p.allowRequest(effectiveClientIP(r, p.trustedProxies)) {
		httpStatus = http.StatusTooManyRequests
		errClass = "rate_limit"
		writeProxyError(w, http.StatusTooManyRequests, "PROXY_RATE_LIMIT_EXCEEDED", "rate limit exceeded", allowedOrigin)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), p.timeout)
	defer cancel()

	validatedAddrs, err := p.resolveProxyTargetAddresses(ctx, spec.targetURL)
	if err != nil {
		httpStatus = http.StatusBadGateway
		errClass = "ssrf"
		p.respondProxyError(w, err, allowedOrigin)
		return
	}

	client := p.client
	if client == nil {
		client = p.newProxyClient(validatedAddrs)
	}

	req, err := http.NewRequestWithContext(ctx, spec.method, spec.targetURL.String(), nil)
	if err != nil {
		httpStatus = http.StatusBadGateway
		errClass = "create_request"
		writeProxyError(w, http.StatusBadGateway, "PROXY_CREATE_REQUEST_FAILED", "unable to create upstream request", allowedOrigin)
		return
	}

	req.Header.Set("User-Agent", p.userAgent)
	for key, values := range spec.headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	attemptedUpstream = true
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) {
			httpStatus = http.StatusGatewayTimeout
			errClass = "timeout"
			writeProxyError(w, http.StatusGatewayTimeout, "PROXY_UPSTREAM_TIMEOUT", "upstream request timed out", allowedOrigin)
			return
		}

		var proxyErr *proxyError
		if errors.As(err, &proxyErr) {
			httpStatus = proxyErr.status
			errClass = "upstream"
			writeProxyError(w, proxyErr.status, proxyErr.code, proxyErr.message, allowedOrigin)
			return
		}

		httpStatus = http.StatusBadGateway
		errClass = "upstream"
		writeProxyError(w, http.StatusBadGateway, "PROXY_UPSTREAM_FAILED", "upstream request failed", allowedOrigin)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	copyProxyResponseHeaders(w.Header(), resp.Header, spec.method)
	applyProxyCORSHeaders(w.Header(), allowedOrigin)
	httpStatus = resp.StatusCode
	w.WriteHeader(resp.StatusCode)

	if spec.method == http.MethodHead {
		return
	}

	if _, err := io.Copy(w, resp.Body); err != nil {
		if ctx.Err() != nil {
			slog.Warn("proxy body copy interrupted", "error", err, "target_host", spec.targetURL.Host)
			return
		}
		slog.Warn("proxy body copy failed", "error", err, "target_host", spec.targetURL.Host)
		return
	}
}

func (p *proxyService) corsAllowedOrigin(r *http.Request) string {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return ""
	}

	if len(p.allowedOrigins) > 0 {
		if match, ok := matchOrigin(p.allowedOrigins, origin); ok {
			return match
		}
		return ""
	}

	requestScheme, requestHost, ok := proxyRequestOriginContext(r, p.trustedProxies)
	if !ok {
		return ""
	}
	parsed, err := url.Parse(origin)
	if err != nil || !isSameOrigin(parsed.Scheme, parsed.Host, requestScheme, requestHost) {
		return ""
	}
	return origin
}

func (p *proxyService) parseProxyRequest(_ http.ResponseWriter, r *http.Request) (*proxyRequestSpec, error) {
	switch r.Method {
	case http.MethodGet:
		rawTarget := r.URL.Query().Get("url")
		if rawTarget == "" {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_MISSING_URL", "missing url")
		}

		parsedURL, err := parseProxyTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}

		if err := validateProxyTarget(parsedURL); err != nil {
			var proxyErr *proxyError
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_URL", err.Error())
		}

		headers, err := filterProxyForwardHeaders(r.Header)
		if err != nil {
			var proxyErr *proxyError
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}

		return &proxyRequestSpec{
			targetURL: parsedURL,
			method:    http.MethodGet,
			headers:   headers,
		}, nil

	case http.MethodPost:
		if ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))); ct != "" && !strings.HasPrefix(ct, "application/json") {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_CONTENT_TYPE", "content-type must be application/json")
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, p.bodyLimit+1))
		if err != nil {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		if int64(len(body)) > p.bodyLimit {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}

		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()

		var payload proxyRequestPayload
		if err := decoder.Decode(&payload); err != nil {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}

		var trailing json.RawMessage
		if err := decoder.Decode(&trailing); err != io.EOF {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}

		rawTarget := strings.TrimSpace(payload.URL)
		if rawTarget == "" {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_MISSING_URL", "missing url")
		}

		parsedURL, err := parseProxyTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}

		if err := validateProxyTarget(parsedURL); err != nil {
			var proxyErr *proxyError
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_URL", err.Error())
		}

		method := strings.ToUpper(strings.TrimSpace(payload.Method))
		if method == "" {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_MISSING_METHOD", "missing method")
		}
		if method != http.MethodGet && method != http.MethodHead {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_UNSUPPORTED_METHOD", "unsupported proxy method")
		}

		headers, err := validateProxyForwardHeaders(proxyPayloadHeaders(payload.Headers))
		if err != nil {
			var proxyErr *proxyError
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}

		return &proxyRequestSpec{
			targetURL: parsedURL,
			method:    method,
			headers:   headers,
		}, nil
	default:
		return nil, newProxyError(http.StatusMethodNotAllowed, "PROXY_METHOD_NOT_ALLOWED", "only GET and POST are allowed")
	}
}

func (p *proxyService) respondProxyError(w http.ResponseWriter, err error, allowedOrigin string) {
	var proxyErr *proxyError
	if errors.As(err, &proxyErr) {
		if proxyErr.status == http.StatusMethodNotAllowed {
			w.Header().Set("Allow", "GET, POST")
		}
		writeProxyError(w, proxyErr.status, proxyErr.code, proxyErr.message, allowedOrigin)
		return
	}

	writeProxyError(w, http.StatusBadGateway, "PROXY_UPSTREAM_FAILED", err.Error(), allowedOrigin)
}

func classifyProxyParseError(err *proxyError) string {
	switch err.status {
	case http.StatusMethodNotAllowed:
		return "invalid_method"
	default:
		return "invalid_request"
	}
}

func parseProxyTargetURL(raw string) (*url.URL, error) {
	parsedURL, err := url.ParseRequestURI(raw)
	if err != nil {
		return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_URL", "invalid url")
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_URL", "only http and https urls are allowed")
	}
	if parsedURL.User != nil {
		return nil, newProxyError(http.StatusBadRequest, "PROXY_USERINFO_NOT_ALLOWED", "userinfo is not allowed")
	}

	return parsedURL, nil
}

func proxyPayloadHeaders(headers map[string]string) http.Header {
	payloadHeaders := make(http.Header, len(headers))
	for key, value := range headers {
		payloadHeaders.Set(key, value)
	}
	return payloadHeaders
}

func validateProxyForwardHeaders(headers http.Header) (http.Header, error) {
	forwarded := make(http.Header)
	rangeValueCount := 0
	for rawName, values := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		if name == "" {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}

		if _, ok := proxyAllowedRequestHeaders[strings.ToLower(name)]; !ok {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_UNSUPPORTED_HEADER", "unsupported proxy header")
		}

		for _, rawValue := range values {
			value := strings.TrimSpace(rawValue)
			if value == "" {
				return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
			}

			if name == "Range" {
				rangeValueCount++
				if rangeValueCount > 1 || !proxyRangePattern.MatchString(value) {
					return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_RANGE", "invalid range header")
				}
			}

			forwarded.Add(name, value)
		}
	}

	return forwarded, nil
}

func filterProxyForwardHeaders(headers http.Header) (http.Header, error) {
	// GET /api/proxy is only used by browser-native media fallback, so we keep
	// a narrow allowlist and silently drop ambient browser headers instead of
	// treating them as caller-controlled contract violations like the POST path.
	forwarded := make(http.Header)
	rangeValueCount := 0
	for rawName, values := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		if name == "" {
			continue
		}

		if _, ok := proxyAllowedRequestHeaders[strings.ToLower(name)]; !ok {
			continue
		}

		for _, rawValue := range values {
			value := strings.TrimSpace(rawValue)
			if value == "" {
				continue
			}

			if name == "Range" {
				rangeValueCount++
				if rangeValueCount > 1 || !proxyRangePattern.MatchString(value) {
					return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_RANGE", "invalid range header")
				}
			}

			forwarded.Add(name, value)
		}
	}

	return forwarded, nil
}

func copyProxyResponseHeaders(dst http.Header, src http.Header, method string) {
	for _, headerName := range proxyAllowedResponseHeaders {
		if headerName == "Content-Length" && method != http.MethodHead {
			continue
		}
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
		return newProxyError(http.StatusBadRequest, "PROXY_INVALID_URL", "target host is required")
	}

	lowerHost := strings.ToLower(host)
	switch {
	case lowerHost == "localhost",
		strings.HasSuffix(lowerHost, ".localhost"),
		strings.HasSuffix(lowerHost, ".local"),
		lowerHost == "metadata",
		lowerHost == "metadata.google.internal":
		return newProxyError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		return nil
	}

	if isDisallowedProxyAddr(addr) {
		return newProxyError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}

	return nil
}

func (p *proxyService) authorizeOrigin(r *http.Request) (string, error) {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		if r.Method != http.MethodGet {
			return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
		}

		// Browser media-element GET requests may omit Origin, so the native-audio
		// fallback path proves same-origin intent via Referer instead.
		referer := strings.TrimSpace(r.Header.Get("Referer"))
		if referer == "" {
			return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
		}

		parsedReferer, err := url.Parse(referer)
		if err != nil || parsedReferer.Host == "" || parsedReferer.User != nil {
			return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
		}
		if parsedReferer.Scheme != "http" && parsedReferer.Scheme != "https" {
			return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
		}

		normalizedReferer := parsedReferer.Scheme + "://" + parsedReferer.Host
		if len(p.allowedOrigins) > 0 {
			if match, ok := matchOrigin(p.allowedOrigins, normalizedReferer); ok {
				return match, nil
			}
			return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
		}

		requestScheme, requestHost, ok := proxyRequestOriginContext(r, p.trustedProxies)
		if !ok || !isSameOrigin(parsedReferer.Scheme, parsedReferer.Host, requestScheme, requestHost) {
			return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
		}
		return "", nil
	}

	if len(p.allowedOrigins) > 0 {
		if match, ok := matchOrigin(p.allowedOrigins, origin); ok {
			return match, nil
		}
		return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}

	requestScheme, requestHost, ok := proxyRequestOriginContext(r, p.trustedProxies)
	if !ok {
		return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}
	parsed, err := url.Parse(origin)
	if err != nil || !isSameOrigin(parsed.Scheme, parsed.Host, requestScheme, requestHost) {
		return "", newProxyError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}

	return origin, nil
}

func proxyRequestOriginContext(r *http.Request, trusted trustedProxySet) (scheme string, host string, ok bool) {
	peerHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "", "", false
	}
	peerIP := net.ParseIP(peerHost)
	if peerIP == nil || (!peerIP.IsLoopback() && !trusted.contains(peerIP)) {
		return "", "", false
	}

	requestScheme := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if requestScheme != "http" && requestScheme != "https" {
		return "", "", false
	}
	requestHost, ok := canonicalForwardedHost(r.Header.Get("X-Forwarded-Host"))
	if !ok {
		return "", "", false
	}

	return requestScheme, requestHost, true
}

func canonicalForwardedHost(raw string) (string, bool) {
	host := strings.TrimSpace(strings.Split(raw, ",")[0])
	if host == "" || strings.ContainsAny(host, "/\\") {
		return "", false
	}

	parsed, err := url.Parse("//" + host)
	if err != nil || parsed.User != nil || parsed.Host == "" || parsed.Host != host {
		return "", false
	}

	return host, true
}

func resolveProxyAllowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv(proxyAllowedOriginsEnv))
	if raw == "" {
		return nil
	}

	var origins []string
	for _, part := range strings.Split(raw, ",") {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}
		// Basic validation: must have scheme and host
		if !strings.Contains(candidate, "://") {
			continue
		}
		origins = append(origins, candidate)
	}

	if len(origins) == 0 {
		return nil
	}
	return origins
}

func applyProxyCORSHeaders(headers http.Header, allowedOrigin string) {
	if allowedOrigin == "" || allowedOrigin == "*" {
		return
	}

	headers.Set("Access-Control-Allow-Origin", allowedOrigin)
	headers.Set("Access-Control-Expose-Headers", strings.Join(proxyAllowedResponseHeaders, ", "))
	headers.Add("Vary", "Origin")
}

func matchOrigin(patterns []string, origin string) (string, bool) {
	if origin == "" {
		return "", false
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return "", false
	}
	normalized := parsed.Scheme + "://" + parsed.Host

	for _, p := range patterns {
		if p == normalized {
			return normalized, true
		}
		// Wildcard support: https://*.readio.top matches https://foo.readio.top and https://readio.top
		if strings.Contains(p, "://*.") {
			parts := strings.SplitN(p, "://*.", 2)
			scheme := parts[0]
			suffix := "." + parts[1]
			base := parts[1]

			if parsed.Scheme == scheme {
				host := parsed.Hostname()
				if strings.HasSuffix(host, suffix) || host == base {
					return normalized, true
				}
			}
		}
	}
	return "", false
}

func (p *proxyService) resolveProxyTargetAddresses(ctx context.Context, target *url.URL) ([]netip.Addr, error) {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return nil, newProxyError(http.StatusBadRequest, "PROXY_INVALID_URL", "target host is required")
	}

	if _, err := netip.ParseAddr(host); err == nil {
		addr, _ := netip.ParseAddr(host)
		if isDisallowedProxyAddr(addr) {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
		}

		return []netip.Addr{addr.Unmap()}, nil
	}

	lookup := net.DefaultResolver.LookupIPAddr
	if p != nil && p.lookupIP != nil {
		lookup = p.lookupIP
	}

	addresses, err := lookup(ctx, host)
	if err != nil {
		return nil, newProxyError(http.StatusBadGateway, "PROXY_RESOLVE_FAILED", "unable to resolve target host")
	}

	if len(addresses) == 0 {
		return nil, newProxyError(http.StatusBadGateway, "PROXY_RESOLVE_FAILED", "unable to resolve target host")
	}

	allowed := make([]netip.Addr, 0, len(addresses))
	for _, addr := range addresses {
		ip, ok := netip.AddrFromSlice(addr.IP)
		if !ok || isDisallowedProxyAddr(ip) {
			return nil, newProxyError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
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
				return newProxyError(http.StatusBadGateway, "PROXY_REDIRECT_TOO_LONG", "redirect chain too long")
			}

			if err := validateProxyTarget(req.URL); err != nil {
				return err
			}

			if _, err := p.resolveProxyTargetAddresses(req.Context(), req.URL); err != nil {
				return err
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
		return nil, newProxyError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}

	for _, addr := range addrs {
		conn, err := p.dialTarget(ctx, network, net.JoinHostPort(addr.String(), port))
		if err == nil {
			return conn, nil
		}
	}

	return nil, newProxyError(http.StatusBadGateway, "PROXY_DIAL_FAILED", "unable to dial upstream")
}

func (p *proxyService) dialTarget(ctx context.Context, network, address string) (net.Conn, error) {
	if p != nil && p.dialContext != nil {
		return p.dialContext(ctx, network, address)
	}

	var d net.Dialer
	return d.DialContext(ctx, network, address)
}

func generateRequestID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err == nil {
		return fmt.Sprintf("%x", buf[:])
	}
	// Fallback to timestamp if crypto/rand fails (extremely rare)
	return fmt.Sprintf("fallback-%x", time.Now().UnixNano())
}

func writeProxyError(w http.ResponseWriter, status int, code string, message string, allowedOrigin string) {
	if strings.TrimSpace(code) == "" {
		code = "PROXY_UNKNOWN_ERROR"
	}
	requestID := generateRequestID()
	applyProxyCORSHeaders(w.Header(), allowedOrigin)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	payload := map[string]string{
		"code":       code,
		"message":    message,
		"request_id": requestID,
	}
	_ = json.NewEncoder(w).Encode(payload)
	slog.Info("proxy error response", "request_id", requestID, "code", code, "status", status)
}

func resolveCloudDBPath() (string, error) {
	if override := strings.TrimSpace(os.Getenv(cloudDBEnv)); override != "" {
		if !filepath.IsAbs(override) {
			return "", fmt.Errorf("%s must be an absolute path", cloudDBEnv)
		}

		return filepath.Clean(override), nil
	}

	return "", fmt.Errorf("%s is required", cloudDBEnv)
}

func buildCloudSQLiteDSN(dbPath string) string {
	query := url.Values{}
	query.Add("_pragma", "foreign_keys(1)")
	query.Add("_pragma", "busy_timeout(5000)")
	query.Add("_pragma", "synchronous(NORMAL)")

	return (&url.URL{
		Scheme:   "file",
		Path:     filepath.ToSlash(dbPath),
		RawQuery: query.Encode(),
	}).String()
}

func openCloudSQLite(ctx context.Context, dbPath string) (*sql.DB, error) {
	parentDir := filepath.Dir(dbPath)
	parentInfo, err := os.Stat(parentDir)
	if err != nil {
		return nil, fmt.Errorf("stat sqlite parent directory %q: %w", parentDir, err)
	}
	if !parentInfo.IsDir() {
		return nil, fmt.Errorf("sqlite parent directory %q is not a directory", parentDir)
	}

	db, err := sql.Open("sqlite", buildCloudSQLiteDSN(dbPath))
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

	// journal_mode is a file-level setting, so keep it in the ordered startup path.
	if _, err := db.ExecContext(ctx, "PRAGMA journal_mode=WAL"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("initialize sqlite pragma %q: %w", "PRAGMA journal_mode=WAL", err)
	}

	if err := cloudRunSQLiteMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("run sqlite migrations: %w", err)
	}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("verify sqlite database: %w", err)
	}

	return db, nil
}

func runCloudSQLiteMigrations(ctx context.Context, db *sql.DB) error {
	return runCloudSQLiteMigrationsFS(ctx, db, cloudSQLiteMigrations, cloudSQLiteMigrationDir)
}

func runCloudSQLiteMigrationsFS(ctx context.Context, db *sql.DB, migrationFS fs.FS, migrationDir string) error {
	goose.SetBaseFS(migrationFS)
	defer goose.SetBaseFS(nil)

	if err := goose.SetDialect(cloudSQLiteMigrationDialect); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}

	if err := goose.UpContext(ctx, db, migrationDir); err != nil {
		return fmt.Errorf("apply goose migrations: %w", err)
	}

	return nil
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

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
