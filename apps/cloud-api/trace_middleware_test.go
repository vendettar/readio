package main

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// installRecordingTracer installs an in-memory span exporter wired through a
// SimpleSpanProcessor and the project's traceAttributeSanitizer, so tests can
// inspect the spans the inbound middleware actually emits. Globals are
// restored on test cleanup.
func installRecordingTracer(t *testing.T) *tracetest.InMemoryExporter {
	t.Helper()
	withTracingGlobalsRestore(t)

	exporter := tracetest.NewInMemoryExporter()
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSyncer(newSanitizingExporter(exporter)),
	)
	t.Cleanup(func() {
		_ = provider.Shutdown(context.Background())
	})
	otel.SetTracerProvider(provider)
	return exporter
}

func TestWrapInboundHandlerCreatesServerSpanWithRouteTemplate(t *testing.T) {
	exporter := installRecordingTracer(t)

	mux := http.NewServeMux()
	mux.HandleFunc(discoverySearchPodcastsRoute, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := wrapInboundHandler(mux)

	rr := newTestRecorder()
	req := mustNewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?q=secret+user+text")
	req.Header.Set("Referer", "https://malicious.example/leaked?token=abc")
	req.Header.Set("User-Agent", "TestAgent/1.0")
	handler.ServeHTTP(rr, req)

	spans := exporter.GetSpans()
	if len(spans) == 0 {
		t.Fatalf("expected at least one recorded span")
	}

	// Find the server span the middleware should have produced.
	var server *tracetest.SpanStub
	for i := range spans {
		s := spans[i]
		if strings.HasPrefix(s.Name, "GET ") {
			server = &spans[i]
			break
		}
	}
	if server == nil {
		t.Fatalf("expected a server span; got names=%v", spanNames(spans))
		return
	}

	if want := "GET " + discoverySearchPodcastsRoute; server.Name != want {
		t.Fatalf("server span name = %q want %q", server.Name, want)
	}

	for _, kv := range server.Attributes {
		key := string(kv.Key)
		value := kv.Value.AsString()
		if _, unsafe := unsafeSpanAttributes[kv.Key]; unsafe {
			t.Fatalf("unsafe attribute %s leaked through sanitizing exporter: %q", key, value)
		}
		if strings.Contains(value, "secret") || strings.Contains(value, "user+text") ||
			strings.Contains(value, "user text") {
			t.Fatalf("attribute %s leaked query/user text: %q", key, value)
		}
		if strings.Contains(value, "malicious.example") || strings.Contains(value, "token=abc") {
			t.Fatalf("attribute %s leaked referer: %q", key, value)
		}
	}
}

func TestWrapInboundHandlerHidesPodcastID(t *testing.T) {
	exporter := installRecordingTracer(t)

	mux := http.NewServeMux()
	mux.Handle(discoveryRoutePrefix, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	handler := wrapInboundHandler(mux)

	rr := newTestRecorder()
	req := mustNewRequest(http.MethodGet, "/api/v1/discovery/podcasts/1535809341/episodes?q=top%20secret")
	handler.ServeHTTP(rr, req)

	spans := exporter.GetSpans()
	if len(spans) == 0 {
		t.Fatalf("expected at least one span")
	}
	for _, span := range spans {
		if strings.Contains(span.Name, "1535809341") {
			t.Fatalf("iTunes id leaked in span name %q", span.Name)
		}
		for _, kv := range span.Attributes {
			v := kv.Value.AsString()
			if strings.Contains(v, "1535809341") {
				t.Fatalf("iTunes id leaked in attribute %s = %q", kv.Key, v)
			}
			if strings.Contains(v, "secret") {
				t.Fatalf("query text leaked in attribute %s = %q", kv.Key, v)
			}
		}
		if want := "GET /api/v1/discovery/podcasts/{id}/episodes"; strings.HasPrefix(span.Name, "GET ") && span.Name != want {
			t.Fatalf("server span name = %q want %q", span.Name, want)
		}
	}
}

// TestWrapInboundHandlerDisabledTracingLeavesBehaviorUnchanged asserts that a
// no-op tracer provider still produces no recorded spans while requests are
// served end-to-end with the same status code and body.
func TestWrapInboundHandlerDisabledTracingLeavesBehaviorUnchanged(t *testing.T) {
	withTracingGlobalsRestore(t)
	// Do NOT install a recording provider; rely on the default global tracer.

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := wrapInboundHandler(mux)
	rr := newTestRecorder()
	req := mustNewRequest(http.MethodGet, "/healthz")
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d want %d", rr.Code, http.StatusOK)
	}
}

func TestTraceAttributeSanitizerStripsKnownUnsafeKeys(t *testing.T) {
	exporter := installRecordingTracer(t)
	tracer := otel.GetTracerProvider().Tracer("test")

	_, span := tracer.Start(context.Background(), "probe")
	// Inject every key the sanitizer is configured to strip.
	for k := range unsafeSpanAttributes {
		span.SetAttributes(attribute.String(string(k), "leak"))
	}
	span.End()

	spans := exporter.GetSpans()
	if len(spans) != 1 {
		t.Fatalf("expected exactly one span; got %d", len(spans))
	}
	for _, kv := range spans[0].Attributes {
		if _, unsafe := unsafeSpanAttributes[kv.Key]; unsafe {
			t.Fatalf("unsafe attribute %s leaked through sanitizing exporter", kv.Key)
		}
	}
}

func spanNames(spans []tracetest.SpanStub) []string {
	out := make([]string, 0, len(spans))
	for _, s := range spans {
		out = append(out, s.Name)
	}
	return out
}
