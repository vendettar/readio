package main

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"flag"

	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"readio-cloud/internal/admin"
	"readio-cloud/internal/asr"
	"readio-cloud/internal/discovery"
	"readio-cloud/internal/loki"
	"readio-cloud/internal/observability"
	"readio-cloud/internal/podcastindex"
	proxypkg "readio-cloud/internal/proxy"

	"os/signal"

	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

const defaultPort = "8080"

const browserConfigRoute = "/api/v1/config"
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
	"VITE_GRAFANA_FARO_URL",
	"VITE_GRAFANA_FARO_APP_NAME",
	"VITE_GRAFANA_FARO_ENV",
	"VITE_GRAFANA_FARO_SAMPLE_RATE",
}

type sqliteCloser interface {
	Close() error
}

type sqliteOpener func(context.Context, string) (sqliteCloser, error)

//go:embed migrations/*.sql
var cloudSQLiteMigrations embed.FS

var (
	cloudOpenSQLite sqliteOpener = func(ctx context.Context, dbPath string) (sqliteCloser, error) {
		return openCloudSQLite(ctx, dbPath)
	}
	cloudNewProxyService     = func() http.Handler { return proxypkg.NewDefaultService() }
	cloudNewASRRelayService  = asr.NewASRRelayService
	cloudNewDiscoveryService = func(store *podcastindex.PIEpisodeCacheStore) http.Handler {
		return discovery.NewDiscoveryService(store)
	}
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

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: loki.ResolveLogLevel(),
	}))
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

	shutdownObservability, err := observability.InitObservability(parent)
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

	lokiShipper, err := loki.InitLokiShipper()
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

	shutdownTracing, err := observability.InitTracing(parent)
	if err != nil {
		return fmt.Errorf("unable to initialize tracing: %w", err)
	}
	// Trace flush runs before the Loki and metrics flushes thanks to LIFO
	// defer ordering, so spans land in Tempo before correlated log lines and
	// metric points are pushed.
	defer func() {
		flushCtx, flushCancel := context.WithTimeout(context.Background(), observability.TracingShutdownFlushTimeout)
		defer flushCancel()
		if flushErr := shutdownTracing(flushCtx); flushErr != nil {
			slog.Warn("tracing shutdown failed", "error", flushErr)
		}
	}()

	proxy := cloudNewProxyService()
	asrRelay := cloudNewASRRelayService()
	// Obtain the underlying *sql.DB if available (it will be when running with a
	// real SQLite opener; it will be nil in tests that stub the opener).
	var sqlDB *sql.DB
	if raw, ok := db.(*sql.DB); ok {
		sqlDB = raw
	}
	piEpisodeCacheStore := podcastindex.NewPIEpisodeCacheStore(sqlDB)
	discovery := cloudNewDiscoveryService(piEpisodeCacheStore)

	addr := ":" + port

	mux := newCloudMux(proxy, asrRelay, discovery)

	_ = admin.SetupAdminHandler(mux, lokiShipper)

	server := &http.Server{
		Addr:              addr,
		Handler:           observability.WrapInboundHandler(mux),
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

func newCloudMux(proxy http.Handler, asrRelay http.Handler, discoveryHandler http.Handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc(browserConfigRoute, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Access-Control-Allow-Origin", "*") // Config is public-info
		_ = json.NewEncoder(w).Encode(buildBrowserRuntimeEnv(r))
	})
	mux.Handle(asr.RelayRoute, asrRelay)
	mux.Handle(asr.VerifyRoute, asrRelay)
	mux.Handle(discovery.RoutePrefix, discoveryHandler)
	mux.Handle(proxypkg.Route, proxy)

	return mux
}

// buildBrowserRuntimeEnv returns browser-safe runtime config.
// Key set must match browserEnvAllowlist. Do not add keys here
// without also adding them to the allowlist slice.
func buildBrowserRuntimeEnv(_ *http.Request) map[string]any {
	return map[string]any{
		"READIO_APP_NAME":    envOrDefault("READIO_APP_NAME", defaultRuntimeAppName),
		"READIO_APP_VERSION": envOrDefault("READIO_APP_VERSION", defaultRuntimeAppVersion),
		// This browser-visible value is abuse-control only; it is not a secret boundary.
		"READIO_ASR_RELAY_PUBLIC_TOKEN":      strings.TrimSpace(os.Getenv(asr.RelayPublicTokenEnv)),
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
		"READIO_NETWORK_PROXY_URL":      envOrDefault("READIO_NETWORK_PROXY_URL", "/api/proxy"),
		"VITE_GRAFANA_FARO_URL":         envOrDefault("VITE_GRAFANA_FARO_URL", ""),
		"VITE_GRAFANA_FARO_APP_NAME":    envOrDefault("VITE_GRAFANA_FARO_APP_NAME", ""),
		"VITE_GRAFANA_FARO_ENV":         envOrDefault("VITE_GRAFANA_FARO_ENV", ""),
		"VITE_GRAFANA_FARO_SAMPLE_RATE": envOrDefault("VITE_GRAFANA_FARO_SAMPLE_RATE", "0"),
	}
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
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
