package loki

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"readio-cloud/internal/admin"
)

func TestResolveLokiConfigDisabledWhenRequiredEnvMissing(t *testing.T) {
	tests := []struct {
		name  string
		url   string
		user  string
		token string
	}{
		{name: "all missing"},
		{name: "missing url", user: "123", token: "token"},
		{name: "missing user", url: "https://logs.example/loki/api/v1/push", token: "token"},
		{name: "missing token", url: "https://logs.example/loki/api/v1/push", user: "123"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(lokiURLEnv, tc.url)
			t.Setenv(lokiUserEnv, tc.user)
			t.Setenv(lokiTokenEnv, tc.token)

			cfg := resolveLokiConfig()
			require.False(t, cfg.Enabled)
		})
	}
}

func TestLokiPayloadFormatAuthLabelsAndRedaction(t *testing.T) {
	var gotAuth string
	var payload lokiPushRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		require.Equal(t, "/loki/api/v1/push", r.URL.Path)
		err := json.NewDecoder(r.Body).Decode(&payload)
		require.NoError(t, err)
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	shipper := newLokiShipper(lokiConfig{
		Enabled:       true,
		URL:           server.URL + "/loki/api/v1/push",
		User:          "instance-id",
		Token:         "secret-token",
		Env:           "preproduction",
		MinLevel:      slog.LevelInfo,
		BatchSize:     10,
		FlushInterval: time.Hour,
		QueueSize:     10,
	}, server.Client())
	t.Cleanup(func() { _ = shipper.Shutdown(context.Background()) })

	entry := admin.LogEntry{
		Ts:         time.Unix(1700000000, 123).UTC(),
		Level:      "INFO",
		Msg:        "proxy request",
		Route:      "proxy/media",
		ElapsedMs:  42,
		ErrorClass: "none",
		Status:     http.StatusOK,
		Attrs: map[string]string{
			"apiKey":      "[REDACTED]",
			"referer":     "https://evil.example/player?token=secret",
			"remote_addr": "203.0.113.9:443",
			"error":       "query pi cache refresh state: SQL logic error: no such table: podcast_cache_state (1)",
		},
	}
	require.True(t, shipper.Enqueue(entry))
	err := shipper.Flush(context.Background())
	require.NoError(t, err)

	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("instance-id:secret-token"))
	require.Equal(t, wantAuth, gotAuth)
	require.NotContains(t, mustJSON(t, payload), "secret-token")
	require.Len(t, payload.Streams, 1)
	stream := payload.Streams[0]
	wantLabels := map[string]string{
		"service": "readio-cloud",
		"env":     "preproduction",
		"level":   "info",
	}
	require.Equal(t, mustJSON(t, wantLabels), mustJSON(t, stream.Stream))
	require.Len(t, stream.Values, 1)

	var line map[string]any
	err = json.Unmarshal([]byte(stream.Values[0][1]), &line)
	require.NoError(t, err)
	require.Equal(t, "proxy request", line["msg"])
	require.Equal(t, "proxy/media", line["route"])
	require.Equal(t, "query pi cache refresh state: SQL logic error: no such table: podcast_cache_state (1)", line["error"])
	if _, ok := line["apiKey"]; ok {
		t.Fatal("sensitive attr should not be shipped as raw log field")
	}
	attrs, ok := line["attrs"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "https://evil.example", attrs["referer"])
	require.Equal(t, "203.0.113.9:443", attrs["remote_addr"])
	if _, ok := attrs["error"]; ok {
		t.Fatal("error should be promoted to top-level field, not duplicated inside attrs")
	}
	if got := mustJSON(t, line); strings.Contains(got, "token=secret") || strings.Contains(got, "https://evil.example/player") {
		t.Fatalf("full referer path/query leaked in line: %s", got)
	}
}

func TestLokiQueueFullDoesNotBlock(t *testing.T) {
	shipper := newLokiShipper(lokiConfig{
		Enabled:       true,
		URL:           "https://logs.example/loki/api/v1/push",
		User:          "user",
		Token:         "token",
		Env:           "production",
		MinLevel:      slog.LevelInfo,
		BatchSize:     10,
		FlushInterval: time.Hour,
		QueueSize:     1,
	}, http.DefaultClient)
	t.Cleanup(func() { _ = shipper.Shutdown(context.Background()) })

	entry := admin.LogEntry{Ts: time.Now(), Level: "INFO", Msg: "one"}
	require.True(t, shipper.Enqueue(entry))

	start := time.Now()
	if shipper.Enqueue(entry) {
		t.Fatal("second enqueue succeeded, want drop")
	}
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("full queue enqueue blocked for %v", elapsed)
	}
	require.Equal(t, uint64(1), shipper.Dropped())
}

func TestLokiConfiguredBatchSizeLimitsFlushBatch(t *testing.T) {
	received := make(chan lokiPushRequest, 3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload lokiPushRequest
		err := json.NewDecoder(r.Body).Decode(&payload)
		require.NoError(t, err)
		received <- payload
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	shipper := newLokiShipper(lokiConfig{
		Enabled:       true,
		URL:           server.URL + "/loki/api/v1/push",
		User:          "user",
		Token:         "token",
		Env:           "production",
		MinLevel:      slog.LevelInfo,
		BatchSize:     2,
		FlushInterval: time.Hour,
		QueueSize:     10,
	}, server.Client())
	t.Cleanup(func() { _ = shipper.Shutdown(context.Background()) })

	for i := 0; i < 5; i++ {
		if !shipper.Enqueue(admin.LogEntry{Ts: time.Now(), Level: "INFO", Msg: "queued"}) {
			t.Fatalf("enqueue %d failed", i)
		}
	}
	err := shipper.Flush(context.Background())
	require.NoError(t, err)

	var total int
	for i, wantMax := range []int{2, 2, 1} {
		select {
		case payload := <-received:
			got := countLokiValues(payload)
			total += got
			if got > wantMax {
				t.Fatalf("request %d values = %d, want <= %d", i+1, got, wantMax)
			}
		case <-time.After(time.Second):
			t.Fatalf("timed out waiting for flush request %d", i+1)
		}
	}
	require.Equal(t, 5, total)
	select {
	case payload := <-received:
		t.Fatalf("unexpected extra flush request: %#v", payload)
	default:
	}
}

func TestResolveLokiEnvUsesDeployEnvBeforeFaroEnv(t *testing.T) {
	t.Setenv(deployEnvEnv, "preprod")
	t.Setenv("VITE_GRAFANA_FARO_ENV", "production")

	got := resolveLokiEnv()
	require.Equal(t, "preproduction", got)
}

func TestResolveLokiEnvFallsBackToFaroEnv(t *testing.T) {
	t.Setenv(deployEnvEnv, "")
	t.Setenv("VITE_GRAFANA_FARO_ENV", "prod")

	got := resolveLokiEnv()
	require.Equal(t, "production", got)
}

func TestLokiNetworkErrorsDoNotFailHandler(t *testing.T) {
	shipper := newLokiShipper(lokiConfig{
		Enabled:       true,
		URL:           "http://127.0.0.1:1/loki/api/v1/push",
		User:          "user",
		Token:         "token",
		Env:           "production",
		MinLevel:      slog.LevelInfo,
		BatchSize:     10,
		FlushInterval: time.Hour,
		QueueSize:     10,
	}, &http.Client{Timeout: 10 * time.Millisecond})
	t.Cleanup(func() { _ = shipper.Shutdown(context.Background()) })

	if !shipper.Enqueue(admin.LogEntry{Ts: time.Now(), Level: "INFO", Msg: "queued"}) {
		t.Fatal("enqueue failed")
	}
	_ = shipper.Flush(context.Background())
}

func TestLokiShutdownFlushesQueuedLogsBestEffort(t *testing.T) {
	received := make(chan lokiPushRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload lokiPushRequest
		err := json.NewDecoder(r.Body).Decode(&payload)
		require.NoError(t, err)
		received <- payload
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	shipper := newLokiShipper(lokiConfig{
		Enabled:       true,
		URL:           server.URL + "/loki/api/v1/push",
		User:          "user",
		Token:         "token",
		Env:           "production",
		MinLevel:      slog.LevelInfo,
		BatchSize:     10,
		FlushInterval: time.Hour,
		QueueSize:     10,
	}, server.Client())

	if !shipper.Enqueue(admin.LogEntry{Ts: time.Now(), Level: "ERROR", Msg: "queued"}) {
		t.Fatal("enqueue failed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	err := shipper.Shutdown(ctx)
	require.NoError(t, err)

	select {
	case payload := <-received:
		require.Len(t, payload.Streams, 1)
		require.Len(t, payload.Streams[0].Values, 1)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for shutdown flush")
	}
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	require.NoError(t, err)
	return string(data)
}

func countLokiValues(payload lokiPushRequest) int {
	total := 0
	for _, stream := range payload.Streams {
		total += len(stream.Values)
	}
	return total
}

func TestLokiLogLineIncludesTraceFieldsWhenPresent(t *testing.T) {
	entry := admin.LogEntry{
		Ts:      time.Unix(1700000000, 0).UTC(),
		Level:   "INFO",
		Msg:     "proxy request",
		Route:   "proxy/media",
		TraceID: "0123456789abcdef0123456789abcdef",
		SpanID:  "fedcba9876543210",
	}
	line := lokiLogLine(entry)
	got := line["trace_id"]
	require.Equal(t, entry.TraceID, got)
	got = line["span_id"]
	require.Equal(t, entry.SpanID, got)
}

func TestLokiLogLineOmitsTraceFieldsWhenAbsent(t *testing.T) {
	entry := admin.LogEntry{
		Ts:    time.Unix(1700000000, 0).UTC(),
		Level: "INFO",
		Msg:   "startup log",
	}
	line := lokiLogLine(entry)
	if _, ok := line["trace_id"]; ok {
		t.Fatalf("trace_id must be omitted when SpanContext is absent")
	}
	if _, ok := line["span_id"]; ok {
		t.Fatalf("span_id must be omitted when SpanContext is absent")
	}
}

func TestLokiStreamLabelsDoNotIncludeTraceID(t *testing.T) {
	cfg := lokiConfig{Env: "preproduction"}
	entry := admin.LogEntry{
		Ts:      time.Unix(1700000000, 0).UTC(),
		Level:   "INFO",
		Msg:     "asr-relay request",
		TraceID: "0123456789abcdef0123456789abcdef",
		SpanID:  "fedcba9876543210",
	}
	payload, err := buildLokiPayload(cfg, []admin.LogEntry{entry})
	require.NoError(t, err)
	require.Len(t, payload.Streams, 1)
	for k := range payload.Streams[0].Stream {
		require.NotEqual(t, "trace_id", k)
		require.NotEqual(t, "span_id", k)
	}
}
