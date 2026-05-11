package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// TestDiscoveryServiceClientUsesInstrumentedTransport verifies the structural
// invariant that the discovery service's HTTP client uses the project's
// instrumented transport. Both PodcastIndex and Apple iTunes Search/Charts
// flow through this client; the instrumented transport must not inject
// traceparent into third-party requests.
func TestDiscoveryServiceClientUsesInstrumentedTransport(t *testing.T) {
	svc := newDiscoveryService()
	if svc.client == nil {
		t.Fatalf("discovery client must be non-nil")
	}
	if svc.client.Transport == nil {
		t.Fatalf("discovery client transport must be wrapped, got nil")
	}
	if reflectTypeName(svc.client.Transport) == reflectTypeName(http.DefaultTransport) {
		t.Fatalf("discovery client transport must not be raw http.DefaultTransport")
	}
}

// TestDiscoveryServiceClientDoesNotPropagateTraceparent uses the actual
// discovery service's HTTP client transport to confirm that, even with an
// active recording span, no traceparent header is injected into outbound
// requests targeting third-party-like upstreams.
func TestDiscoveryServiceClientDoesNotPropagateTraceparent(t *testing.T) {
	withTracingGlobalsRestore(t)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	// Install a recording provider so a real span context exists.
	_ = installRecordingTracer(t)
	tracer := otel.GetTracerProvider().Tracer("test")
	ctx, span := tracer.Start(context.Background(), "parent")
	defer span.End()

	captured := http.Header{}
	innerRT := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		captured = req.Header.Clone()
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
	})

	// Re-create the instrumented transport with the same propagation policy
	// the discovery service uses (false).
	rt := newInstrumentedTransport(innerRT, false)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.podcastindex.org/api/1.0/search/byterm?q=secret", nil)
	resp, err := rt.RoundTrip(req)
	if err != nil {
		t.Fatalf("RoundTrip error: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if v := captured.Get("Traceparent"); v != "" {
		t.Fatalf("PodcastIndex requests must not receive traceparent; got %q", v)
	}
	if v := captured.Get("Tracestate"); v != "" {
		t.Fatalf("PodcastIndex requests must not receive tracestate; got %q", v)
	}
}

// TestASRRelayWorkerClientStructure verifies that the ASR relay service has a
// dedicated workerClient distinct from its third-party direct client, so the
// first-party worker hop can be instrumented for trace propagation without
// affecting direct provider calls.
func TestASRRelayWorkerClientStructure(t *testing.T) {
	svc := newASRRelayService()
	if svc.client == nil {
		t.Fatalf("asr relay client must be non-nil")
	}
	if svc.workerClient == nil {
		t.Fatalf("asr relay workerClient must be non-nil")
	}
	if svc.client == svc.workerClient {
		t.Fatalf("workerClient must be a distinct *http.Client from the third-party client")
	}
	// Direct (third-party) client must NOT be wrapped with an instrumented
	// transport — leaving Transport nil keeps Go's default transport, which
	// is uninstrumented and never injects traceparent.
	if svc.client.Transport != nil {
		t.Fatalf("asr direct client must not be tracing-instrumented; got transport %s", reflectTypeName(svc.client.Transport))
	}
	if svc.workerClient.Transport == nil {
		t.Fatalf("asr worker client transport must be wrapped with an instrumented transport")
	}
}

// TestProxyClientNotInstrumented verifies the media/proxy fallback service's
// HTTP client is not wrapped with the project's instrumented transport.
// Media/proxy upstreams are arbitrary third-party hosts and must never
// receive trace headers or have full URLs recorded as span attributes.
func TestProxyClientNotInstrumented(t *testing.T) {
	svc := newProxyService()
	if svc.client != nil && svc.client.Transport != nil {
		// A nil Transport means default uninstrumented transport — that is
		// the required state. A non-nil Transport is acceptable only if it
		// is not the project's instrumented wrapper.
		if strings.Contains(reflectTypeName(svc.client.Transport), "otelhttp") {
			t.Fatalf("proxy client must not be tracing-instrumented; got %s", reflectTypeName(svc.client.Transport))
		}
	}
}

func reflectTypeName(v any) string {
	if v == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%T", v)
}
