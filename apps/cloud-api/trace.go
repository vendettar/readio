package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Tracing env contract. See agent/instructions/cloud/00D for the full rules.
const (
	tracingEnabledEnv           = "READIO_TRACING_ENABLED"
	tracingSampleRatioEnv       = "READIO_TRACING_SAMPLE_RATIO"
	tracingExportTimeoutEnv     = "READIO_TRACING_EXPORT_TIMEOUT_SECONDS"
	tracingDefaultSampleRatio   = 0.1
	tracingDefaultExportTimeout = 5 * time.Second
	tracingShutdownFlushTimeout = 5 * time.Second
	tracingInstrumentationName  = "readio-cloud"
	tracingServiceName          = "readio-cloud"
	tracingResourceEnvAttr      = "deployment.environment"
)

// tracingShutdown flushes the span exporter on graceful shutdown. The returned
// closure is safe to call even when tracing is disabled.
type tracingShutdown func(context.Context) error

// noopTracingShutdown is the shared shutdown closure when tracing is disabled.
func noopTracingShutdown(context.Context) error { return nil }

// initTracing initializes the global OpenTelemetry tracer provider and
// propagator when READIO_TRACING_ENABLED is true. It is a no-op when tracing
// is disabled even if OTLP credentials are present. Invalid configuration on
// the enabled path fails fast so the operator notices at startup.
func initTracing(ctx context.Context) (tracingShutdown, error) {
	if !resolveTracingEnabled() {
		slog.Info("tracing: disabled (set READIO_TRACING_ENABLED=true to enable)")
		return noopTracingShutdown, nil
	}

	ratio, err := resolveTracingSampleRatio()
	if err != nil {
		return nil, fmt.Errorf("tracing: %w", err)
	}

	otlp, err := resolveOTLPConfig()
	if err != nil {
		return nil, fmt.Errorf("tracing: %w", err)
	}
	if !otlp.Enabled {
		return nil, fmt.Errorf("tracing: enabled but OTLP endpoint/auth env is not configured")
	}

	deployEnv := normalizeMetricEnv(os.Getenv(deployEnvEnv))

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(tracingServiceName),
			semconv.ServiceVersion(envOrDefault("READIO_APP_VERSION", defaultRuntimeAppVersion)),
			attribute.String(tracingResourceEnvAttr, deployEnv), // Standard OTel attribute
			attribute.String(unifiedEnvAttr, deployEnv),         // Redundant 'env' for Grafana variable unification
		),
	)
	if err != nil {
		return nil, fmt.Errorf("tracing: create resource: %w", err)
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(otlp.EndpointForSignal("/v1/traces")),
		otlptracehttp.WithHeaders(otlp.HeadersCopy()),
		otlptracehttp.WithTimeout(resolveTracingExportTimeout()),
	)
	if err != nil {
		return nil, fmt.Errorf("tracing: create trace exporter: %w", err)
	}

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))),
		sdktrace.WithBatcher(newSanitizingExporter(exporter)),
	)

	prevProvider := otel.GetTracerProvider()
	prevPropagator := otel.GetTextMapPropagator()

	otel.SetTracerProvider(provider)
	// W3C TraceContext only; baggage is intentionally not enabled.
	otel.SetTextMapPropagator(propagation.TraceContext{})

	slog.Info("tracing: enabled",
		"endpoint_host", otlpEndpointHost(otlp.Endpoint),
		"endpoint_path", otlpEndpointPath(otlp.Endpoint),
		"env", deployEnv,
		"sample_ratio", ratio,
	)

	return func(shutdownCtx context.Context) error {
		// Restore the previous globals so subsequent boots or tests do not
		// inherit this provider once it has been shut down.
		otel.SetTracerProvider(prevProvider)
		otel.SetTextMapPropagator(prevPropagator)
		return provider.Shutdown(shutdownCtx)
	}, nil
}

func resolveTracingEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(tracingEnabledEnv)))
	switch v {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func resolveTracingSampleRatio() (float64, error) {
	raw := strings.TrimSpace(os.Getenv(tracingSampleRatioEnv))
	if raw == "" {
		return tracingDefaultSampleRatio, nil
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid float %q", tracingSampleRatioEnv, raw)
	}
	if v < 0.0 || v > 1.0 {
		return 0, fmt.Errorf("%s: %g is outside [0.0, 1.0]", tracingSampleRatioEnv, v)
	}
	return v, nil
}

func resolveTracingExportTimeout() time.Duration {
	return envDurationSecondsOrDefault(tracingExportTimeoutEnv, tracingDefaultExportTimeout)
}

// otlpEndpointHost returns the host portion of an OTLP endpoint URL for safe
// startup logging. It deliberately avoids logging headers, tokens, or the
// signal path.
func otlpEndpointHost(endpoint string) string {
	trimmed := strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	if i := strings.IndexByte(trimmed, '/'); i >= 0 {
		return trimmed[:i]
	}
	return trimmed
}

// otlpEndpointPath returns the path portion of an OTLP endpoint URL for safe
// startup logging.
func otlpEndpointPath(endpoint string) string {
	trimmed := strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	if i := strings.IndexByte(trimmed, '/'); i >= 0 {
		return trimmed[i:]
	}
	return "/"
}

// unsafeSpanAttributes lists span attribute keys that may leak full URLs,
// query strings, user search text, podcast IDs/GUIDs, or referer values.
// These keys are stripped from every exported span by the sanitizing
// exporter so library default behavior cannot reintroduce them downstream.
var unsafeSpanAttributes = map[attribute.Key]struct{}{
	"url.full":                       {},
	"url.path":                       {},
	"url.query":                      {},
	"http.url":                       {},
	"http.target":                    {},
	"http.user_agent":                {},
	"user_agent.original":            {},
	"http.request.header.referer":    {},
	"http.request.header.user_agent": {},
}

// sanitizingExporter wraps a SpanExporter and strips unsafe attribute keys
// from every span before delegating. Wrapping at the exporter boundary is
// guaranteed to take effect: by the time spans reach an exporter, all
// attributes set by upstream instrumentation are visible, and we control the
// view passed to the underlying batcher.
type sanitizingExporter struct {
	next sdktrace.SpanExporter
}

func newSanitizingExporter(next sdktrace.SpanExporter) sdktrace.SpanExporter {
	return &sanitizingExporter{next: next}
}

func (e *sanitizingExporter) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	scrubbed := make([]sdktrace.ReadOnlySpan, len(spans))
	for i, s := range spans {
		scrubbed[i] = &sanitizedSpan{ReadOnlySpan: s}
	}
	return e.next.ExportSpans(ctx, scrubbed)
}

func (e *sanitizingExporter) Shutdown(ctx context.Context) error { return e.next.Shutdown(ctx) }

// sanitizedSpan is a ReadOnlySpan view that filters unsafe attribute keys.
// Every other method is delegated through the embedded interface.
type sanitizedSpan struct {
	sdktrace.ReadOnlySpan
}

func (s *sanitizedSpan) Attributes() []attribute.KeyValue {
	orig := s.ReadOnlySpan.Attributes()
	out := orig[:0:len(orig)]
	for _, kv := range orig {
		if _, bad := unsafeSpanAttributes[kv.Key]; bad {
			continue
		}
		out = append(out, kv)
	}
	return out
}

// wrapInboundHandler installs the OpenTelemetry HTTP server middleware on the
// given mux. Span names are forced to closed-enum route templates so they
// never contain query strings, podcast IDs, GUIDs, or user search text.
func wrapInboundHandler(mux http.Handler) http.Handler {
	return otelhttp.NewHandler(mux, "readio-cloud",
		otelhttp.WithSpanNameFormatter(spanNameForRequest),
	)
}

// spanNameForRequest returns a low-cardinality span name derived from the
// canonical request route template, prefixed with the HTTP method. The
// returned string never contains query strings, podcast IDs, GUIDs, or user
// text. Unknown routes collapse to "unknown" so cardinality stays bounded.
func spanNameForRequest(_ string, r *http.Request) string {
	if r == nil {
		return "GET unknown"
	}
	return r.Method + " " + canonicalInboundRoute(r)
}

// canonicalInboundRoute maps an incoming request to one of the closed-enum
// route templates declared in instruction 00D §00D3. Any request that does
// not match a known route returns "unknown".
func canonicalInboundRoute(r *http.Request) string {
	if r == nil || r.URL == nil {
		return "unknown"
	}
	path := r.URL.Path
	switch path {
	case "/healthz":
		return "/healthz"
	case browserConfigRoute:
		return browserConfigRoute
	case proxyRoute:
		return proxyRoute
	case asrRelayRoute:
		return asrRelayRoute
	case asrVerifyRoute:
		return asrVerifyRoute
	case discoverySearchPodcastsRoute:
		return discoverySearchPodcastsRoute
	case discoverySearchEpisodesRoute:
		return discoverySearchEpisodesRoute
	case discoveryTopPodcastsRoute:
		return discoveryTopPodcastsRoute
	case discoveryTopEpisodesRoute:
		return discoveryTopEpisodesRoute
	case discoveryPodcastsBatchRoute:
		return discoveryPodcastsBatchRoute
	}
	if strings.HasPrefix(path, "/admin/") {
		return "/admin/*"
	}
	// Discovery podcast id / episodes routes share a prefix; map them to
	// stable templates without leaking the iTunes id.
	const podcastsPrefix = "/api/v1/discovery/podcasts/"
	if strings.HasPrefix(path, podcastsPrefix) && path != discoveryPodcastsBatchRoute {
		rest := strings.TrimPrefix(path, podcastsPrefix)
		if rest == "" {
			return "unknown"
		}
		if strings.HasSuffix(rest, "/episodes") {
			return "/api/v1/discovery/podcasts/{id}/episodes"
		}
		if !strings.ContainsRune(rest, '/') {
			return "/api/v1/discovery/podcasts/{id}"
		}
	}
	return "unknown"
}

// newInstrumentedTransport returns an http.RoundTripper that records outbound
// spans against the global tracer provider. When propagateContext is false
// (the default for third-party upstreams), no traceparent or other trace
// context is injected into outbound requests, but local outbound spans are
// still recorded.
func newInstrumentedTransport(base http.RoundTripper, propagateContext bool) http.RoundTripper {
	opts := []otelhttp.Option{
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
			if r == nil || r.URL == nil {
				return "http.client"
			}
			return "http.client " + r.Method
		}),
	}
	if !propagateContext {
		// Empty composite propagator → otelhttp injects nothing.
		opts = append(opts, otelhttp.WithPropagators(propagation.NewCompositeTextMapPropagator()))
	}
	return otelhttp.NewTransport(base, opts...)
}
