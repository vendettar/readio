package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestInitObservabilityNoopWhenEnvMissing(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
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

func TestInitObservabilityNoopWhenPartialEnv(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "some-token")

	shutdown, err := initObservability(context.Background())
	if err != nil {
		t.Fatalf("initObservability error: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown error: %v", err)
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

	forbidden := []string{grafanaOTLPEndpointEnv, grafanaOTLPInstanceIDEnv, grafanaOTLPTokenEnv}
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
