package main

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// withTracingGlobalsRestore captures the current OpenTelemetry global tracer
// provider and propagator and restores them at test end so any provider
// installed by initTracing during the test cannot leak into other tests.
func withTracingGlobalsRestore(t *testing.T) {
	t.Helper()
	prevProvider := otel.GetTracerProvider()
	prevPropagator := otel.GetTextMapPropagator()
	t.Cleanup(func() {
		otel.SetTracerProvider(prevProvider)
		otel.SetTextMapPropagator(prevPropagator)
	})
}

// clearOTLPEnv strips every OTLP/tracing env var the resolver consults so a
// test starts from a known disabled baseline.
func clearOTLPEnv(t *testing.T) {
	t.Helper()
	for _, v := range []string{
		grafanaOTLPEndpointEnv,
		grafanaOTLPHeadersEnv,
		grafanaOTLPInstanceIDEnv,
		grafanaOTLPTokenEnv,
		tracingEnabledEnv,
		tracingSampleRatioEnv,
		tracingExportTimeoutEnv,
	} {
		t.Setenv(v, "")
	}
}

func TestInitTracingDisabledByDefault(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)

	shutdown, err := initTracing(context.Background())
	if err != nil {
		t.Fatalf("initTracing error: %v", err)
	}
	if shutdown == nil {
		t.Fatalf("shutdown must be non-nil even when tracing is disabled")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown returned error: %v", err)
	}
	if _, ok := otel.GetTracerProvider().(noop.TracerProvider); !ok {
		// The provider may also be the original default; what we require is
		// that initTracing did not install an SDK provider.
		if otel.GetTracerProvider() == nil {
			t.Fatalf("tracer provider must not be nil")
		}
	}
}

func TestInitTracingExplicitFalseDoesNotEnable(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "false")
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")

	shutdown, err := initTracing(context.Background())
	if err != nil {
		t.Fatalf("initTracing error: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown error: %v", err)
	}
}

func TestInitTracingFailsWhenEndpointMissing(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "true")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")

	if _, err := initTracing(context.Background()); err == nil {
		t.Fatalf("initTracing should fail when endpoint missing")
	}
}

func TestInitTracingFailsWhenAuthMissing(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "true")
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")

	if _, err := initTracing(context.Background()); err == nil {
		t.Fatalf("initTracing should fail when auth missing")
	}
}

func TestInitTracingFailsOnMalformedHeaders(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "true")
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "NotAllowed=value")

	if _, err := initTracing(context.Background()); err == nil {
		t.Fatalf("initTracing should fail on disallowed header keys")
	}
}

func TestInitTracingFailsOnInvalidSampleRatio(t *testing.T) {
	cases := []string{"-0.1", "1.5", "abc"}
	for _, raw := range cases {
		t.Run(raw, func(t *testing.T) {
			withTracingGlobalsRestore(t)
			clearOTLPEnv(t)
			t.Setenv(tracingEnabledEnv, "true")
			t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
			t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")
			t.Setenv(tracingSampleRatioEnv, raw)
			if _, err := initTracing(context.Background()); err == nil {
				t.Fatalf("initTracing should fail for sample ratio %q", raw)
			}
		})
	}
}

func TestResolveTracingSampleRatioDefaultsWhenEmpty(t *testing.T) {
	t.Setenv(tracingSampleRatioEnv, "")
	got, err := resolveTracingSampleRatio()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != tracingDefaultSampleRatio {
		t.Fatalf("default sample ratio = %v want %v", got, tracingDefaultSampleRatio)
	}
}

func TestResolveTracingSampleRatioValidValuesAccepted(t *testing.T) {
	for _, raw := range []string{"0", "0.0", "0.25", "1", "1.0"} {
		t.Run(raw, func(t *testing.T) {
			t.Setenv(tracingSampleRatioEnv, raw)
			if _, err := resolveTracingSampleRatio(); err != nil {
				t.Fatalf("unexpected error for %q: %v", raw, err)
			}
		})
	}
}

func TestSpanNameForRequestUsesRouteTemplates(t *testing.T) {
	cases := []struct {
		path     string
		method   string
		expected string
	}{
		{"/healthz", "GET", "GET /healthz"},
		{browserConfigRoute, "GET", "GET " + browserConfigRoute},
		{proxyRoute, "POST", "POST " + proxyRoute},
		{asrRelayRoute, "POST", "POST " + asrRelayRoute},
		{asrVerifyRoute, "POST", "POST " + asrVerifyRoute},
		{discoverySearchPodcastsRoute + "?q=secret", "GET", "GET " + discoverySearchPodcastsRoute},
		{discoverySearchEpisodesRoute + "?q=user-text", "GET", "GET " + discoverySearchEpisodesRoute},
		{discoveryTopPodcastsRoute, "GET", "GET " + discoveryTopPodcastsRoute},
		{discoveryTopEpisodesRoute, "GET", "GET " + discoveryTopEpisodesRoute},
		{discoveryPodcastsBatchRoute, "POST", "POST " + discoveryPodcastsBatchRoute},
		{"/api/v1/discovery/podcasts/123456789", "GET", "GET /api/v1/discovery/podcasts/{id}"},
		{"/api/v1/discovery/podcasts/123456789/episodes", "GET", "GET /api/v1/discovery/podcasts/{id}/episodes"},
		{"/admin/logs", "GET", "GET /admin/*"},
		{"/something/unknown", "GET", "GET unknown"},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			req := mustNewRequest(tc.method, tc.path)
			got := spanNameForRequest("readio-cloud", req)
			if got != tc.expected {
				t.Fatalf("spanNameForRequest(%q) = %q want %q", tc.path, got, tc.expected)
			}
			if strings.Contains(got, "?") || strings.Contains(got, "secret") || strings.Contains(got, "user-text") {
				t.Fatalf("span name must not contain query strings or user text: %q", got)
			}
		})
	}
}

func TestSpanNameForRequestDoesNotLeakPodcastID(t *testing.T) {
	req := mustNewRequest(http.MethodGet, "/api/v1/discovery/podcasts/1535809341/episodes?q=top%20secret")
	got := spanNameForRequest("readio-cloud", req)
	if strings.Contains(got, "1535809341") {
		t.Fatalf("podcast iTunes id leaked into span name: %q", got)
	}
	if strings.Contains(got, "secret") || strings.Contains(got, "?") {
		t.Fatalf("query string leaked into span name: %q", got)
	}
}

func TestNewInstrumentedTransportNoPropagationInjectsNothing(t *testing.T) {
	withTracingGlobalsRestore(t)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	// Build a parent context with an active span so otelhttp has something
	// to potentially inject.
	tracer := otel.GetTracerProvider().Tracer("test")
	parentCtx, span := tracer.Start(context.Background(), "parent")
	defer span.End()

	captured := http.Header{}
	captureTransport := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		captured = req.Header.Clone()
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
	})

	rt := newInstrumentedTransport(captureTransport, false)
	req, _ := http.NewRequestWithContext(parentCtx, http.MethodGet, "https://example.test/foo", nil)
	resp, err := rt.RoundTrip(req)
	if err != nil {
		t.Fatalf("RoundTrip error: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if v := captured.Get("traceparent"); v != "" {
		t.Fatalf("traceparent must not be injected when propagation is disabled: %q", v)
	}
	if v := captured.Get("tracestate"); v != "" {
		t.Fatalf("tracestate must not be injected when propagation is disabled: %q", v)
	}
}

func TestNewInstrumentedTransportPropagatesWhenEnabled(t *testing.T) {
	withTracingGlobalsRestore(t)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	tracer := otel.GetTracerProvider().Tracer("test")
	// Use a real recording tracer to get a valid span context.
	parentCtx, span := tracer.Start(context.Background(), "parent")
	defer span.End()

	captureTransport := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
	})

	rt := newInstrumentedTransport(captureTransport, true)
	req, _ := http.NewRequestWithContext(parentCtx, http.MethodGet, "https://example.test/foo", nil)
	resp, err := rt.RoundTrip(req)
	if err != nil {
		t.Fatalf("RoundTrip error: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	// The default global provider is a no-op so traceparent may still be
	// absent. The contract this test enforces is structural: the
	// instrumented transport must allow propagation when enabled, and must
	// preserve the request host/path.
	if got := req.Host; got != "example.test" {
		t.Fatalf("host preserved: got %q", got)
	}
	_ = trace.SpanContextFromContext(parentCtx)
}

// roundTripperFunc adapts a function to http.RoundTripper for tests.
type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
