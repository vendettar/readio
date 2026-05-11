package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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
			if cfg.Enabled {
				t.Fatalf("Enabled = true, want false")
			}
		})
	}
}

func TestLokiPayloadFormatAuthLabelsAndRedaction(t *testing.T) {
	var gotAuth string
	var payload lokiPushRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/loki/api/v1/push" {
			t.Fatalf("path = %q, want /loki/api/v1/push", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
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

	entry := adminLogEntry{
		Ts:         time.Unix(1700000000, 123).UTC(),
		Level:      "INFO",
		Msg:        "proxy request",
		Route:      "proxy/media",
		ElapsedMs:  42,
		ErrorClass: "none",
		Status:     http.StatusOK,
		Attrs: map[string]string{
			"apiKey":  "[REDACTED]",
			"referer": "https://evil.example/player?token=secret",
		},
	}
	if !shipper.Enqueue(entry) {
		t.Fatal("enqueue returned false")
	}
	if err := shipper.Flush(context.Background()); err != nil {
		t.Fatalf("flush: %v", err)
	}

	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("instance-id:secret-token"))
	if gotAuth != wantAuth {
		t.Fatalf("Authorization = %q, want Basic auth", gotAuth)
	}
	if strings.Contains(mustJSON(t, payload), "secret-token") {
		t.Fatal("payload leaked basic auth token")
	}
	if len(payload.Streams) != 1 {
		t.Fatalf("streams len = %d, want 1", len(payload.Streams))
	}
	stream := payload.Streams[0]
	wantLabels := map[string]string{
		"service": "readio-cloud",
		"env":     "preproduction",
		"level":   "info",
	}
	if mustJSON(t, stream.Stream) != mustJSON(t, wantLabels) {
		t.Fatalf("labels = %v, want %v", stream.Stream, wantLabels)
	}
	if len(stream.Values) != 1 {
		t.Fatalf("values len = %d, want 1", len(stream.Values))
	}

	var line map[string]any
	if err := json.Unmarshal([]byte(stream.Values[0][1]), &line); err != nil {
		t.Fatalf("decode log line: %v", err)
	}
	if line["msg"] != "proxy request" {
		t.Fatalf("msg = %v, want proxy request", line["msg"])
	}
	if line["route"] != "proxy/media" {
		t.Fatalf("route = %v, want proxy/media", line["route"])
	}
	if _, ok := line["apiKey"]; ok {
		t.Fatal("sensitive attr should not be shipped as raw log field")
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

	entry := adminLogEntry{Ts: time.Now(), Level: "INFO", Msg: "one"}
	if !shipper.Enqueue(entry) {
		t.Fatal("first enqueue failed")
	}

	start := time.Now()
	if shipper.Enqueue(entry) {
		t.Fatal("second enqueue succeeded, want drop")
	}
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("full queue enqueue blocked for %v", elapsed)
	}
	if shipper.Dropped() != 1 {
		t.Fatalf("dropped = %d, want 1", shipper.Dropped())
	}
}

func TestLokiConfiguredBatchSizeLimitsFlushBatch(t *testing.T) {
	received := make(chan lokiPushRequest, 3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload lokiPushRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
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
		if !shipper.Enqueue(adminLogEntry{Ts: time.Now(), Level: "INFO", Msg: "queued"}) {
			t.Fatalf("enqueue %d failed", i)
		}
	}
	if err := shipper.Flush(context.Background()); err != nil {
		t.Fatalf("flush: %v", err)
	}

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
	if total != 5 {
		t.Fatalf("flushed values = %d, want 5", total)
	}
	select {
	case payload := <-received:
		t.Fatalf("unexpected extra flush request: %#v", payload)
	default:
	}
}

func TestResolveLokiEnvUsesDeployEnvBeforeFaroEnv(t *testing.T) {
	t.Setenv(deployEnvEnv, "preprod")
	t.Setenv("VITE_GRAFANA_FARO_ENV", "production")

	if got := resolveLokiEnv(); got != "preproduction" {
		t.Fatalf("env = %q, want preproduction", got)
	}
}

func TestResolveLokiEnvFallsBackToFaroEnv(t *testing.T) {
	t.Setenv(deployEnvEnv, "")
	t.Setenv("VITE_GRAFANA_FARO_ENV", "prod")

	if got := resolveLokiEnv(); got != "production" {
		t.Fatalf("env = %q, want production", got)
	}
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

	rb := newAdminRingBuffer(10)
	handler := &adminSlogHandler{
		Handler:     slog.NewTextHandler(io.Discard, nil),
		buffer:      rb,
		lokiShipper: shipper,
	}
	record := slog.Record{Time: time.Now(), Level: slog.LevelInfo, Message: "request"}
	record.AddAttrs(slog.String("route", "proxy/media"))

	if err := handler.Handle(context.Background(), record); err != nil {
		t.Fatalf("handle returned error: %v", err)
	}
}

func TestLokiShutdownFlushesQueuedLogsBestEffort(t *testing.T) {
	received := make(chan lokiPushRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload lokiPushRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
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

	if !shipper.Enqueue(adminLogEntry{Ts: time.Now(), Level: "ERROR", Msg: "queued"}) {
		t.Fatal("enqueue failed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := shipper.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}

	select {
	case payload := <-received:
		if len(payload.Streams) != 1 || len(payload.Streams[0].Values) != 1 {
			t.Fatalf("payload = %#v, want one queued log", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for shutdown flush")
	}
}

func TestAdminSlogHandlerQueuesRedactedEntryForLoki(t *testing.T) {
	shipper := &capturingLokiShipper{}
	rb := newAdminRingBuffer(10)
	handler := &adminSlogHandler{
		Handler:     slog.NewTextHandler(io.Discard, nil),
		buffer:      rb,
		lokiShipper: shipper,
	}
	record := slog.Record{Time: time.Now(), Level: slog.LevelInfo, Message: "request"}
	record.AddAttrs(
		slog.String("route", "proxy/media"),
		slog.String("authorization", "Bearer raw-secret"),
		slog.String("safe", "visible"),
	)

	if err := handler.Handle(context.Background(), record); err != nil {
		t.Fatalf("handle: %v", err)
	}
	if len(shipper.entries) != 1 {
		t.Fatalf("queued entries = %d, want 1", len(shipper.entries))
	}
	entry := shipper.entries[0]
	if entry.Attrs["authorization"] != "[REDACTED]" {
		t.Fatalf("authorization = %q, want redacted", entry.Attrs["authorization"])
	}
	if entry.Attrs["safe"] != "visible" {
		t.Fatalf("safe = %q, want visible", entry.Attrs["safe"])
	}
}

func TestAdminSlogHandlerDerivedLoggersStillFanOut(t *testing.T) {
	tests := []struct {
		name      string
		newLogger func(*slog.Logger) *slog.Logger
		wantRoute string
		wantAttr  string
	}{
		{
			name: "with attrs",
			newLogger: func(logger *slog.Logger) *slog.Logger {
				return logger.With("component", "x")
			},
			wantRoute: "proxy/media",
		},
		{
			name: "with group",
			newLogger: func(logger *slog.Logger) *slog.Logger {
				return logger.WithGroup("component")
			},
			wantAttr: "component.route",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			shipper := &capturingLokiShipper{}
			rb := newAdminRingBuffer(10)
			handler := &adminSlogHandler{
				Handler:     slog.NewTextHandler(io.Discard, nil),
				buffer:      rb,
				lokiShipper: shipper,
			}
			logger := tc.newLogger(slog.New(handler))

			logger.Info("request", "route", "proxy/media", "status", http.StatusOK)

			snap := rb.snapshot()
			if len(snap) != 1 {
				t.Fatalf("admin ring entries = %d, want 1", len(snap))
			}
			if tc.wantRoute != "" && snap[0].Route != tc.wantRoute {
				t.Fatalf("admin route = %q, want %q", snap[0].Route, tc.wantRoute)
			}
			if tc.wantAttr != "" && snap[0].Attrs[tc.wantAttr] != "proxy/media" {
				t.Fatalf("admin attr %q = %q, want proxy/media", tc.wantAttr, snap[0].Attrs[tc.wantAttr])
			}
			if len(shipper.entries) != 1 {
				t.Fatalf("loki queued entries = %d, want 1", len(shipper.entries))
			}
			if tc.wantRoute != "" && shipper.entries[0].Route != tc.wantRoute {
				t.Fatalf("loki route = %q, want %q", shipper.entries[0].Route, tc.wantRoute)
			}
			if tc.wantAttr != "" && shipper.entries[0].Attrs[tc.wantAttr] != "proxy/media" {
				t.Fatalf("loki attr %q = %q, want proxy/media", tc.wantAttr, shipper.entries[0].Attrs[tc.wantAttr])
			}
		})
	}
}

func TestAdminSlogHandlerDerivedRoutePromotesToAdminAndLoki(t *testing.T) {
	shipper, rb, logger := newDerivedFanoutTestLogger()

	logger.With("route", "proxy/media").Info("request")

	snap := rb.snapshot()
	if len(snap) != 1 {
		t.Fatalf("admin ring entries = %d, want 1", len(snap))
	}
	if snap[0].Route != "proxy/media" {
		t.Fatalf("admin route = %q, want proxy/media", snap[0].Route)
	}
	if len(shipper.entries) != 1 {
		t.Fatalf("loki queued entries = %d, want 1", len(shipper.entries))
	}
	if shipper.entries[0].Route != "proxy/media" {
		t.Fatalf("loki route = %q, want proxy/media", shipper.entries[0].Route)
	}
}

func TestAdminSlogHandlerDerivedSensitiveAttrsRedacted(t *testing.T) {
	shipper, rb, logger := newDerivedFanoutTestLogger()

	logger.With("authorization", "Bearer raw-secret").Info("request", "route", "proxy/media")

	snap := rb.snapshot()
	if len(snap) != 1 {
		t.Fatalf("admin ring entries = %d, want 1", len(snap))
	}
	if snap[0].Attrs["authorization"] != "[REDACTED]" {
		t.Fatalf("admin authorization = %q, want redacted", snap[0].Attrs["authorization"])
	}
	if len(shipper.entries) != 1 {
		t.Fatalf("loki queued entries = %d, want 1", len(shipper.entries))
	}
	if shipper.entries[0].Attrs["authorization"] != "[REDACTED]" {
		t.Fatalf("loki authorization = %q, want redacted", shipper.entries[0].Attrs["authorization"])
	}
}

func TestAdminSlogHandlerDerivedGroupedAttrsFlattened(t *testing.T) {
	shipper, rb, logger := newDerivedFanoutTestLogger()

	logger.WithGroup("http").With("status", http.StatusOK).Info("request", "route", "proxy/media")

	snap := rb.snapshot()
	if len(snap) != 1 {
		t.Fatalf("admin ring entries = %d, want 1", len(snap))
	}
	if snap[0].Attrs["http.status"] != "200" {
		t.Fatalf("admin http.status = %q, want 200", snap[0].Attrs["http.status"])
	}
	if snap[0].Attrs["http.route"] != "proxy/media" {
		t.Fatalf("admin http.route = %q, want proxy/media", snap[0].Attrs["http.route"])
	}
	if snap[0].Route != "" {
		t.Fatalf("admin grouped route promoted = %q, want empty", snap[0].Route)
	}
	if len(shipper.entries) != 1 {
		t.Fatalf("loki queued entries = %d, want 1", len(shipper.entries))
	}
	if shipper.entries[0].Attrs["http.status"] != "200" {
		t.Fatalf("loki http.status = %q, want 200", shipper.entries[0].Attrs["http.status"])
	}
	if shipper.entries[0].Attrs["http.route"] != "proxy/media" {
		t.Fatalf("loki http.route = %q, want proxy/media", shipper.entries[0].Attrs["http.route"])
	}
	if shipper.entries[0].Route != "" {
		t.Fatalf("loki grouped route promoted = %q, want empty", shipper.entries[0].Route)
	}
}

type capturingLokiShipper struct {
	entries []adminLogEntry
}

func newDerivedFanoutTestLogger() (*capturingLokiShipper, *adminRingBuffer, *slog.Logger) {
	shipper := &capturingLokiShipper{}
	rb := newAdminRingBuffer(10)
	handler := &adminSlogHandler{
		Handler:     slog.NewTextHandler(io.Discard, nil),
		buffer:      rb,
		lokiShipper: shipper,
	}
	return shipper, rb, slog.New(handler)
}

func (s *capturingLokiShipper) Enqueue(entry adminLogEntry) bool {
	s.entries = append(s.entries, entry)
	return true
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
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
	entry := adminLogEntry{
		Ts:      time.Unix(1700000000, 0).UTC(),
		Level:   "INFO",
		Msg:     "proxy request",
		Route:   "proxy/media",
		TraceID: "0123456789abcdef0123456789abcdef",
		SpanID:  "fedcba9876543210",
	}
	line := lokiLogLine(entry)
	if got := line["trace_id"]; got != entry.TraceID {
		t.Fatalf("trace_id = %v want %s", got, entry.TraceID)
	}
	if got := line["span_id"]; got != entry.SpanID {
		t.Fatalf("span_id = %v want %s", got, entry.SpanID)
	}
}

func TestLokiLogLineOmitsTraceFieldsWhenAbsent(t *testing.T) {
	entry := adminLogEntry{
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
	entry := adminLogEntry{
		Ts:      time.Unix(1700000000, 0).UTC(),
		Level:   "INFO",
		Msg:     "asr-relay request",
		TraceID: "0123456789abcdef0123456789abcdef",
		SpanID:  "fedcba9876543210",
	}
	payload, err := buildLokiPayload(cfg, []adminLogEntry{entry})
	if err != nil {
		t.Fatalf("buildLokiPayload: %v", err)
	}
	if len(payload.Streams) != 1 {
		t.Fatalf("streams len = %d want 1", len(payload.Streams))
	}
	for k := range payload.Streams[0].Stream {
		if k == "trace_id" || k == "span_id" {
			t.Fatalf("%s must not be promoted to a Loki stream label", k)
		}
	}
}
