package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"testing"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/resource"
)

func TestInitObservabilityNoopWhenEnvMissing(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	shutdown, err := initObservability(context.Background())
	if err != nil {
		t.Fatalf("initObservability error: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown error: %v", err)
	}

	// Recording functions must not panic with noop instruments.
	recordHTTPMetric("proxy/media", http.StatusOK, "none", time.Millisecond)
	recordUpstreamMetric("proxy", "proxy/media", http.StatusOK, "none", CacheStatusUncached, time.Millisecond)
	recordASRRelayMetric("groq", "direct", http.StatusOK, "none")
}

// Partial OTLP configuration must fail fast so the operator notices at
// startup rather than from repeated upstream 401 upload failures.
func TestInitObservabilityFailsFastOnPartialEnv(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "some-token")

	if _, err := initObservability(context.Background()); err == nil {
		t.Fatalf("initObservability should fail when instance id is missing while token is set")
	}
}

func TestInitObservabilityFailsFastOnMalformedHeaders(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "NotAllowed=value")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	if _, err := initObservability(context.Background()); err == nil {
		t.Fatalf("initObservability should fail when OTLP headers carry disallowed entries")
	}
}

func TestCloudMuxDoesNotRegisterMetricsRoute(t *testing.T) {
	mux := newCloudMux(http.NotFoundHandler(), http.NotFoundHandler(), http.NotFoundHandler())

	rr := newTestRecorder()
	req := newTestRequest(http.MethodGet, "/metrics", nil)
	mux.ServeHTTP(rr, req)

	// /metrics should not be a registered route.
	if rr.Code == http.StatusOK {
		t.Fatalf("/metrics returned 200; it should not be a registered route")
	}
}

func TestOTLPEnvVarsAbsentFromBrowserEnvAllowlist(t *testing.T) {
	data, err := os.ReadFile("browser-env-allowlist.json")
	if err != nil {
		t.Fatalf("read allowlist artifact: %v", err)
	}

	var artifact []string
	if err := json.Unmarshal(data, &artifact); err != nil {
		t.Fatalf("unmarshal allowlist artifact: %v", err)
	}

	forbidden := []string{
		grafanaOTLPEndpointEnv,
		grafanaOTLPHeadersEnv,
		grafanaOTLPInstanceIDEnv,
		grafanaOTLPTokenEnv,
	}
	for _, key := range artifact {
		for _, f := range forbidden {
			if key == f {
				t.Fatalf("%s must not be browser-visible", f)
			}
		}
	}
	for _, key := range browserEnvAllowlist {
		for _, f := range forbidden {
			if key == f {
				t.Fatalf("%s must not be in browserEnvAllowlist", f)
			}
		}
	}
}

func TestLokiEnvVarsAbsentFromBrowserRuntime(t *testing.T) {
	t.Setenv(lokiURLEnv, "https://logs-prod.grafana.net/loki/api/v1/push")
	t.Setenv(lokiUserEnv, "grafana-user")
	t.Setenv(lokiTokenEnv, "grafana-token")
	t.Setenv(lokiLogLevelEnv, "debug")
	t.Setenv(lokiBatchSizeEnv, "10")
	t.Setenv(lokiFlushIntervalEnv, "2")
	t.Setenv(lokiQueueSizeEnv, "20")

	forbidden := []string{
		lokiURLEnv,
		lokiUserEnv,
		lokiTokenEnv,
		lokiLogLevelEnv,
		lokiBatchSizeEnv,
		lokiFlushIntervalEnv,
		lokiQueueSizeEnv,
	}

	payload := buildBrowserRuntimeEnv(newTestRequest(http.MethodGet, browserConfigRoute, nil))
	for _, key := range forbidden {
		if _, ok := payload[key]; ok {
			t.Fatalf("%s must not be emitted in browser runtime config", key)
		}
	}

	data, err := os.ReadFile("browser-env-allowlist.json")
	if err != nil {
		t.Fatalf("read allowlist artifact: %v", err)
	}
	var artifact []string
	if err := json.Unmarshal(data, &artifact); err != nil {
		t.Fatalf("unmarshal allowlist artifact: %v", err)
	}

	for _, key := range browserEnvAllowlist {
		for _, forbiddenKey := range forbidden {
			if key == forbiddenKey {
				t.Fatalf("%s must not be in browserEnvAllowlist", forbiddenKey)
			}
		}
	}
	for _, key := range artifact {
		for _, forbiddenKey := range forbidden {
			if key == forbiddenKey {
				t.Fatalf("%s must not be browser-visible", forbiddenKey)
			}
		}
	}
}

func newTestRecorder() *testResponseRecorder {
	return &testResponseRecorder{header: make(http.Header)}
}

type testResponseRecorder struct {
	Code   int
	header http.Header
}

func (r *testResponseRecorder) Header() http.Header         { return r.header }
func (r *testResponseRecorder) Write(b []byte) (int, error) { return len(b), nil }
func (r *testResponseRecorder) WriteHeader(code int)        { r.Code = code }

func newTestRequest(method, target string, body *string) *http.Request {
	if body != nil {
		return mustNewRequest(method, target)
	}
	return mustNewRequest(method, target)
}

func mustNewRequest(method, target string) *http.Request {
	req, err := http.NewRequest(method, target, nil)
	if err != nil {
		panic(err)
	}
	return req
}

// TestDurationHistogramBuckets verifies that durationHistogramBuckets is
// strictly sorted, has no duplicates, starts above zero, and includes
// boundaries that give meaningful resolution in the 1–5 s range where the
// default OTel SDK buckets (2.5 s → 5.0 s) cause histogram_quantile to
// collapse all P95 values to ~4.75 s.
func TestDurationHistogramBuckets(t *testing.T) {
	bs := durationHistogramBuckets
	if len(bs) == 0 {
		t.Fatal("durationHistogramBuckets must not be empty")
	}
	if bs[0] <= 0 {
		t.Errorf("first bucket boundary must be > 0, got %v", bs[0])
	}
	for i := 1; i < len(bs); i++ {
		if bs[i] <= bs[i-1] {
			t.Errorf("bucket boundaries must be strictly increasing: bs[%d]=%v <= bs[%d]=%v", i, bs[i], i-1, bs[i-1])
		}
	}

	// Must have at least one boundary between 1 s and 5 s (exclusive) so
	// that P95 values in the 1–5 s range can be distinguished.
	hasIntermediate := false
	for _, b := range bs {
		if b > 1.0 && b < 5.0 {
			hasIntermediate = true
			break
		}
	}
	if !hasIntermediate {
		t.Error("durationHistogramBuckets must contain at least one boundary strictly between 1 s and 5 s")
	}
}

// TestDurationHistogramViewAppliesBuckets records a single observation and
// confirms the collected histogram uses durationHistogramBuckets, not the
// OTel SDK defaults.
func TestDurationHistogramViewAppliesBuckets(t *testing.T) {
	reader := metric.NewManualReader()
	provider := metric.NewMeterProvider(
		metric.WithResource(resource.Empty()),
		metric.WithReader(reader),
		metric.WithView(durationHistogramView("readio_cloud_http_request_duration_seconds")),
	)
	meter := provider.Meter("test")
	if err := createInstruments(meter); err != nil {
		t.Fatalf("createInstruments: %v", err)
	}

	globalEnvAttribute = attribute.String(unifiedEnvAttr, "test")
	recordHTTPMetric("/api/test", http.StatusOK, "none", 3*time.Second)

	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatalf("collect: %v", err)
	}

	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name != "readio_cloud_http_request_duration_seconds" {
				continue
			}
			h, ok := m.Data.(metricdata.Histogram[float64])
			if !ok {
				t.Fatalf("expected Histogram data, got %T", m.Data)
			}
			if len(h.DataPoints) == 0 {
				t.Fatal("no data points collected")
			}
			got := h.DataPoints[0].Bounds
			if len(got) != len(durationHistogramBuckets) {
				t.Fatalf("bucket count mismatch: want %d, got %d", len(durationHistogramBuckets), len(got))
			}
			for i, want := range durationHistogramBuckets {
				if got[i] != want {
					t.Errorf("bucket[%d]: want %v, got %v", i, want, got[i])
				}
			}
			return
		}
	}
	t.Fatal("readio_cloud_http_request_duration_seconds not found in collected metrics")
}

func TestMetricsCarryEnvAttribute(t *testing.T) {
	// 1. Setup a test meter with a manual reader so we can inspect the recorded data.
	reader := metric.NewManualReader()
	res := resource.Empty()
	provider := metric.NewMeterProvider(
		metric.WithResource(res),
		metric.WithReader(reader),
	)
	meter := provider.Meter("test")

	// 2. Initialize the global instruments using the test meter.
	if err := createInstruments(meter); err != nil {
		t.Fatalf("failed to create instruments: %v", err)
	}

	// 3. Set a dummy global env attribute (as if initObservability ran).
	expectedEnv := "production"
	globalEnvAttribute = attribute.String(unifiedEnvAttr, expectedEnv)

	// 4. Record a metric.
	recordHTTPMetric("/api/test", http.StatusOK, "none", 100*time.Millisecond)

	// 5. Collect the recorded metrics.
	var rm metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &rm); err != nil {
		t.Fatalf("failed to collect metrics: %v", err)
	}

	// 6. Verify the 'env' attribute is present in the recorded data.
	foundEnv := false
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name == "readio_cloud_http_request_duration_seconds" {
				// Histograms store points in their Data field.
				if h, ok := m.Data.(metricdata.Histogram[float64]); ok {
					for _, p := range h.DataPoints {
						for _, attr := range p.Attributes.ToSlice() {
							if attr.Key == attribute.Key(unifiedEnvAttr) && attr.Value.AsString() == expectedEnv {
								foundEnv = true
							}
						}
					}
				}
			}
		}
	}

	if !foundEnv {
		t.Errorf("expected metric to carry attribute env=%q, but it was not found", expectedEnv)
	}
}
