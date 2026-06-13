package observability

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/metric/noop"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

const (
	grafanaOTLPEndpointEnv   = "READIO_GRAFANA_OTLP_ENDPOINT"
	grafanaOTLPInstanceIDEnv = "READIO_GRAFANA_OTLP_INSTANCE_ID"
	grafanaOTLPTokenEnv      = "READIO_GRAFANA_OTLP_TOKEN"
	otlpPushIntervalEnv      = "READIO_OTLP_PUSH_INTERVAL_SECONDS"
	otlpDefaultPushInterval  = 30 * time.Second
)

// Localized route, provider, and cache status constants to break main-package dependency.
const (
	cacheStatusFreshHit            = "fresh_hit"
	cacheStatusRefreshed           = "refreshed"
	cacheStatusPersistenceFallback = "persistence_fallback"
	cacheStatusStaleFallback       = "stale_fallback"
	cacheStatusMissError           = "miss_error"
	cacheStatusUncached            = "uncached"

	upstreamKindAppleSearch  = "apple-search"
	upstreamKindAppleCharts  = "apple-charts"
	upstreamKindPodcastIndex = "podcastindex"

	discoverySearchPodcastsRoute                   = "/api/v1/discovery/search/podcasts"
	discoverySearchEpisodesRoute                   = "/api/v1/discovery/search/episodes"
	discoverySearchCacheRoute                      = "/api/v1/discovery/search/cache"
	discoveryTopPodcastsRoute                      = "/api/v1/discovery/top-podcasts"
	discoveryTopEpisodesRoute                      = "/api/v1/discovery/top-episodes"
	discoveryPodcastsBatchRoute                    = "/api/v1/discovery/podcasts/batch"
	discoveryPodcastByItunesIDRoutePattern         = "/api/v1/discovery/podcasts/:itunesId"
	discoveryPodcastEpisodesByItunesIDRoutePattern = "/api/v1/discovery/podcasts/:itunesId/episodes"
)

var (
	cloudHTTPRequestDuration     metric.Float64Histogram
	cloudUpstreamRequestDuration metric.Float64Histogram
	cloudUpstreamErrors          metric.Int64Counter
	cloudASRRelayRequests        metric.Int64Counter

	// globalEnvAttribute is the cached environment tag (e.g. env="production")
	// used for all application metrics.
	globalEnvAttribute attribute.KeyValue
)

func init() {
	initNoopMetrics()
}

// ObservabilityShutdown cleanly flushes and stops the OTLP exporter.
type ObservabilityShutdown func(context.Context) error

// InitObservability initializes OTLP metric push to Grafana Cloud through the
// shared OTLP resolver. When OTLP env vars are absent it installs no-op
// instruments so recording functions never panic. When env vars are partially
// supplied or malformed it returns a fail-fast error so the operator notices
// at startup rather than from repeated upstream 401 upload failures.
func InitObservability(ctx context.Context) (ObservabilityShutdown, error) {
	otlp, err := resolveOTLPConfig()
	if err != nil {
		return nil, fmt.Errorf("observability: %w", err)
	}

	if !otlp.Enabled {
		slog.Info("observability: OTLP push disabled (set READIO_GRAFANA_OTLP_ENDPOINT and either READIO_GRAFANA_OTLP_HEADERS or READIO_GRAFANA_OTLP_INSTANCE_ID+READIO_GRAFANA_OTLP_TOKEN to enable)")
		initNoopMetrics()

		return func(context.Context) error { return nil }, nil
	}

	deployEnv := strings.TrimSpace(os.Getenv("READIO_DEPLOY_ENV"))
	if deployEnv == "" {
		deployEnv = strings.TrimSpace(os.Getenv("VITE_GRAFANA_FARO_ENV"))
	}
	normalizedEnv := NormalizeMetricEnv(deployEnv)

	globalEnvAttribute = attribute.String(unifiedEnvAttr, normalizedEnv)

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName("readio-cloud"),
			semconv.ServiceVersion(envOrDefault("READIO_APP_VERSION", defaultRuntimeAppVersion)),
			semconv.DeploymentEnvironment(normalizedEnv),    // Standard Otel attribute
			attribute.String(unifiedEnvAttr, normalizedEnv), // Unified label for Grafana
		),
	)
	if err != nil {
		return nil, fmt.Errorf("observability: create resource: %w", err)
	}

	exporter, err := otlpmetrichttp.New(ctx,
		otlpmetrichttp.WithEndpointURL(otlp.EndpointForSignal("/v1/metrics")),
		otlpmetrichttp.WithHeaders(otlp.HeadersCopy()),
	)
	if err != nil {
		return nil, fmt.Errorf("observability: create metric exporter: %w", err)
	}

	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter,
			sdkmetric.WithInterval(resolveOTLPPushInterval())),
		),
		sdkmetric.WithView(durationHistogramView("readio_cloud_http_request_duration_seconds")),
		sdkmetric.WithView(durationHistogramView("readio_cloud_upstream_request_duration_seconds")),
	)

	meter := provider.Meter("readio-cloud")
	if err := createInstruments(meter); err != nil {
		return nil, fmt.Errorf("observability: create instruments: %w", err)
	}

	slog.Info("observability: OTLP push enabled", "endpoint", otlp.Endpoint)

	return func(ctx context.Context) error {
		return provider.Shutdown(ctx)
	}, nil
}

func createInstruments(meter metric.Meter) error {
	var err error

	cloudHTTPRequestDuration, err = meter.Float64Histogram(
		"readio_cloud_http_request_duration_seconds",
		metric.WithDescription("Duration of selected Cloud API HTTP requests."),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}

	cloudUpstreamRequestDuration, err = meter.Float64Histogram(
		"readio_cloud_upstream_request_duration_seconds",
		metric.WithDescription("Duration of selected Cloud API upstream requests."),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}

	cloudUpstreamErrors, err = meter.Int64Counter(
		"readio_cloud_upstream_errors_total",
		metric.WithDescription("Total selected Cloud API upstream errors."),
	)
	if err != nil {
		return err
	}

	cloudASRRelayRequests, err = meter.Int64Counter(
		"readio_cloud_asr_relay_requests_total",
		metric.WithDescription("Total ASR relay requests by provider, mode, status class, and error class."),
	)
	if err != nil {
		return err
	}

	if err := createHostMetricInstruments(meter); err != nil {
		return err
	}

	return nil
}

func initNoopMetrics() {
	meter := noop.Meter{}
	cloudHTTPRequestDuration, _ = meter.Float64Histogram("noop")
	cloudUpstreamRequestDuration, _ = meter.Float64Histogram("noop")
	cloudUpstreamErrors, _ = meter.Int64Counter("noop")
	cloudASRRelayRequests, _ = meter.Int64Counter("noop")
}

// RecordHTTPMetric records HTTP duration metric.
func RecordHTTPMetric(ctx context.Context, route string, status int, errorClass string, elapsed time.Duration) {
	cloudHTTPRequestDuration.Record(ctx, elapsed.Seconds(),
		metric.WithAttributes(
			globalEnvAttribute,
			attribute.String("route", metricRoute(route)),
			attribute.String("status_class", metricStatusClass(status)),
			attribute.String("error_class", metricErrorClass(errorClass)),
		),
	)
}

// RecordUpstreamMetric records upstream metric.
func RecordUpstreamMetric(ctx context.Context, provider string, route string, status int, errorClass string, cacheStatus string, elapsed time.Duration) {
	providerLabel := metricProvider(provider)
	routeLabel := metricRoute(route)
	errorClassLabel := metricErrorClass(errorClass)

	cloudUpstreamRequestDuration.Record(ctx, elapsed.Seconds(),
		metric.WithAttributes(
			globalEnvAttribute,
			attribute.String("provider", providerLabel),
			attribute.String("route", routeLabel),
			attribute.String("status_class", metricStatusClass(status)),
			attribute.String("error_class", errorClassLabel),
			attribute.String("cache_status", metricCacheStatus(cacheStatus)),
		),
	)

	if errorClassLabel != "none" {
		cloudUpstreamErrors.Add(ctx, 1,
			metric.WithAttributes(
				globalEnvAttribute,
				attribute.String("provider", providerLabel),
				attribute.String("route", routeLabel),
				attribute.String("error_class", errorClassLabel),
			),
		)
	}
}

// RecordASRRelayMetric records ASR relay metric.
func RecordASRRelayMetric(ctx context.Context, provider string, mode string, status int, errorClass string) {
	cloudASRRelayRequests.Add(ctx, 1,
		metric.WithAttributes(
			globalEnvAttribute,
			attribute.String("provider", metricProvider(provider)),
			attribute.String("mode", metricASRModeValue(mode)),
			attribute.String("status_class", metricStatusClass(status)),
			attribute.String("error_class", metricErrorClass(errorClass)),
		),
	)
}

func resolveOTLPPushInterval() time.Duration {
	return envDurationSecondsOrDefault(otlpPushIntervalEnv, otlpDefaultPushInterval)
}

// durationHistogramBuckets are the explicit bucket boundaries used for HTTP
// and upstream duration histograms. The default OTel SDK buckets jump from
// 2.5 s directly to 5.0 s, which causes histogram_quantile to always return
// ~4.75 s for any P95 that falls in that range. These finer boundaries give
// meaningful resolution between 50 ms and 10 s.
var durationHistogramBuckets = []float64{
	0.05, 0.1, 0.2, 0.3, 0.5,
	0.75, 1.0, 1.5, 2.0, 3.0,
	4.0, 5.0, 7.5, 10.0,
}

// durationHistogramView returns an sdkmetric.View that applies
// durationHistogramBuckets to the named histogram instrument.
func durationHistogramView(instrumentName string) sdkmetric.View {
	return sdkmetric.NewView(
		sdkmetric.Instrument{
			Name: instrumentName,
			Kind: sdkmetric.InstrumentKindHistogram,
		},
		sdkmetric.Stream{
			Aggregation: sdkmetric.AggregationExplicitBucketHistogram{
				Boundaries: durationHistogramBuckets,
			},
		},
	)
}

// --- Label mappers (closed enums, preventing high-cardinality leaks) ---

func metricStatusClass(status int) string {
	switch {
	case status >= 200 && status <= 299:
		return "2xx"
	case status >= 300 && status <= 399:
		return "3xx"
	case status >= 400 && status <= 499:
		return "4xx"
	case status >= 500 && status <= 599:
		return "5xx"
	default:
		return "unknown"
	}
}

func metricErrorClass(errorClass string) string {
	switch strings.TrimSpace(errorClass) {
	case "none",
		"origin_not_allowed",
		"invalid_request",
		"invalid_method",
		"rate_limit",
		"ssrf",
		"create_request",
		"timeout",
		"upstream",
		"param_error",
		"upstream_status",
		"decode",
		"too_large",
		"unauthorized",
		"client_error",
		"service_unavailable",
		"payload_too_large":
		return strings.TrimSpace(errorClass)
	default:
		return "unknown"
	}
}

func metricCacheStatus(cacheStatus string) string {
	switch strings.TrimSpace(cacheStatus) {
	case cacheStatusFreshHit, "hit":
		return "hit"
	case cacheStatusRefreshed, cacheStatusPersistenceFallback, cacheStatusMissError, "miss":
		return "miss"
	case cacheStatusStaleFallback, "stale":
		return "stale"
	case cacheStatusUncached, "bypass":
		return "bypass"
	default:
		return "unknown"
	}
}

func metricProvider(provider string) string {
	switch strings.TrimSpace(strings.ToLower(provider)) {
	case upstreamKindAppleSearch, upstreamKindAppleCharts, "apple":
		return "apple"
	case upstreamKindPodcastIndex, "asr-podcastindex":
		return "podcastindex"
	case "groq", "asr-groq":
		return "groq"
	case "cloudflare", "asr-cloudflare":
		return "cloudflare"
	case "proxy":
		return "proxy"
	case "", "unknown":
		return "unknown"
	default:
		return "unknown"
	}
}

func metricRoute(route string) string {
	switch strings.TrimSpace(route) {
	case discoverySearchPodcastsRoute:
		return "discovery/search/podcasts"
	case discoverySearchEpisodesRoute:
		return "discovery/search/episodes"
	case discoverySearchCacheRoute:
		return "discovery/search/cache"
	case discoveryTopPodcastsRoute:
		return "discovery/top/podcasts"
	case discoveryTopEpisodesRoute:
		return "discovery/top/episodes"
	case discoveryPodcastsBatchRoute:
		return "discovery/lookup/podcasts-batch"
	case discoveryPodcastByItunesIDRoutePattern:
		return "discovery/lookup/podcast"
	case discoveryPodcastEpisodesByItunesIDRoutePattern:
		return "discovery/lookup/podcast-episodes"
	case "asr-relay/transcriptions":
		return "asr-relay/transcriptions"
	case "asr-relay/verify":
		return "asr-relay/verify"
	case "proxy/media":
		return "proxy/media"
	default:
		return "unknown"
	}
}

type ASRRelayTransport string

const (
	ASRRelayTransportDirect ASRRelayTransport = "direct"
	ASRRelayTransportWorker ASRRelayTransport = "worker"
)

// ResolveASRRelayMode converts provider and transport into the bounded metric label.
func ResolveASRRelayMode(provider string, transport ASRRelayTransport) string {
	switch metricProvider(provider) {
	case "groq":
		if transport == ASRRelayTransportWorker {
			return "worker"
		}
		return "direct"
	case "cloudflare":
		return "builtin"
	default:
		return "unknown"
	}
}

func metricASRModeValue(mode string) string {
	switch strings.TrimSpace(mode) {
	case "direct", "worker", "builtin", "unknown":
		return strings.TrimSpace(mode)
	default:
		return "unknown"
	}
}
