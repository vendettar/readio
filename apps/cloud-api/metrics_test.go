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
