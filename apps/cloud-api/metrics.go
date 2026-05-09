package main

import (
	"context"
	"encoding/base64"
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

var (
	cloudHTTPRequestDuration     metric.Float64Histogram
	cloudUpstreamRequestDuration metric.Float64Histogram
	cloudUpstreamErrors          metric.Int64Counter
	cloudASRRelayRequests        metric.Int64Counter
)

func init() {
	initNoopMetrics()
}

// observabilityShutdown cleanly flushes and stops the OTLP exporter.
type observabilityShutdown func(context.Context) error

// initObservability initializes OTLP metric push to Grafana Cloud.
// When env vars are not configured, it installs no-op instruments so
// recording functions never panic.
func initObservability(ctx context.Context) (observabilityShutdown, error) {
	endpoint := strings.TrimSpace(os.Getenv(grafanaOTLPEndpointEnv))
	instanceID := strings.TrimSpace(os.Getenv(grafanaOTLPInstanceIDEnv))
	token := strings.TrimSpace(os.Getenv(grafanaOTLPTokenEnv))

	if endpoint == "" || instanceID == "" || token == "" {
		slog.Info("observability: OTLP push disabled (set READIO_GRAFANA_OTLP_ENDPOINT, READIO_GRAFANA_OTLP_INSTANCE_ID, READIO_GRAFANA_OTLP_TOKEN to enable)")
		initNoopMetrics()

		return func(context.Context) error { return nil }, nil
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName("readio-cloud"),
			semconv.ServiceVersion(envOrDefault("READIO_APP_VERSION", defaultRuntimeAppVersion)),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("observability: create resource: %w", err)
	}

	auth := base64.StdEncoding.EncodeToString([]byte(instanceID + ":" + token))

	exporter, err := otlpmetrichttp.New(ctx,
		otlpmetrichttp.WithEndpointURL(strings.TrimRight(endpoint, "/")+"/v1/metrics"),
		otlpmetrichttp.WithHeaders(map[string]string{
			"Authorization": "Basic " + auth,
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("observability: create metric exporter: %w", err)
	}

	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter,
			sdkmetric.WithInterval(resolveOTLPPushInterval()),
		)),
	)

	meter := provider.Meter("readio-cloud")
	if err := createInstruments(meter); err != nil {
		return nil, fmt.Errorf("observability: create instruments: %w", err)
	}

	slog.Info("observability: OTLP push enabled", "endpoint", endpoint)

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

func recordHTTPMetric(route string, status int, errorClass string, elapsed time.Duration) {
	cloudHTTPRequestDuration.Record(context.Background(), elapsed.Seconds(),
		metric.WithAttributes(
			attribute.String("route", metricRoute(route)),
			attribute.String("status_class", metricStatusClass(status)),
			attribute.String("error_class", metricErrorClass(errorClass)),
		),
	)
}

func recordUpstreamMetric(provider string, route string, status int, errorClass string, cacheStatus string, elapsed time.Duration) {
	providerLabel := metricProvider(provider)
	routeLabel := metricRoute(route)
	errorClassLabel := metricErrorClass(errorClass)

	cloudUpstreamRequestDuration.Record(context.Background(), elapsed.Seconds(),
		metric.WithAttributes(
			attribute.String("provider", providerLabel),
			attribute.String("route", routeLabel),
			attribute.String("status_class", metricStatusClass(status)),
			attribute.String("error_class", errorClassLabel),
			attribute.String("cache_status", metricCacheStatus(cacheStatus)),
		),
	)

	if errorClassLabel != "none" {
		cloudUpstreamErrors.Add(context.Background(), 1,
			metric.WithAttributes(
				attribute.String("provider", providerLabel),
				attribute.String("route", routeLabel),
				attribute.String("error_class", errorClassLabel),
			),
		)
	}
}

func recordASRRelayMetric(provider string, mode string, status int, errorClass string) {
	cloudASRRelayRequests.Add(context.Background(), 1,
		metric.WithAttributes(
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
	case CacheStatusFreshHit, "hit":
		return "hit"
	case CacheStatusRefreshed, CacheStatusMissError, "miss":
		return "miss"
	case CacheStatusStaleFallback, "stale":
		return "stale"
	case CacheStatusUncached, "bypass":
		return "bypass"
	default:
		return "unknown"
	}
}

func metricProvider(provider string) string {
	switch strings.TrimSpace(strings.ToLower(provider)) {
	case UpstreamKindAppleSearch, UpstreamKindAppleCharts, "apple":
		return "apple"
	case UpstreamKindPodcastIndex, "asr-podcastindex":
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

func metricASRMode(workerEnabled bool, provider string) string {
	switch metricProvider(provider) {
	case "groq":
		if workerEnabled {
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
