package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRequestMetricLabelMappersUseClosedEnums(t *testing.T) {
	tests := []struct {
		name string
		got  string
		want string
	}{
		{name: "status 2xx", got: metricStatusClass(http.StatusOK), want: "2xx"},
		{name: "status 3xx", got: metricStatusClass(http.StatusTemporaryRedirect), want: "3xx"},
		{name: "status 4xx", got: metricStatusClass(http.StatusBadRequest), want: "4xx"},
		{name: "status 5xx", got: metricStatusClass(http.StatusBadGateway), want: "5xx"},
		{name: "status unknown", got: metricStatusClass(0), want: "unknown"},
		{name: "raw error class", got: metricErrorClass("dial tcp: raw secret host failed"), want: "unknown"},
		{name: "cache fresh hit", got: metricCacheStatus(CacheStatusFreshHit), want: "hit"},
		{name: "cache stale fallback", got: metricCacheStatus(CacheStatusStaleFallback), want: "stale"},
		{name: "cache uncached", got: metricCacheStatus(CacheStatusUncached), want: "bypass"},
		{name: "provider apple search", got: metricProvider(UpstreamKindAppleSearch), want: "apple"},
		{name: "provider raw host", got: metricProvider("https://secret.example.test?q=1"), want: "unknown"},
		{name: "asr worker mode", got: metricASRMode(true, "groq"), want: "worker"},
		{name: "asr direct mode", got: metricASRMode(false, "groq"), want: "direct"},
		{name: "asr unknown mode", got: metricASRMode(false, "not-a-provider"), want: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Fatalf("got %q, want %q", tt.got, tt.want)
			}
		})
	}
}

func TestRecordingFunctionsDoNotPanicWithNoopInstruments(t *testing.T) {
	initNoopMetrics()

	recordHTTPMetric("proxy/media", http.StatusOK, "none", 100*time.Millisecond)
	recordHTTPMetric(discoverySearchPodcastsRoute, http.StatusBadRequest, "param_error", 5*time.Millisecond)
	recordHTTPMetric("/unknown/route", http.StatusNotFound, "unknown", time.Millisecond)

	recordUpstreamMetric(UpstreamKindAppleSearch, discoverySearchPodcastsRoute, http.StatusOK, "none", CacheStatusFreshHit, 200*time.Millisecond)
	recordUpstreamMetric(UpstreamKindPodcastIndex, discoveryPodcastsBatchRoute, http.StatusBadGateway, "upstream", CacheStatusMissError, time.Second)
	recordUpstreamMetric("proxy", "proxy/media", http.StatusGatewayTimeout, "timeout", CacheStatusUncached, 10*time.Second)

	recordASRRelayMetric("groq", "direct", http.StatusOK, "none")
	recordASRRelayMetric("cloudflare", "builtin", http.StatusInternalServerError, "upstream")
	recordASRRelayMetric("unknown-provider", "unknown", http.StatusBadRequest, "client_error")
}

func TestRecordingFunctionsNormalizeLabelsThroughClosedEnums(t *testing.T) {
	initNoopMetrics()

	// These should all succeed without panic - the closed enum mappers
	// convert any unexpected input to "unknown".
	recordHTTPMetric("https://secret.example.com/api?key=secret", 999, "raw-tcp-error: connection refused to secret-host:5432", time.Millisecond)
	recordUpstreamMetric("https://secret-upstream.example.com/api", "/api/v1/secret-route", 0, "raw dial error", "unexpected-cache-state", time.Millisecond)
	recordASRRelayMetric("secret-provider-name", "secret-mode", 0, "secret-error-class")
}

func TestRequestMetricsKeepAdminSummaryContractIntact(t *testing.T) {
	initNoopMetrics()

	rb := newAdminRingBuffer(100)
	now := time.Now()
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10, ErrorClass: "none", Status: http.StatusOK})
	rb.push(adminLogEntry{Ts: now, Level: "ERROR", Msg: "fail", Route: "proxy/media", ElapsedMs: 200, ErrorClass: "timeout", Status: http.StatusGatewayTimeout})

	recordHTTPMetric("proxy/media", http.StatusOK, "none", time.Millisecond)
	recordUpstreamMetric("proxy", "proxy/media", http.StatusGatewayTimeout, "timeout", CacheStatusUncached, time.Millisecond)

	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	byRoute, ok := resp["by_route"].(map[string]any)
	if !ok {
		t.Fatalf("by_route not a map, got %T", resp["by_route"])
	}
	routeEntry, ok := byRoute["proxy/media"].(map[string]any)
	if !ok {
		t.Fatalf("expected proxy/media in by_route, got keys: %v", byRoute)
	}
	if int(routeEntry["count"].(float64)) != 2 {
		t.Fatalf("count = %v, want 2", routeEntry["count"])
	}
	if int(routeEntry["errors"].(float64)) != 1 {
		t.Fatalf("errors = %v, want 1", routeEntry["errors"])
	}
}
