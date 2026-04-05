package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestAdminRingBufferOverflow(t *testing.T) {
	rb := newAdminRingBuffer(5)
	now := time.Now()
	for i := 0; i < 8; i++ {
		rb.push(adminLogEntry{
			Ts:    now.Add(time.Duration(i) * time.Second),
			Level: "INFO",
			Msg:   fmt.Sprintf("msg-%d", i),
		})
	}
	snap := rb.snapshot()
	if len(snap) != 5 {
		t.Fatalf("expected 5 entries, got %d", len(snap))
	}
	// oldest kept should be msg-3 (index 3)
	if snap[0].Msg != "msg-3" {
		t.Fatalf("expected oldest msg-3, got %s", snap[0].Msg)
	}
	if snap[4].Msg != "msg-7" {
		t.Fatalf("expected newest msg-7, got %s", snap[4].Msg)
	}
}

func TestAdminRingBufferConcurrentWrites(t *testing.T) {
	rb := newAdminRingBuffer(100)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				rb.push(adminLogEntry{
					Ts:    time.Now(),
					Level: "INFO",
					Msg:   fmt.Sprintf("%d-%d", n, j),
				})
			}
		}(i)
	}
	wg.Wait()
	if rb.size() != 100 {
		t.Fatalf("expected 100, got %d", rb.size())
	}
}

func TestAdminLogsFiltering(t *testing.T) {
	rb := newAdminRingBuffer(100)
	now := time.Now()
	entries := []adminLogEntry{
		{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media"},
		{Ts: now.Add(1 * time.Second), Level: "ERROR", Msg: "fail", Route: "proxy/media", ErrorClass: "timeout"},
		{Ts: now.Add(2 * time.Second), Level: "INFO", Msg: "ok2", Route: "discovery/top-podcasts"},
		{Ts: now.Add(3 * time.Second), Level: "ERROR", Msg: "fail2", Route: "proxy/media", ErrorClass: "dns"},
	}
	for _, e := range entries {
		rb.push(e)
	}

	h := &adminHandler{token: "test", buffer: rb, start: time.Now()}

	t.Run("filter by level", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs?level=error", nil)
		req.Header.Set("Authorization", "Bearer test")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		var resp struct {
			Entries []adminLogEntry `json:"entries"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		if len(resp.Entries) != 2 {
			t.Fatalf("expected 2 errors, got %d", len(resp.Entries))
		}
	})

	t.Run("filter by route", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs?route=discovery", nil)
		req.Header.Set("Authorization", "Bearer test")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		var resp struct {
			Entries []adminLogEntry `json:"entries"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		if len(resp.Entries) != 1 {
			t.Fatalf("expected 1, got %d", len(resp.Entries))
		}
	})

	t.Run("filter by error_class", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs?error_class=timeout", nil)
		req.Header.Set("Authorization", "Bearer test")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		var resp struct {
			Entries []adminLogEntry `json:"entries"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		if len(resp.Entries) != 1 {
			t.Fatalf("expected 1, got %d", len(resp.Entries))
		}
	})
}

func TestAdminLogsAuth(t *testing.T) {
	rb := newAdminRingBuffer(10)
	h := &adminHandler{token: "secret123", buffer: rb, start: time.Now()}

	t.Run("missing token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rr.Code)
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
		req.Header.Set("Authorization", "Bearer wrong")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rr.Code)
		}
	})

	t.Run("valid token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
		req.Header.Set("Authorization", "Bearer secret123")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}
	})
}

func TestAdminHealth(t *testing.T) {
	rb := newAdminRingBuffer(10)
	rb.push(adminLogEntry{Ts: time.Now(), Level: "INFO", Msg: "test"})
	h := &adminHandler{token: "tok", buffer: rb, start: time.Now().Add(-30 * time.Second)}

	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminHealth)(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	if _, ok := resp["uptime_seconds"]; !ok {
		t.Fatal("missing uptime_seconds")
	}
	if v, ok := resp["buffer_size"].(float64); !ok || int(v) != 1 {
		t.Fatalf("buffer_size = %v, want 1", resp["buffer_size"])
	}
	if _, ok := resp["go_version"]; !ok {
		t.Fatal("missing go_version")
	}
}

func TestAdminMetricsSummary(t *testing.T) {
	rb := newAdminRingBuffer(100)
	now := time.Now()
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10, ErrorClass: "none"})
	rb.push(adminLogEntry{Ts: now, Level: "ERROR", Msg: "fail", Route: "proxy/media", ElapsedMs: 200, ErrorClass: "timeout"})
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok2", Route: "proxy/media", ElapsedMs: 50, ErrorClass: "none"})
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "no_route", ElapsedMs: 5})

	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, ok := resp["by_route"].(map[string]any)
	if !ok {
		t.Fatalf("by_route not a map, got %T", resp["by_route"])
	}
	routeEntry, ok := byRoute["proxy/media"]
	if !ok {
		t.Fatalf("expected proxy/media in by_route, got keys: %v", byRoute)
	}
	re := routeEntry.(map[string]any)
	if int(re["count"].(float64)) != 3 {
		t.Fatalf("count = %v", re["count"])
	}
	if int(re["errors"].(float64)) != 1 {
		t.Fatalf("errors = %v", re["errors"])
	}
}

func TestAdminMetricsSummaryIgnoresErrorClassNone(t *testing.T) {
	rb := newAdminRingBuffer(100)
	now := time.Now()
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10, ErrorClass: "none"})
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok2", Route: "proxy/media", ElapsedMs: 20, ErrorClass: "none"})

	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, ok := resp["by_route"].(map[string]any)
	if !ok {
		t.Fatalf("by_route not a map, got %T", resp["by_route"])
	}
	re, ok := byRoute["proxy/media"].(map[string]any)
	if !ok {
		t.Fatalf("expected proxy/media in by_route")
	}
	if int(re["errors"].(float64)) != 0 {
		t.Fatalf("errors = %v, want 0", re["errors"])
	}
	byErrorClass, ok := resp["by_error_class"].(map[string]any)
	if !ok {
		t.Fatalf("by_error_class not a map, got %T", resp["by_error_class"])
	}
	if _, exists := byErrorClass["none"]; exists {
		t.Fatalf("by_error_class should not contain none: %v", byErrorClass)
	}
}

func TestAdminDisabledWhenTokenEmpty(t *testing.T) {
	t.Setenv(adminTokenEnv, "")

	mux := http.NewServeMux()
	h := setupAdminHandler(mux)
	if h != nil {
		t.Fatal("expected nil when token empty")
	}
}

func TestSensitiveKeyRedaction(t *testing.T) {
	tests := []struct {
		key       string
		sensitive bool
	}{
		{"Authorization", true},
		{"authorization", true},
		{"apiKey", true},
		{"api_key", true},
		{"token", true},
		{"workerSharedSecret", true},
		{"xReadioCloudSecret", true},
		{"x-readio-cloud-secret", true},
		{"x_readio_relay_public_token", true},
		{"cookie", true},
		{"set-cookie", true},
		{"secret_key", true},
		{"my_secret_value", true},
		{"safe_key", false},
		{"name", false},
	}
	for _, tt := range tests {
		got := isSensitiveKey(tt.key)
		if got != tt.sensitive {
			t.Errorf("isSensitiveKey(%q) = %v, want %v", tt.key, got, tt.sensitive)
		}
	}
}

func TestSensitiveRedactionInAttrs(t *testing.T) {
	rb := newAdminRingBuffer(10)
	now := time.Now()

	attrs := []slog.Attr{
		slog.String("apiKey", "should-be-hidden"),
		slog.String("safe", "visible"),
		slog.String("workerSharedSecret", "hidden"),
	}
	flat := flattenAttrs(attrs)

	entry := adminLogEntry{Ts: now, Level: "INFO", Msg: "test", Attrs: flat}
	rb.push(entry)

	snap := rb.snapshot()
	if snap[0].Attrs["apiKey"] != "[REDACTED]" {
		t.Errorf("apiKey not redacted: %q", snap[0].Attrs["apiKey"])
	}
	if snap[0].Attrs["safe"] != "visible" {
		t.Errorf("safe should not be redacted: %q", snap[0].Attrs["safe"])
	}
	if snap[0].Attrs["workerSharedSecret"] != "[REDACTED]" {
		t.Errorf("workerSharedSecret not redacted: %q", snap[0].Attrs["workerSharedSecret"])
	}
}

func TestLongAttrTruncation(t *testing.T) {
	long := strings.Repeat("x", 600)
	attrs := []slog.Attr{slog.String("data", long)}
	flat := flattenAttrs(attrs)
	if len(flat["data"]) != maxAdminLogAttrValueLen {
		t.Errorf("expected truncated to %d, got %d", maxAdminLogAttrValueLen, len(flat["data"]))
	}
}

func TestInvalidLogBufferFallback(t *testing.T) {
	tests := []struct {
		env  string
		want int
	}{
		{"", defaultAdminLogBuffer},
		{"abc", defaultAdminLogBuffer},
		{"50", defaultAdminLogBuffer},
		{"200000", defaultAdminLogBuffer},
		{"500", 500},
		{"2000", 2000},
		{"10000", 10000},
	}
	for _, tt := range tests {
		t.Setenv(adminLogBufferEnv, tt.env)
		got := resolveAdminLogBuffer()
		if got != tt.want {
			t.Errorf("resolveAdminLogBuffer(%q) = %d, want %d", tt.env, got, tt.want)
		}
	}
}

func TestCacheControlNoStore(t *testing.T) {
	rb := newAdminRingBuffer(10)
	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}

	tests := []string{"/admin/logs", "/admin/health", "/admin/metrics/summary"}
	for _, path := range tests {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer tok")
		rr := httptest.NewRecorder()
		h.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))(rr, req)
		if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
			t.Errorf("%s: Cache-Control = %q, want no-store", path, cc)
		}
		if p := rr.Header().Get("Pragma"); p != "no-cache" {
			t.Errorf("%s: Pragma = %q, want no-cache", path, p)
		}
	}
}

func TestSummaryExcludesAdminRequests(t *testing.T) {
	rb := newAdminRingBuffer(100)
	now := time.Now()
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "/admin/logs", ElapsedMs: 5})
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10})

	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, _ := resp["by_route"].(map[string]any)
	for route := range byRoute {
		if strings.HasPrefix(route, "/admin/") {
			t.Errorf("admin route %q should not appear in summary", route)
		}
	}
}

func TestSummaryExcludesMissingCanonicalFields(t *testing.T) {
	rb := newAdminRingBuffer(100)
	now := time.Now()
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "no route"})
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "no elapsed", Route: "proxy/media"})
	rb.push(adminLogEntry{Ts: now, Level: "INFO", Msg: "valid", Route: "proxy/media", ElapsedMs: 10})

	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, _ := resp["by_route"].(map[string]any)
	re, ok := byRoute["proxy/media"].(map[string]any)
	if !ok {
		t.Fatalf("expected proxy/media in by_route")
	}
	// count should be 2 (entries with route)
	if int(re["count"].(float64)) != 2 {
		t.Fatalf("count = %v, want 2", re["count"])
	}
}

func TestAdminLogBufferBounds(t *testing.T) {
	if minAdminLogBuffer != 100 {
		t.Errorf("minAdminLogBuffer = %d, want 100", minAdminLogBuffer)
	}
	if maxAdminLogBuffer != 10000 {
		t.Errorf("maxAdminLogBuffer = %d, want 10000", maxAdminLogBuffer)
	}
}

func TestAdminRingBufferCapacity(t *testing.T) {
	rb := newAdminRingBuffer(2000)
	if rb.cap != 2000 {
		t.Fatalf("cap = %d, want 2000", rb.cap)
	}
	if rb.size() != 0 {
		t.Fatalf("initial size = %d, want 0", rb.size())
	}
}

func TestSlogHandlerExcludesAdminFromRing(t *testing.T) {
	rb := newAdminRingBuffer(100)
	inner := slog.Default().Handler()
	h := &adminSlogHandler{Handler: inner, buffer: rb}

	now := time.Now()
	r := slog.Record{Time: now, Level: slog.LevelInfo, Message: "req"}
	r.AddAttrs(slog.String("route", "/admin/logs"), slog.String("elapsed_ms", "5"))
	_ = h.Handle(context.Background(), r)

	if rb.size() != 0 {
		t.Fatalf("admin request should not be in ring buffer, size=%d", rb.size())
	}

	r2 := slog.Record{Time: now, Level: slog.LevelInfo, Message: "req"}
	r2.AddAttrs(slog.String("route", "proxy/media"), slog.String("elapsed_ms", "10"))
	_ = h.Handle(context.Background(), r2)

	if rb.size() != 1 {
		t.Fatalf("non-admin request should be in ring buffer, size=%d", rb.size())
	}
}

func TestAdminSlogHandlerPromotesCanonicalFields(t *testing.T) {
	rb := newAdminRingBuffer(10)
	h := &adminSlogHandler{
		Handler: slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}),
		buffer:  rb,
	}

	now := time.Now()
	r := slog.Record{Time: now, Level: slog.LevelInfo, Message: "request"}
	r.AddAttrs(
		slog.String("route", "proxy/media"),
		slog.String("upstream_kind", "proxy"),
		slog.String("upstream_host", "example.com"),
		slog.String("error_class", "none"),
		slog.String("elapsed_ms", "12.5"),
		slog.String("status", "200"),
		slog.String("secret_token", "should-not-leak"),
	)

	if err := h.Handle(context.Background(), r); err != nil {
		t.Fatalf("handle record: %v", err)
	}

	snap := rb.snapshot()
	if len(snap) != 1 {
		t.Fatalf("snapshot len = %d, want 1", len(snap))
	}
	entry := snap[0]
	if entry.Route != "proxy/media" {
		t.Fatalf("route = %q, want %q", entry.Route, "proxy/media")
	}
	if entry.UpstreamKind != "proxy" {
		t.Fatalf("upstream_kind = %q, want %q", entry.UpstreamKind, "proxy")
	}
	if entry.UpstreamHost != "example.com" {
		t.Fatalf("upstream_host = %q, want %q", entry.UpstreamHost, "example.com")
	}
	if entry.ErrorClass != "none" {
		t.Fatalf("error_class = %q, want %q", entry.ErrorClass, "none")
	}
	if entry.ElapsedMs != 12.5 {
		t.Fatalf("elapsed_ms = %v, want 12.5", entry.ElapsedMs)
	}
	if entry.Status != 200 {
		t.Fatalf("status = %d, want 200", entry.Status)
	}
	if _, ok := entry.Attrs["route"]; ok {
		t.Fatal("route should be removed from attrs")
	}
	if _, ok := entry.Attrs["upstream_kind"]; ok {
		t.Fatal("upstream_kind should be removed from attrs")
	}
	if _, ok := entry.Attrs["upstream_host"]; ok {
		t.Fatal("upstream_host should be removed from attrs")
	}
	if entry.Attrs["secret_token"] != "[REDACTED]" {
		t.Fatalf("secret_token = %q, want redacted", entry.Attrs["secret_token"])
	}
}

func TestFlattenAttrsGroup(t *testing.T) {
	attrs := []slog.Attr{
		slog.Group("http", slog.String("method", "GET"), slog.Int("status", 200)),
	}
	flat := flattenAttrs(attrs)
	if flat["http.method"] != "GET" {
		t.Errorf("http.method = %q, want GET", flat["http.method"])
	}
	if flat["http.status"] != "200" {
		t.Errorf("http.status = %q, want 200", flat["http.status"])
	}
}

func TestMaxAttrCount(t *testing.T) {
	attrs := make([]slog.Attr, 50)
	for i := range attrs {
		attrs[i] = slog.String(fmt.Sprintf("key%d", i), "val")
	}
	flat := flattenAttrs(attrs)
	if len(flat) != maxAdminLogAttrs {
		t.Errorf("expected %d attrs, got %d", maxAdminLogAttrs, len(flat))
	}
}

func TestAdminLogsNewestFirst(t *testing.T) {
	rb := newAdminRingBuffer(100)
	now := time.Now()
	for i := 0; i < 5; i++ {
		rb.push(adminLogEntry{
			Ts:    now.Add(time.Duration(i) * time.Second),
			Level: "INFO",
			Msg:   fmt.Sprintf("msg-%d", i),
		})
	}

	h := &adminHandler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminLogs)(rr, req)

	var resp struct {
		Entries []adminLogEntry `json:"entries"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	if len(resp.Entries) != 5 {
		t.Fatalf("expected 5, got %d", len(resp.Entries))
	}
	if !sort.SliceIsSorted(resp.Entries, func(i, j int) bool { return resp.Entries[i].Ts.After(resp.Entries[j].Ts) }) {
		t.Error("entries not sorted newest first")
	}
}
