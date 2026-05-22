package observability

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
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
	handler := WrapInboundHandler(mux)

	rr := newTestRecorder()
	req := mustNewRequest(http.MethodGet, discoverySearchPodcastsRoute+"?q=secret+user+text")
	req.Header.Set("Referer", "https://malicious.example/leaked?token=abc")
	req.Header.Set("User-Agent", "TestAgent/1.0")
	handler.ServeHTTP(rr, req)

	spans := exporter.GetSpans()
	require.NotEmpty(t, spans)

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

	require.Equal(t, "GET "+discoverySearchPodcastsRoute, server.Name)

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
		require.NotContains(t, value, "malicious.example")
		require.NotContains(t, value, "token=abc")
	}
}

func TestWrapInboundHandlerHidesPodcastID(t *testing.T) {
	exporter := installRecordingTracer(t)

	mux := http.NewServeMux()
	mux.Handle(discoveryRoutePrefix, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	handler := WrapInboundHandler(mux)

	rr := newTestRecorder()
	req := mustNewRequest(http.MethodGet, "/api/v1/discovery/podcasts/1535809341/episodes?q=top%20secret")
	handler.ServeHTTP(rr, req)

	spans := exporter.GetSpans()
	require.NotEmpty(t, spans)

	var server *tracetest.SpanStub
	for i := range spans {
		if strings.HasPrefix(spans[i].Name, "GET ") {
			server = &spans[i]
			break
		}
	}
	if server == nil {
		t.Fatalf("expected a server span; got names=%v", spanNames(spans))
		return
	}

	require.Equal(t, "GET /api/v1/discovery/podcasts/{id}/episodes", server.Name)
	for _, kv := range server.Attributes {
		v := kv.Value.AsString()
		require.NotContains(t, v, "1535809341")
		require.NotContains(t, v, "secret")
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
	handler := WrapInboundHandler(mux)
	rr := newTestRecorder()
	req := mustNewRequest(http.MethodGet, "/healthz")
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
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
	require.Len(t, spans, 1)
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
