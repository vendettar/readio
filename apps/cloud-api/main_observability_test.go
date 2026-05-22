package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"readio-cloud/internal/admin"
	"readio-cloud/internal/loki"
	"readio-cloud/internal/observability"
)

// In main package tests, we use httptest
func newTestRecorder() *httptest.ResponseRecorder {
	return httptest.NewRecorder()
}

func newTestRequest(method, target string, body *string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	return req
}

func TestCloudMuxDoesNotRegisterMetricsRoute(t *testing.T) {
	mux := newCloudMux(http.NotFoundHandler(), http.NotFoundHandler(), http.NotFoundHandler())

	rr := newTestRecorder()
	req := newTestRequest(http.MethodGet, "/metrics", nil)
	mux.ServeHTTP(rr, req)

	// /metrics should not be a registered route.
	require.NotEqual(t, http.StatusOK, rr.Code)
}

func TestOTLPEnvVarsAbsentFromBrowserEnvAllowlist(t *testing.T) {
	data, err := os.ReadFile("browser-env-allowlist.json")
	require.NoError(t, err)

	var artifact []string
	err = json.Unmarshal(data, &artifact)
	require.NoError(t, err)

	forbidden := []string{
		"READIO_GRAFANA_OTLP_ENDPOINT",
		"READIO_GRAFANA_OTLP_HEADERS",
		"READIO_GRAFANA_OTLP_INSTANCE_ID",
		"READIO_GRAFANA_OTLP_TOKEN",
	}
	for _, key := range artifact {
		for _, f := range forbidden {
			require.NotEqual(t, f, key)
		}
	}
	for _, key := range browserEnvAllowlist {
		for _, f := range forbidden {
			require.NotEqual(t, f, key)
		}
	}
}

func TestLokiEnvVarsAbsentFromBrowserRuntime(t *testing.T) {
	t.Setenv(loki.LokiURLEnv, "https://logs-prod.grafana.net/loki/api/v1/push")
	t.Setenv(loki.LokiUserEnv, "grafana-user")
	t.Setenv(loki.LokiTokenEnv, "grafana-token")
	t.Setenv(loki.LokiLogLevelEnv, "debug")
	t.Setenv(loki.LokiBatchSizeEnv, "10")
	t.Setenv(loki.LokiFlushIntervalEnv, "2")
	t.Setenv(loki.LokiQueueSizeEnv, "20")

	forbidden := []string{
		loki.LokiURLEnv,
		loki.LokiUserEnv,
		loki.LokiTokenEnv,
		loki.LokiLogLevelEnv,
		loki.LokiBatchSizeEnv,
		loki.LokiFlushIntervalEnv,
		loki.LokiQueueSizeEnv,
	}

	payload := buildBrowserRuntimeEnv(newTestRequest(http.MethodGet, browserConfigRoute, nil))
	for _, key := range forbidden {
		if _, ok := payload[key]; ok {
			t.Fatalf("%s must not be emitted in browser runtime config", key)
		}
	}

	data, err := os.ReadFile("browser-env-allowlist.json")
	require.NoError(t, err)
	var artifact []string
	err = json.Unmarshal(data, &artifact)
	require.NoError(t, err)

	for _, key := range browserEnvAllowlist {
		for _, forbiddenKey := range forbidden {
			require.NotEqual(t, forbiddenKey, key)
		}
	}
	for _, key := range artifact {
		for _, forbiddenKey := range forbidden {
			require.NotEqual(t, forbiddenKey, key)
		}
	}
}

func TestOTLPHeadersEnvAbsentFromBrowserAllowlist(t *testing.T) {
	data, err := os.ReadFile("browser-env-allowlist.json")
	require.NoError(t, err)
	var artifact []string
	err = json.Unmarshal(data, &artifact)
	require.NoError(t, err)
	for _, key := range artifact {
		require.NotEqual(t, "READIO_GRAFANA_OTLP_HEADERS", key)
	}
	for _, key := range browserEnvAllowlist {
		require.NotEqual(t, "READIO_GRAFANA_OTLP_HEADERS", key)
	}
}

func TestRequestMetricsKeepAdminSummaryContractIntact(t *testing.T) {
	rb := admin.NewAdminRingBuffer(100)
	now := time.Now()
	rb.Push(admin.LogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10, ErrorClass: "none", Status: http.StatusOK})
	rb.Push(admin.LogEntry{Ts: now, Level: "ERROR", Msg: "fail", Route: "proxy/media", ElapsedMs: 200, ErrorClass: "timeout", Status: http.StatusGatewayTimeout})

	observability.RecordHTTPMetric(context.Background(), "proxy/media", http.StatusOK, "none", time.Millisecond)
	observability.RecordUpstreamMetric(context.Background(), "proxy", "proxy/media", http.StatusGatewayTimeout, "timeout", "uncached", time.Millisecond)

	h := admin.NewHandler("tok", rb, time.Now())
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.AuthMiddleware(h.HandleAdminMetricsSummary)(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]any
	err := json.NewDecoder(rr.Body).Decode(&resp)
	require.NoError(t, err)
	byRoute, ok := resp["by_route"].(map[string]any)
	require.True(t, ok)
	routeEntry, ok := byRoute["proxy/media"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, 2, int(routeEntry["count"].(float64)))
	require.Equal(t, 1, int(routeEntry["errors"].(float64)))
}
