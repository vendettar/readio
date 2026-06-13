package observability

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/trace"
)

func TestInitObservabilityNoopWhenEnvMissing(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	shutdown, err := InitObservability(context.Background())
	require.NoError(t, err)
	err = shutdown(context.Background())
	require.NoError(t, err)

	// Recording functions must not panic with noop instruments.
	RecordHTTPMetric(context.Background(), "proxy/media", http.StatusOK, "none", time.Millisecond)
	RecordUpstreamMetric(context.Background(), "proxy", "proxy/media", http.StatusOK, "none", cacheStatusUncached, time.Millisecond)
	RecordASRRelayMetric(context.Background(), "groq", "direct", http.StatusOK, "none")
}

// Partial OTLP configuration must fail fast so the operator notices at
// startup rather than from repeated upstream 401 upload failures.
func TestInitObservabilityFailsFastOnPartialEnv(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "some-token")

	_, err := InitObservability(context.Background())

	require.NotNil(t, err)
}

func TestInitObservabilityFailsFastOnMalformedHeaders(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "NotAllowed=value")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	_, err := InitObservability(context.Background())

	require.NotNil(t, err)
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
	require.NotEmpty(t, bs)
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
	assert.True(t, hasIntermediate)
}

func TestMetricRouteMapsDiscoverySearchCache(t *testing.T) {
	require.Equal(t, "discovery/search/cache", metricRoute(discoverySearchCacheRoute))
	require.Equal(t, "unknown", metricRoute(discoverySearchCacheRoute+"?term=private"))
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
	err := createInstruments(meter)
	require.NoError(t, err)

	globalEnvAttribute = attribute.String(unifiedEnvAttr, "test")
	RecordHTTPMetric(context.Background(), "/api/test", http.StatusOK, "none", 3*time.Second)

	var rm metricdata.ResourceMetrics
	err = reader.Collect(context.Background(), &rm)
	require.NoError(t, err)

	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name != "readio_cloud_http_request_duration_seconds" {
				continue
			}
			h, ok := m.Data.(metricdata.Histogram[float64])
			require.True(t, ok)
			require.NotEmpty(t, h.DataPoints)
			got := h.DataPoints[0].Bounds
			require.Len(t, got, len(durationHistogramBuckets))
			for i, want := range durationHistogramBuckets {
				assert.Equal(t, want, got[i])
			}
			return
		}
	}
	t.Fatal("readio_cloud_http_request_duration_seconds not found in collected metrics")
}

func TestRecordHTTPMetricUsesContextForExemplars(t *testing.T) {
	reader := metric.NewManualReader()
	provider := metric.NewMeterProvider(
		metric.WithResource(resource.Empty()),
		metric.WithReader(reader),
		metric.WithView(durationHistogramView("readio_cloud_http_request_duration_seconds")),
	)
	meter := provider.Meter("test")
	err := createInstruments(meter)
	require.NoError(t, err)

	globalEnvAttribute = attribute.String(unifiedEnvAttr, "test")
	traceID := trace.TraceID{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	spanID := trace.SpanID{1, 2, 3, 4, 5, 6, 7, 8}
	spanContext := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceFlags: trace.FlagsSampled,
	})
	ctx := trace.ContextWithSpanContext(context.Background(), spanContext)

	RecordHTTPMetric(ctx, "/api/test", http.StatusOK, "none", 1500*time.Millisecond)

	var rm metricdata.ResourceMetrics
	err = reader.Collect(context.Background(), &rm)
	require.NoError(t, err)

	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name != "readio_cloud_http_request_duration_seconds" {
				continue
			}
			h, ok := m.Data.(metricdata.Histogram[float64])
			require.True(t, ok)
			for _, p := range h.DataPoints {
				for _, exemplar := range p.Exemplars {
					if string(exemplar.TraceID) == string(traceID[:]) {
						return
					}
				}
			}
			t.Fatal("expected histogram exemplar with request trace ID")
		}
	}
	t.Fatal("readio_cloud_http_request_duration_seconds not found in collected metrics")
}

func TestRecordUpstreamMetricUsesContextForExemplars(t *testing.T) {
	reader := metric.NewManualReader()
	provider := metric.NewMeterProvider(
		metric.WithResource(resource.Empty()),
		metric.WithReader(reader),
		metric.WithView(durationHistogramView("readio_cloud_upstream_request_duration_seconds")),
	)
	meter := provider.Meter("test")
	err := createInstruments(meter)
	require.NoError(t, err)

	globalEnvAttribute = attribute.String(unifiedEnvAttr, "test")
	traceID := trace.TraceID{16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1}
	spanID := trace.SpanID{8, 7, 6, 5, 4, 3, 2, 1}
	spanContext := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceFlags: trace.FlagsSampled,
	})
	ctx := trace.ContextWithSpanContext(context.Background(), spanContext)

	RecordUpstreamMetric(ctx, upstreamKindPodcastIndex, discoverySearchPodcastsRoute, http.StatusOK, "none", "miss", 1250*time.Millisecond)

	var rm metricdata.ResourceMetrics
	err = reader.Collect(context.Background(), &rm)
	require.NoError(t, err)

	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name != "readio_cloud_upstream_request_duration_seconds" {
				continue
			}
			h, ok := m.Data.(metricdata.Histogram[float64])
			require.True(t, ok)
			for _, p := range h.DataPoints {
				for _, exemplar := range p.Exemplars {
					if string(exemplar.TraceID) == string(traceID[:]) {
						return
					}
				}
			}
			t.Fatal("expected upstream histogram exemplar with request trace ID")
		}
	}
	t.Fatal("readio_cloud_upstream_request_duration_seconds not found in collected metrics")
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
	err := createInstruments(meter)
	require.NoError(t, err)

	// 3. Set a dummy global env attribute (as if InitObservability ran).
	expectedEnv := "production"
	globalEnvAttribute = attribute.String(unifiedEnvAttr, expectedEnv)

	// 4. Record a metric.
	RecordHTTPMetric(context.Background(), "/api/test", http.StatusOK, "none", 100*time.Millisecond)

	// 5. Collect the recorded metrics.
	var rm metricdata.ResourceMetrics
	err = reader.Collect(context.Background(), &rm)
	require.NoError(t, err)

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

	assert.True(t, foundEnv)
}

func TestGetProcessCPUSecondsReturnsNonNegative(t *testing.T) {
	cpu := getProcessCPUSeconds()
	if cpu < 0 {
		t.Errorf("getProcessCPUSeconds must not be negative, got %f", cpu)
	}
}

func TestHostMetricsSnapshotIncludesCPUSeconds(t *testing.T) {
	snapshot := collectHostMetricsSnapshot("", "", "test", hostMetricsSnapshot{}, time.Now())

	if snapshot.cpuSecondsTotal < 0 {
		t.Errorf("cpuSecondsTotal must not be negative, got %f", snapshot.cpuSecondsTotal)
	}
}

func TestNormalizeMetricEnv(t *testing.T) {
	tests := []struct{ input, want string }{
		{"prod", "production"},
		{"production", "production"},
		{"PRODUCTION", "production"},
		{"pre", "preproduction"},
		{"preprod", "preproduction"},
		{"preproduction", "preproduction"},
		{"staging", "preproduction"},
		{"dev", "develop"},
		{"", "unknown"},
		{"  ", "unknown"},
	}
	for _, tc := range tests {
		got := NormalizeMetricEnv(tc.input)
		assert.Equal(t, tc.want, got)
	}
}
