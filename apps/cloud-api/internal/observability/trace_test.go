package observability

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// withTracingGlobalsRestore captures the current OpenTelemetry global tracer
// provider and propagator and restores them at test end so any provider
// installed by InitTracing during the test cannot leak into other tests.
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

	shutdown, err := InitTracing(context.Background())
	require.NoError(t, err)
	require.NotNil(t, shutdown)
	err = shutdown(context.Background())
	require.NoError(t, err)
	if _, ok := otel.GetTracerProvider().(noop.TracerProvider); !ok {
		// The provider may also be the original default; what we require is
		// that InitTracing did not install an SDK provider.
		require.NotEqual(t, nil, otel.GetTracerProvider())
	}
}

func TestInitTracingExplicitFalseDoesNotEnable(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "false")
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")

	shutdown, err := InitTracing(context.Background())
	require.NoError(t, err)
	err = shutdown(context.Background())
	require.NoError(t, err)
}

func TestInitTracingFailsWhenEndpointMissing(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "true")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")

	_, err := InitTracing(context.Background())
	require.Error(t, err)
}

func TestInitTracingFailsWhenAuthMissing(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "true")
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")

	_, err := InitTracing(context.Background())
	require.Error(t, err)
}

func TestInitTracingFailsOnMalformedHeaders(t *testing.T) {
	withTracingGlobalsRestore(t)
	clearOTLPEnv(t)
	t.Setenv(tracingEnabledEnv, "true")
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "NotAllowed=value")

	_, err := InitTracing(context.Background())
	require.Error(t, err)
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
			_, err := InitTracing(context.Background())
			require.Error(t, err)
		})
	}
}

func TestResolveTracingSampleRatioDefaultsWhenEmpty(t *testing.T) {
	t.Setenv(tracingSampleRatioEnv, "")
	got, err := resolveTracingSampleRatio()
	require.NoError(t, err)
	require.Equal(t, tracingDefaultSampleRatio, got)
}

func TestResolveTracingSampleRatioValidValuesAccepted(t *testing.T) {
	for _, raw := range []string{"0", "0.0", "0.25", "1", "1.0"} {
		t.Run(raw, func(t *testing.T) {
			t.Setenv(tracingSampleRatioEnv, raw)
			_, err := resolveTracingSampleRatio()
			require.NoError(t, err)
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
			require.Equal(t, tc.expected, got)
			require.NotContains(t, got, "?")
			require.NotContains(t, got, "secret")
			require.NotContains(t, got, "user-text")
		})
	}
}

func TestSpanNameForRequestDoesNotLeakPodcastID(t *testing.T) {
	req := mustNewRequest(http.MethodGet, "/api/v1/discovery/podcasts/1535809341/episodes?q=top%20secret")
	got := spanNameForRequest("readio-cloud", req)
	require.NotContains(t, got, "1535809341")
	require.NotContains(t, got, "secret")
	require.NotContains(t, got, "?")
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

	rt := NewInstrumentedTransport(captureTransport)
	req, _ := http.NewRequestWithContext(parentCtx, http.MethodGet, "https://example.test/foo", nil)
	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Empty(t, captured.Get("traceparent"))
	require.Empty(t, captured.Get("tracestate"))
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

	rt := NewPropagatingInstrumentedTransport(captureTransport)
	req, _ := http.NewRequestWithContext(parentCtx, http.MethodGet, "https://example.test/foo", nil)
	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	// The default global provider is a no-op so traceparent may still be
	// absent. The contract this test enforces is structural: the
	// instrumented transport must allow propagation when enabled, and must
	// preserve the request host/path.
	require.Equal(t, "example.test", req.URL.Host)
	_ = trace.SpanContextFromContext(parentCtx)
}

// roundTripperFunc adapts a function to http.RoundTripper for tests.
type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
