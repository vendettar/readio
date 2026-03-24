package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"encoding/xml"
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
const discoveryFeedRoute = "/api/v1/discovery/feed"
const discoveryTopPodcastsRoute = "/api/v1/discovery/top-podcasts"
const discoveryTopEpisodesRoute = "/api/v1/discovery/top-episodes"
const discoverySearchPodcastsRoute = "/api/v1/discovery/search/podcasts"
const discoverySearchEpisodesRoute = "/api/v1/discovery/search/episodes"
const discoveryLookupPodcastRoute = "/api/v1/discovery/lookup/podcast"
const discoveryLookupPodcastEpisodesRoute = "/api/v1/discovery/lookup/podcast-episodes"
const discoveryBaseURL = "https://rss.applemarketingtools.com/api/v2"
const discoverySearchBaseURL = "https://itunes.apple.com/search"
const discoveryLookupBaseURL = "https://itunes.apple.com/lookup"
const discoveryUserAgent = "Readio/1.0 (Cloud Discovery)"
const discoveryRequestTimeout = 10 * time.Second
const discoveryDefaultCountry = "us"
const discoveryDefaultLimit = 20
const discoveryLookupDefaultLimit = 100
const discoveryMaxLimit = 100
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

type feedService struct {
	client      *http.Client
	timeout     time.Duration
	bodyLimit   int64
	userAgent   string
	lookupIP    func(context.Context, string) ([]net.IPAddr, error)
	dialContext func(context.Context, string, string) (net.Conn, error)
}

type discoveryService struct {
	client        *http.Client
	timeout       time.Duration
	userAgent     string
	baseURL       string
	searchBaseURL string
	lookupBaseURL string
	maxLimit      int
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
	cloudOpenSQLite sqliteOpener = func(ctx context.Context, dbPath string) (sqliteCloser, error) {
		return openCloudSQLite(ctx, dbPath)
	}
	cloudNewProxyService     = newProxyService
	cloudNewFeedService      = newFeedService
	cloudNewDiscoveryService = newDiscoveryService
	cloudCloseSQLite         = func(db sqliteCloser) error { return db.Close() }
	cloudListenAndServe      = func(ctx context.Context, server *http.Server) error {
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
		return fmt.Errorf("unable to resolve cloud ui dist: %w", err)
	}

	handler, err := newAppHandler(distDir)
	if err != nil {
		return fmt.Errorf("invalid cloud ui dist: %w", err)
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
	feed := cloudNewFeedService()
	discovery := cloudNewDiscoveryService()

	addr := ":" + port

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.Handle(proxyRoute, proxy)
	mux.Handle(discoveryFeedRoute, feed)
	mux.Handle("/api/v1/discovery/", discovery)
	mux.Handle("/", handler)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("starting cloud api server", "addr", addr, "distDir", distDir, "dbPath", dbPath)

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
		return nil, fmt.Errorf("missing index.html in cloud ui dist: %w", err)
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
		if err := validateCloudUIDistDir(override); err != nil {
			return "", err
		}

		return override, nil
	}

	candidates := candidateRoots()
	for _, root := range candidates {
		distDir := filepath.Join(root, "dist")
		if err := validateCloudUIDistDir(distDir); err == nil {
			return distDir, nil
		}

		for {
			distDir := filepath.Join(root, "apps", "cloud-ui", "dist")
			if err := validateCloudUIDistDir(distDir); err == nil {
				return distDir, nil
			}

			parent := filepath.Dir(root)
			if parent == root {
				break
			}
			root = parent
		}
	}

	return "", fmt.Errorf("unable to locate cloud ui dist; checked ./dist and apps/cloud-ui/dist, or set %s", cloudUIDistEnv)
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

func newFeedService() *feedService {
	return &feedService{
		timeout:   discoveryRequestTimeout,
		bodyLimit: proxyBodyLimit,
		userAgent: discoveryUserAgent,
		lookupIP:  net.DefaultResolver.LookupIPAddr,
	}
}

func newDiscoveryService() *discoveryService {
	return &discoveryService{
		client:        &http.Client{},
		timeout:       discoveryRequestTimeout,
		userAgent:     discoveryUserAgent,
		baseURL:       discoveryBaseURL,
		searchBaseURL: discoverySearchBaseURL,
		lookupBaseURL: discoveryLookupBaseURL,
		maxLimit:      discoveryMaxLimit,
	}
}

func (f *feedService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeDiscoveryError(w, http.StatusMethodNotAllowed, "only GET is allowed")
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		writeDiscoveryError(w, http.StatusBadRequest, "missing url")
		return
	}

	parsedURL, err := url.ParseRequestURI(rawURL)
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, "invalid url")
		return
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		writeDiscoveryError(w, http.StatusBadRequest, "only http and https urls are allowed")
		return
	}

	if err := validateProxyTarget(parsedURL); err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), f.feedTimeout())
	defer cancel()

	validatedAddrs, err := f.feedResolveTargetAddresses(ctx, parsedURL)
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	client := f.feedClient(validatedAddrs)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		writeDiscoveryError(w, http.StatusBadGateway, "unable to create upstream request")
		return
	}

	req.Header.Set("User-Agent", f.feedUserAgent())
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			writeDiscoveryError(w, http.StatusGatewayTimeout, "upstream request timed out")
			return
		}

		writeDiscoveryError(w, http.StatusBadGateway, "upstream request failed")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		writeDiscoveryError(w, http.StatusBadGateway, "upstream returned an invalid response")
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, f.feedBodyLimit()+1))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadGateway, "unable to read upstream response")
		return
	}

	if int64(len(body)) > f.feedBodyLimit() {
		writeDiscoveryError(w, http.StatusBadGateway, "upstream response too large")
		return
	}

	feed, err := parseDiscoveryFeed(body)
	if err != nil {
		writeDiscoveryError(w, http.StatusBadGateway, err.Error())
		return
	}

	feed.SourceURL = parsedURL.String()
	writeDiscoveryJSON(w, http.StatusOK, feed)
}

func (f *feedService) feedTimeout() time.Duration {
	if f != nil && f.timeout > 0 {
		return f.timeout
	}

	return discoveryRequestTimeout
}

func (f *feedService) feedBodyLimit() int64 {
	if f != nil && f.bodyLimit > 0 {
		return f.bodyLimit
	}

	return proxyBodyLimit
}

func (f *feedService) feedUserAgent() string {
	if f != nil {
		if ua := strings.TrimSpace(f.userAgent); ua != "" {
			return ua
		}
	}

	return discoveryUserAgent
}

func (f *feedService) feedClient(addrs []netip.Addr) *http.Client {
	svc := f
	if svc == nil {
		svc = &feedService{}
	}

	var client *http.Client
	if svc.client != nil {
		clone := *svc.client
		client = &clone
	} else {
		client = &http.Client{}
	}

	if client.Transport == nil {
		client.Transport = &http.Transport{
			DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				_, port, err := net.SplitHostPort(address)
				if err != nil {
					return nil, err
				}

				return svc.feedDialValidatedTargets(ctx, network, port, addrs)
			},
		}
	}

	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}

	return client
}

func (f *feedService) feedResolveTargetAddresses(ctx context.Context, target *url.URL) ([]netip.Addr, error) {
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
	if f != nil && f.lookupIP != nil {
		lookup = f.lookupIP
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

func (f *feedService) feedDialValidatedTargets(ctx context.Context, network, port string, addrs []netip.Addr) (net.Conn, error) {
	if len(addrs) == 0 {
		return nil, fmt.Errorf("target host is not allowed")
	}

	var lastErr error
	for _, addr := range addrs {
		conn, err := f.feedDialTarget(ctx, network, net.JoinHostPort(addr.String(), port))
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

func (f *feedService) feedDialTarget(ctx context.Context, network, address string) (net.Conn, error) {
	if f != nil && f.dialContext != nil {
		return f.dialContext(ctx, network, address)
	}

	var d net.Dialer
	return d.DialContext(ctx, network, address)
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

func (d *discoveryService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeDiscoveryError(w, http.StatusMethodNotAllowed, "only GET is allowed")
		return
	}

	switch r.URL.Path {
	case discoveryTopPodcastsRoute:
		d.handleDiscoveryChart(w, r, "podcasts.json", false)
	case discoveryTopEpisodesRoute:
		d.handleDiscoveryChart(w, r, "podcast-episodes.json", true)
	case discoverySearchPodcastsRoute:
		d.handleDiscoverySearch(w, r, "podcast", false)
	case discoverySearchEpisodesRoute:
		d.handleDiscoverySearch(w, r, "podcastEpisode", true)
	case discoveryLookupPodcastRoute:
		d.handleDiscoveryPodcastLookup(w, r)
	case discoveryLookupPodcastEpisodesRoute:
		d.handleDiscoveryPodcastEpisodesLookup(w, r)
	default:
		writeDiscoveryError(w, http.StatusNotFound, "not found")
	}
}

func (d *discoveryService) handleDiscoveryPodcastLookup(w http.ResponseWriter, r *http.Request) {
	id, err := normalizeDiscoveryID(r.URL.Query().Get("id"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	country, err := normalizeDiscoveryCountry(r.URL.Query().Get("country"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), d.discoveryTimeout())
	defer cancel()

	podcast, err := d.fetchDiscoveryPodcastLookup(ctx, id, country)
	if err != nil {
		writeDiscoveryError(w, discoveryLookupErrorStatus(ctx, err), discoveryLookupErrorMessage(ctx, err))
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, discoveryPodcastLookupResponse{
		Country: country,
		Podcast: podcast,
	})
}

func (d *discoveryService) handleDiscoveryPodcastEpisodesLookup(w http.ResponseWriter, r *http.Request) {
	id, err := normalizeDiscoveryID(r.URL.Query().Get("id"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	country, err := normalizeDiscoveryCountry(r.URL.Query().Get("country"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	limit, err := normalizeDiscoveryLookupLimit(r.URL.Query().Get("limit"), d.discoveryLimitCap())
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), d.discoveryTimeout())
	defer cancel()

	podcast, results, err := d.fetchDiscoveryPodcastEpisodesLookup(ctx, id, country, limit)
	if err != nil {
		writeDiscoveryError(w, discoveryLookupErrorStatus(ctx, err), discoveryLookupErrorMessage(ctx, err))
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, discoveryPodcastEpisodesLookupResponse{
		Country: country,
		Limit:   limit,
		Podcast: podcast,
		Results: results,
	})
}

func (d *discoveryService) handleDiscoveryChart(w http.ResponseWriter, r *http.Request, suffix string, episodeChart bool) {
	country, err := normalizeDiscoveryCountry(r.URL.Query().Get("country"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	limit, err := normalizeDiscoveryLimit(r.URL.Query().Get("limit"), d.discoveryLimitCap())
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), d.discoveryTimeout())
	defer cancel()

	results, err := d.fetchDiscoveryChart(ctx, country, limit, suffix, episodeChart)
	if err != nil {
		status := http.StatusBadGateway
		message := err.Error()
		if ctx.Err() != nil {
			status = http.StatusGatewayTimeout
			message = "upstream request timed out"
		}
		writeDiscoveryError(w, status, message)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, discoveryChartResponse{
		Country: country,
		Limit:   limit,
		Results: results,
	})
}

func (d *discoveryService) handleDiscoverySearch(w http.ResponseWriter, r *http.Request, entity string, episodeSearch bool) {
	term, err := normalizeDiscoverySearchTerm(r.URL.Query().Get("term"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	country, err := normalizeDiscoveryCountry(r.URL.Query().Get("country"))
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	limit, err := normalizeDiscoveryLimit(r.URL.Query().Get("limit"), d.discoveryLimitCap())
	if err != nil {
		writeDiscoveryError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), d.discoveryTimeout())
	defer cancel()

	results, err := d.fetchDiscoverySearch(ctx, term, country, limit, entity, episodeSearch)
	if err != nil {
		status := http.StatusBadGateway
		message := err.Error()
		if ctx.Err() != nil {
			status = http.StatusGatewayTimeout
			message = "upstream request timed out"
		}
		writeDiscoveryError(w, status, message)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, discoverySearchResponse{
		Country: country,
		Term:    term,
		Limit:   limit,
		Results: results,
	})
}

func (d *discoveryService) fetchDiscoveryChart(ctx context.Context, country string, limit int, suffix string, episodeChart bool) ([]discoveryChartItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.discoveryChartURL(country, limit, suffix), nil)
	if err != nil {
		return nil, fmt.Errorf("unable to create upstream request")
	}

	req.Header.Set("User-Agent", d.discoveryUserAgent())
	req.Header.Set("Accept", "application/json")

	resp, err := d.discoveryClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("upstream returned an invalid response")
	}

	var payload discoveryAppleChartResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("unable to decode upstream response")
	}

	results := make([]discoveryChartItem, 0, len(payload.Feed.Results))
	for _, item := range payload.Feed.Results {
		mapped, ok := mapDiscoveryChartItem(item, episodeChart)
		if !ok {
			continue
		}
		results = append(results, mapped)
	}

	return results, nil
}

func (d *discoveryService) fetchDiscoverySearch(ctx context.Context, term, country string, limit int, entity string, episodeSearch bool) ([]discoveryChartItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.discoverySearchURL(term, country, limit, entity), nil)
	if err != nil {
		return nil, fmt.Errorf("unable to create upstream request")
	}

	req.Header.Set("User-Agent", d.discoveryUserAgent())
	req.Header.Set("Accept", "application/json")

	resp, err := d.discoveryClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("upstream returned an invalid response")
	}

	var payload discoveryAppleLookupResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("unable to decode upstream response")
	}

	results := make([]discoveryChartItem, 0, len(payload.Results))
	for _, item := range payload.Results {
		mapped, ok := mapDiscoverySearchItem(item, episodeSearch)
		if !ok {
			continue
		}
		results = append(results, mapped)
	}

	return results, nil
}

func (d *discoveryService) fetchDiscoveryPodcastLookup(ctx context.Context, id, country string) (discoveryPodcastLookupItem, error) {
	items, err := d.fetchDiscoveryLookupItems(ctx, id, country, "podcast", 0)
	if err != nil {
		return discoveryPodcastLookupItem{}, err
	}

	podcast, ok := mapDiscoveryPodcastLookupItem(items)
	if !ok {
		return discoveryPodcastLookupItem{}, errDiscoveryLookupNotFound
	}

	return podcast, nil
}

func (d *discoveryService) fetchDiscoveryPodcastEpisodesLookup(ctx context.Context, id, country string, limit int) (discoveryPodcastLookupItem, []discoveryPodcastEpisodeLookupItem, error) {
	items, err := d.fetchDiscoveryLookupItems(ctx, id, country, "podcastEpisode", limit)
	if err != nil {
		return discoveryPodcastLookupItem{}, nil, err
	}

	podcast, episodes, ok := mapDiscoveryPodcastEpisodesLookupItems(items)
	if !ok {
		return discoveryPodcastLookupItem{}, nil, errDiscoveryLookupNotFound
	}

	return podcast, episodes, nil
}

func (d *discoveryService) fetchDiscoveryLookupItems(ctx context.Context, id, country, entity string, limit int) ([]discoveryAppleLookupItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.discoveryLookupURL(id, country, entity, limit), nil)
	if err != nil {
		return nil, fmt.Errorf("unable to create upstream request")
	}

	req.Header.Set("User-Agent", d.discoveryUserAgent())
	req.Header.Set("Accept", "application/json")

	resp, err := d.discoveryClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("upstream returned an invalid response")
	}

	var payload discoveryAppleLookupResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("unable to decode upstream response")
	}

	return payload.Results, nil
}

func discoveryLookupErrorStatus(ctx context.Context, err error) int {
	if errors.Is(err, errDiscoveryLookupNotFound) {
		return http.StatusNotFound
	}

	if ctx.Err() != nil {
		return http.StatusGatewayTimeout
	}

	return http.StatusBadGateway
}

func discoveryLookupErrorMessage(ctx context.Context, err error) string {
	if errors.Is(err, errDiscoveryLookupNotFound) {
		return errDiscoveryLookupNotFound.Error()
	}

	if ctx.Err() != nil {
		return "upstream request timed out"
	}

	return err.Error()
}

func (d *discoveryService) discoveryChartURL(country string, limit int, suffix string) string {
	return fmt.Sprintf("%s/%s/podcasts/top/%d/%s", strings.TrimRight(d.discoveryBaseURL(), "/"), country, limit, suffix)
}

func (d *discoveryService) discoverySearchURL(term, country string, limit int, entity string) string {
	return fmt.Sprintf("%s?term=%s&country=%s&media=podcast&entity=%s&limit=%d", strings.TrimRight(d.discoverySearchBaseURL(), "/"), url.QueryEscape(term), country, entity, limit)
}

func (d *discoveryService) discoveryLookupURL(id, country, entity string, limit int) string {
	baseURL := strings.TrimRight(d.discoveryLookupBaseURL(), "/")
	if limit > 0 {
		return fmt.Sprintf("%s?id=%s&country=%s&entity=%s&limit=%d", baseURL, id, country, entity, limit)
	}

	return fmt.Sprintf("%s?id=%s&country=%s&entity=%s", baseURL, id, country, entity)
}

func (d *discoveryService) discoveryClient() *http.Client {
	if d != nil && d.client != nil {
		return d.client
	}

	return &http.Client{}
}

func (d *discoveryService) discoveryTimeout() time.Duration {
	if d != nil && d.timeout > 0 {
		return d.timeout
	}

	return discoveryRequestTimeout
}

func (d *discoveryService) discoveryUserAgent() string {
	if d != nil {
		if ua := strings.TrimSpace(d.userAgent); ua != "" {
			return ua
		}
	}

	return discoveryUserAgent
}

func (d *discoveryService) discoveryBaseURL() string {
	if d != nil {
		if baseURL := strings.TrimSpace(d.baseURL); baseURL != "" {
			return baseURL
		}
	}

	return discoveryBaseURL
}

func (d *discoveryService) discoverySearchBaseURL() string {
	if d != nil {
		if baseURL := strings.TrimSpace(d.searchBaseURL); baseURL != "" {
			return baseURL
		}
	}

	return discoverySearchBaseURL
}

func (d *discoveryService) discoveryLookupBaseURL() string {
	if d != nil {
		if baseURL := strings.TrimSpace(d.lookupBaseURL); baseURL != "" {
			return baseURL
		}
	}

	return discoveryLookupBaseURL
}

func (d *discoveryService) discoveryLimitCap() int {
	if d != nil && d.maxLimit > 0 {
		return d.maxLimit
	}

	return discoveryMaxLimit
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

func writeDiscoveryError(w http.ResponseWriter, status int, message string) {
	writeDiscoveryJSON(w, status, discoveryErrorResponse{Error: message})
}

func writeDiscoveryJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}

	_ = json.NewEncoder(w).Encode(payload)
}

func normalizeDiscoveryCountry(raw string) (string, error) {
	country := strings.ToLower(strings.TrimSpace(raw))
	if country == "" {
		return discoveryDefaultCountry, nil
	}

	if len(country) != 2 {
		return "", fmt.Errorf("country must be a 2-letter ISO code")
	}

	for _, r := range country {
		if r < 'a' || r > 'z' {
			return "", fmt.Errorf("country must be a 2-letter ISO code")
		}
	}

	return country, nil
}

func normalizeDiscoveryID(raw string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return "", fmt.Errorf("id is required")
	}

	n, err := strconv.ParseUint(id, 10, 64)
	if err != nil {
		return "", fmt.Errorf("id must be numeric")
	}

	if n == 0 {
		return "", fmt.Errorf("id must be a positive number")
	}

	return strconv.FormatUint(n, 10), nil
}

func normalizeDiscoverySearchTerm(raw string) (string, error) {
	term := strings.TrimSpace(raw)
	if term == "" {
		return "", fmt.Errorf("term is required")
	}

	return term, nil
}

func normalizeDiscoveryLimit(raw string, maxLimit int) (int, error) {
	return normalizeDiscoveryLimitWithDefault(raw, discoveryDefaultLimit, maxLimit)
}

func normalizeDiscoveryLookupLimit(raw string, maxLimit int) (int, error) {
	return normalizeDiscoveryLimitWithDefault(raw, discoveryLookupDefaultLimit, maxLimit)
}

func normalizeDiscoveryLimitWithDefault(raw string, defaultLimit, maxLimit int) (int, error) {
	if maxLimit <= 0 {
		maxLimit = discoveryMaxLimit
	}

	if strings.TrimSpace(raw) == "" {
		return defaultLimit, nil
	}

	limit, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, fmt.Errorf("limit must be a number")
	}

	if limit < 1 || limit > maxLimit {
		return 0, fmt.Errorf("limit must be between 1 and %d", maxLimit)
	}

	return limit, nil
}

var errDiscoveryLookupNotFound = errors.New("podcast not found")

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}

	return ""
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

func validateCloudUIDistDir(distDir string) error {
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

type discoveryAppleChartResponse struct {
	Feed discoveryAppleChartFeed `json:"feed"`
}

type discoveryAppleChartFeed struct {
	Results []discoveryAppleChartItem `json:"results"`
}

type discoveryAppleChartItem struct {
	ID                discoveryFlexibleString `json:"id"`
	Name              discoveryFlexibleString `json:"name"`
	ArtistName        discoveryFlexibleString `json:"artistName"`
	ArtworkURL100     discoveryFlexibleString `json:"artworkUrl100"`
	URL               discoveryFlexibleString `json:"url"`
	Description       discoveryFlexibleString `json:"description"`
	ReleaseDate       discoveryFlexibleString `json:"releaseDate"`
	FeedURL           discoveryFlexibleString `json:"feedUrl"`
	CollectionID      discoveryFlexibleString `json:"collectionId"`
	CollectionViewURL discoveryFlexibleString `json:"collectionViewUrl"`
}

type discoveryChartResponse struct {
	Country string               `json:"country"`
	Limit   int                  `json:"limit"`
	Results []discoveryChartItem `json:"results"`
}

type discoverySearchResponse struct {
	Country string               `json:"country"`
	Term    string               `json:"term"`
	Limit   int                  `json:"limit"`
	Results []discoveryChartItem `json:"results"`
}

type discoveryPodcastLookupResponse struct {
	Country string                     `json:"country"`
	Podcast discoveryPodcastLookupItem `json:"podcast"`
}

type discoveryPodcastEpisodesLookupResponse struct {
	Country string                              `json:"country"`
	Limit   int                                 `json:"limit"`
	Podcast discoveryPodcastLookupItem          `json:"podcast"`
	Results []discoveryPodcastEpisodeLookupItem `json:"results"`
}

type discoveryChartItem struct {
	ID                string           `json:"id"`
	Name              string           `json:"name"`
	ArtistName        string           `json:"artistName,omitempty"`
	ArtworkURL100     string           `json:"artworkUrl100,omitempty"`
	URL               string           `json:"url"`
	Genres            []discoveryGenre `json:"genres"`
	Description       string           `json:"description,omitempty"`
	ReleaseDate       string           `json:"releaseDate,omitempty"`
	FeedURL           string           `json:"feedUrl,omitempty"`
	ProviderPodcastID string           `json:"providerPodcastId,omitempty"`
	ProviderEpisodeID string           `json:"providerEpisodeId,omitempty"`
}

type discoveryPodcastLookupItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	ArtistName        string `json:"artistName,omitempty"`
	ArtworkURL100     string `json:"artworkUrl100,omitempty"`
	Description       string `json:"description,omitempty"`
	ReleaseDate       string `json:"releaseDate,omitempty"`
	ProviderPodcastID string `json:"providerPodcastId,omitempty"`
}

type discoveryPodcastEpisodeLookupItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	ArtistName        string `json:"artistName,omitempty"`
	ArtworkURL100     string `json:"artworkUrl100,omitempty"`
	Description       string `json:"description,omitempty"`
	ReleaseDate       string `json:"releaseDate,omitempty"`
	ProviderPodcastID string `json:"providerPodcastId,omitempty"`
	ProviderEpisodeID string `json:"providerEpisodeId,omitempty"`
}

type discoveryGenre struct {
	GenreID string `json:"genreId"`
	Name    string `json:"name"`
	URL     string `json:"url,omitempty"`
}

type discoveryErrorResponse struct {
	Error string `json:"error"`
}

type discoveryFeedResponse struct {
	SourceURL string               `json:"sourceUrl"`
	Feed      discoveryFeedMeta    `json:"feed"`
	Episodes  []discoveryFeedEntry `json:"episodes"`
}

type discoveryFeedMeta struct {
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle,omitempty"`
	Description string `json:"description,omitempty"`
	Link        string `json:"link,omitempty"`
	ImageURL    string `json:"imageUrl,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
}

type discoveryFeedEntry struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Link        string `json:"link,omitempty"`
	AudioURL    string `json:"audioUrl,omitempty"`
	PublishedAt string `json:"publishedAt,omitempty"`
}

type discoveryFlexibleString string

type feedDocument interface {
	isFeedDocument()
}

type rssFeedDocument struct {
	Channel rssFeedChannel `xml:"channel"`
}

func (rssFeedDocument) isFeedDocument() {}

type rssFeedChannel struct {
	Title       string        `xml:"title"`
	Link        string        `xml:"link"`
	Description string        `xml:"description"`
	LastBuild   string        `xml:"lastBuildDate"`
	PubDate     string        `xml:"pubDate"`
	Image       rssFeedImage  `xml:"image"`
	Items       []rssFeedItem `xml:"item"`
}

type rssFeedImage struct {
	URL string `xml:"url"`
}

type rssFeedItem struct {
	GUID        string           `xml:"guid"`
	Title       string           `xml:"title"`
	Link        string           `xml:"link"`
	Description string           `xml:"description"`
	PubDate     string           `xml:"pubDate"`
	Enclosure   rssFeedEnclosure `xml:"enclosure"`
}

type rssFeedEnclosure struct {
	URL string `xml:"url,attr"`
}

type atomFeedDocument struct {
	Title     string      `xml:"title"`
	Subtitle  string      `xml:"subtitle"`
	Links     []atomLink  `xml:"link"`
	UpdatedAt string      `xml:"updated"`
	Entries   []atomEntry `xml:"entry"`
}

func (atomFeedDocument) isFeedDocument() {}

type atomLink struct {
	Rel  string `xml:"rel,attr"`
	Href string `xml:"href,attr"`
	Type string `xml:"type,attr"`
}

type atomEntry struct {
	ID        string     `xml:"id"`
	Title     string     `xml:"title"`
	Summary   string     `xml:"summary"`
	Content   string     `xml:"content"`
	UpdatedAt string     `xml:"updated"`
	Published string     `xml:"published"`
	Links     []atomLink `xml:"link"`
}

type discoveryAppleLookupResponse struct {
	Results []discoveryAppleLookupItem `json:"results"`
}

type discoveryAppleLookupItem struct {
	WrapperType       discoveryFlexibleString `json:"wrapperType"`
	Kind              discoveryFlexibleString `json:"kind"`
	TrackID           discoveryFlexibleString `json:"trackId"`
	CollectionID      discoveryFlexibleString `json:"collectionId"`
	TrackName         discoveryFlexibleString `json:"trackName"`
	CollectionName    discoveryFlexibleString `json:"collectionName"`
	ArtistName        discoveryFlexibleString `json:"artistName"`
	ArtworkURL100     discoveryFlexibleString `json:"artworkUrl100"`
	Description       discoveryFlexibleString `json:"description"`
	ShortDescription  discoveryFlexibleString `json:"shortDescription"`
	LongDescription   discoveryFlexibleString `json:"longDescription"`
	ReleaseDate       discoveryFlexibleString `json:"releaseDate"`
	FeedURL           discoveryFlexibleString `json:"feedUrl"`
	TrackViewURL      discoveryFlexibleString `json:"trackViewUrl"`
	CollectionViewURL discoveryFlexibleString `json:"collectionViewUrl"`
	EpisodeGUID       discoveryFlexibleString `json:"episodeGuid"`
}

func (s *discoveryFlexibleString) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*s = ""
		return nil
	}

	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	switch value := raw.(type) {
	case string:
		*s = discoveryFlexibleString(strings.TrimSpace(value))
	case float64:
		*s = discoveryFlexibleString(strconv.FormatFloat(value, 'f', -1, 64))
	case json.Number:
		*s = discoveryFlexibleString(value.String())
	default:
		*s = discoveryFlexibleString(strings.TrimSpace(fmt.Sprint(value)))
	}

	return nil
}

func parseDiscoveryFeed(data []byte) (discoveryFeedResponse, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	for {
		tok, err := decoder.Token()
		if err != nil {
			return discoveryFeedResponse{}, fmt.Errorf("unable to decode upstream response")
		}

		start, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}

		switch strings.ToLower(start.Name.Local) {
		case "rss":
			var doc rssFeedDocument
			if err := decoder.DecodeElement(&doc, &start); err != nil {
				return discoveryFeedResponse{}, fmt.Errorf("unable to decode upstream response")
			}
			return normalizeRSSFeed(doc)
		case "feed":
			var doc atomFeedDocument
			if err := decoder.DecodeElement(&doc, &start); err != nil {
				return discoveryFeedResponse{}, fmt.Errorf("unable to decode upstream response")
			}
			return normalizeAtomFeed(doc)
		default:
			return discoveryFeedResponse{}, fmt.Errorf("unsupported feed format")
		}
	}
}

func normalizeRSSFeed(doc rssFeedDocument) (discoveryFeedResponse, error) {
	channel := doc.Channel
	title := strings.TrimSpace(channel.Title)
	if title == "" {
		return discoveryFeedResponse{}, fmt.Errorf("feed title is required")
	}

	feed := discoveryFeedMeta{
		Title:       title,
		Subtitle:    strings.TrimSpace(channel.Description),
		Description: strings.TrimSpace(channel.Description),
		Link:        strings.TrimSpace(channel.Link),
		ImageURL:    strings.TrimSpace(channel.Image.URL),
		UpdatedAt:   firstNonEmpty(strings.TrimSpace(channel.LastBuild), strings.TrimSpace(channel.PubDate)),
	}

	episodes := make([]discoveryFeedEntry, 0, len(channel.Items))
	for _, item := range channel.Items {
		title := strings.TrimSpace(item.Title)
		if title == "" {
			continue
		}

		id := firstNonEmpty(strings.TrimSpace(item.GUID), strings.TrimSpace(item.Link), title)
		episodes = append(episodes, discoveryFeedEntry{
			ID:          id,
			Title:       title,
			Description: strings.TrimSpace(item.Description),
			Link:        strings.TrimSpace(item.Link),
			AudioURL:    strings.TrimSpace(item.Enclosure.URL),
			PublishedAt: strings.TrimSpace(item.PubDate),
		})
	}

	return discoveryFeedResponse{
		Feed:     feed,
		Episodes: episodes,
	}, nil
}

func normalizeAtomFeed(doc atomFeedDocument) (discoveryFeedResponse, error) {
	title := strings.TrimSpace(doc.Title)
	if title == "" {
		return discoveryFeedResponse{}, fmt.Errorf("feed title is required")
	}

	feed := discoveryFeedMeta{
		Title:       title,
		Subtitle:    strings.TrimSpace(doc.Subtitle),
		Description: strings.TrimSpace(doc.Subtitle),
		Link:        firstAtomLinkHref(doc.Links, "", "alternate", "self"),
		UpdatedAt:   strings.TrimSpace(doc.UpdatedAt),
	}

	episodes := make([]discoveryFeedEntry, 0, len(doc.Entries))
	for _, entry := range doc.Entries {
		title := strings.TrimSpace(entry.Title)
		if title == "" {
			continue
		}

		episodeLink := firstAtomLinkHref(entry.Links, "enclosure", "alternate", "self")
		audioURL := firstAtomLinkHref(entry.Links, "enclosure")
		id := firstNonEmpty(strings.TrimSpace(entry.ID), episodeLink, title)
		episodes = append(episodes, discoveryFeedEntry{
			ID:          id,
			Title:       title,
			Description: firstNonEmpty(strings.TrimSpace(entry.Summary), strings.TrimSpace(entry.Content)),
			Link:        episodeLink,
			AudioURL:    audioURL,
			PublishedAt: firstNonEmpty(strings.TrimSpace(entry.Published), strings.TrimSpace(entry.UpdatedAt)),
		})
	}

	return discoveryFeedResponse{
		Feed:     feed,
		Episodes: episodes,
	}, nil
}

func firstAtomLinkHref(links []atomLink, rels ...string) string {
	for _, rel := range rels {
		for _, link := range links {
			linkRel := strings.ToLower(strings.TrimSpace(link.Rel))
			if rel == "" {
				if linkRel == "" || linkRel == "alternate" {
					if href := strings.TrimSpace(link.Href); href != "" {
						return href
					}
				}
				continue
			}

			if linkRel == rel {
				if href := strings.TrimSpace(link.Href); href != "" {
					return href
				}
			}
		}
	}

	return ""
}

func mapDiscoveryChartItem(item discoveryAppleChartItem, episodeChart bool) (discoveryChartItem, bool) {
	id := strings.TrimSpace(string(item.ID))
	name := strings.TrimSpace(string(item.Name))
	url := firstNonEmpty(string(item.URL), string(item.CollectionViewURL), string(item.FeedURL))
	if id == "" || name == "" || url == "" {
		return discoveryChartItem{}, false
	}

	result := discoveryChartItem{
		ID:     id,
		Name:   name,
		URL:    url,
		Genres: []discoveryGenre{},
	}

	if artistName := strings.TrimSpace(string(item.ArtistName)); artistName != "" {
		result.ArtistName = artistName
	}
	if artworkURL := strings.TrimSpace(string(item.ArtworkURL100)); artworkURL != "" {
		result.ArtworkURL100 = artworkURL
	}
	if description := strings.TrimSpace(string(item.Description)); description != "" {
		result.Description = description
	}
	if releaseDate := strings.TrimSpace(string(item.ReleaseDate)); releaseDate != "" {
		result.ReleaseDate = releaseDate
	}
	if feedURL := strings.TrimSpace(string(item.FeedURL)); feedURL != "" {
		result.FeedURL = feedURL
	}

	if episodeChart {
		result.ProviderEpisodeID = id
		if providerPodcastID := strings.TrimSpace(string(item.CollectionID)); providerPodcastID != "" {
			result.ProviderPodcastID = providerPodcastID
		}
	} else {
		if providerPodcastID := strings.TrimSpace(string(item.CollectionID)); providerPodcastID != "" {
			result.ProviderPodcastID = providerPodcastID
		} else {
			result.ProviderPodcastID = id
		}
	}

	return result, true
}

func mapDiscoverySearchItem(item discoveryAppleLookupItem, episodeSearch bool) (discoveryChartItem, bool) {
	id := firstNonEmpty(string(item.TrackID), string(item.CollectionID), string(item.EpisodeGUID))
	name := firstNonEmpty(string(item.TrackName), string(item.CollectionName))
	url := firstNonEmpty(string(item.TrackViewURL), string(item.CollectionViewURL), string(item.FeedURL))
	if id == "" || name == "" || url == "" {
		return discoveryChartItem{}, false
	}

	if episodeSearch && !isDiscoveryPodcastEpisodeLookupItem(item) {
		return discoveryChartItem{}, false
	}
	if !episodeSearch && !isDiscoveryPodcastLookupItem(item) {
		return discoveryChartItem{}, false
	}

	result := discoveryChartItem{
		ID:     id,
		Name:   name,
		URL:    url,
		Genres: []discoveryGenre{},
	}

	if artistName := strings.TrimSpace(string(item.ArtistName)); artistName != "" {
		result.ArtistName = artistName
	}
	if artworkURL := strings.TrimSpace(string(item.ArtworkURL100)); artworkURL != "" {
		result.ArtworkURL100 = artworkURL
	}
	if description := firstNonEmpty(string(item.LongDescription), string(item.ShortDescription), string(item.Description)); description != "" {
		result.Description = description
	}
	if releaseDate := strings.TrimSpace(string(item.ReleaseDate)); releaseDate != "" {
		result.ReleaseDate = releaseDate
	}
	if feedURL := strings.TrimSpace(string(item.FeedURL)); feedURL != "" {
		result.FeedURL = feedURL
	}

	if episodeSearch {
		result.ProviderEpisodeID = id
		if providerPodcastID := strings.TrimSpace(string(item.CollectionID)); providerPodcastID != "" {
			result.ProviderPodcastID = providerPodcastID
		}
	} else {
		if providerPodcastID := strings.TrimSpace(string(item.CollectionID)); providerPodcastID != "" {
			result.ProviderPodcastID = providerPodcastID
		} else {
			result.ProviderPodcastID = id
		}
	}

	return result, true
}

func mapDiscoveryPodcastLookupItem(items []discoveryAppleLookupItem) (discoveryPodcastLookupItem, bool) {
	for _, item := range items {
		if !isDiscoveryPodcastLookupItem(item) {
			continue
		}

		id := firstNonEmpty(string(item.CollectionID), string(item.TrackID))
		name := firstNonEmpty(string(item.CollectionName), string(item.TrackName))
		if id == "" || name == "" {
			continue
		}

		result := discoveryPodcastLookupItem{
			ID:                id,
			Name:              name,
			ProviderPodcastID: id,
		}

		if artistName := strings.TrimSpace(string(item.ArtistName)); artistName != "" {
			result.ArtistName = artistName
		}
		if artworkURL := strings.TrimSpace(string(item.ArtworkURL100)); artworkURL != "" {
			result.ArtworkURL100 = artworkURL
		}
		if description := firstNonEmpty(string(item.LongDescription), string(item.ShortDescription), string(item.Description)); description != "" {
			result.Description = description
		}
		if releaseDate := strings.TrimSpace(string(item.ReleaseDate)); releaseDate != "" {
			result.ReleaseDate = releaseDate
		}

		return result, true
	}

	return discoveryPodcastLookupItem{}, false
}

func mapDiscoveryPodcastEpisodesLookupItems(items []discoveryAppleLookupItem) (discoveryPodcastLookupItem, []discoveryPodcastEpisodeLookupItem, bool) {
	podcast, ok := mapDiscoveryPodcastLookupItem(items)
	if !ok {
		return discoveryPodcastLookupItem{}, nil, false
	}

	episodes := make([]discoveryPodcastEpisodeLookupItem, 0, len(items))
	for _, item := range items {
		if !isDiscoveryPodcastEpisodeLookupItem(item) {
			continue
		}

		id := firstNonEmpty(string(item.TrackID), string(item.EpisodeGUID))
		name := firstNonEmpty(string(item.TrackName), string(item.CollectionName))
		if id == "" || name == "" {
			continue
		}

		episode := discoveryPodcastEpisodeLookupItem{
			ID:                id,
			Name:              name,
			ProviderPodcastID: firstNonEmpty(string(item.CollectionID), podcast.ProviderPodcastID),
			ProviderEpisodeID: id,
		}

		if artistName := strings.TrimSpace(string(item.ArtistName)); artistName != "" {
			episode.ArtistName = artistName
		}
		if artworkURL := strings.TrimSpace(string(item.ArtworkURL100)); artworkURL != "" {
			episode.ArtworkURL100 = artworkURL
		}
		if description := firstNonEmpty(string(item.LongDescription), string(item.ShortDescription), string(item.Description)); description != "" {
			episode.Description = description
		}
		if releaseDate := strings.TrimSpace(string(item.ReleaseDate)); releaseDate != "" {
			episode.ReleaseDate = releaseDate
		}

		episodes = append(episodes, episode)
	}

	return podcast, episodes, true
}

func isDiscoveryPodcastLookupItem(item discoveryAppleLookupItem) bool {
	kind := strings.ToLower(strings.TrimSpace(string(item.Kind)))
	if kind != "" {
		return kind == "podcast"
	}

	wrapperType := strings.ToLower(strings.TrimSpace(string(item.WrapperType)))
	return wrapperType == "track" || wrapperType == "collection"
}

func isDiscoveryPodcastEpisodeLookupItem(item discoveryAppleLookupItem) bool {
	kind := strings.ToLower(strings.TrimSpace(string(item.Kind)))
	if kind != "" {
		return kind == "podcast-episode" || kind == "podcastepisode"
	}

	wrapperType := strings.ToLower(strings.TrimSpace(string(item.WrapperType)))
	return wrapperType == "podcast-episode"
}
