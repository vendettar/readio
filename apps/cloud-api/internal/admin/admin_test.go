package admin

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
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"
)

func TestAdminRingBufferOverflow(t *testing.T) {
	rb := NewAdminRingBuffer(5)
	now := time.Now()
	for i := 0; i < 8; i++ {
		rb.push(LogEntry{
			Ts:    now.Add(time.Duration(i) * time.Second),
			Level: "INFO",
			Msg:   fmt.Sprintf("msg-%d", i),
		})
	}
	snap := rb.Snapshot()
	require.Len(t, snap, 5)
	// oldest kept should be msg-3 (index 3)
	require.Equal(t, "msg-3", snap[0].Msg)
	require.Equal(t, "msg-7", snap[4].Msg)
}

func TestAdminRingBufferConcurrentWrites(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				rb.push(LogEntry{
					Ts:    time.Now(),
					Level: "INFO",
					Msg:   fmt.Sprintf("%d-%d", n, j),
				})
			}
		}(i)
	}
	wg.Wait()
	require.Equal(t, 100, rb.size())
}

func TestAdminLogsFiltering(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	now := time.Now()
	entries := []LogEntry{
		{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media"},
		{Ts: now.Add(1 * time.Second), Level: "ERROR", Msg: "fail", Route: "proxy/media", ErrorClass: "timeout"},
		{Ts: now.Add(2 * time.Second), Level: "INFO", Msg: "ok2", Route: "discovery/top-podcasts"},
		{Ts: now.Add(3 * time.Second), Level: "ERROR", Msg: "fail2", Route: "proxy/media", ErrorClass: "dns"},
	}
	for _, e := range entries {
		rb.push(e)
	}

	h := &Handler{token: "test", buffer: rb, start: time.Now()}

	t.Run("filter by level", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs?level=error", nil)
		req.Header.Set("Authorization", "Bearer test")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		var resp struct {
			Entries []LogEntry `json:"entries"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		require.Len(t, resp.Entries, 2)
	})

	t.Run("filter by route", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs?route=discovery", nil)
		req.Header.Set("Authorization", "Bearer test")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		var resp struct {
			Entries []LogEntry `json:"entries"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		require.Len(t, resp.Entries, 1)
	})

	t.Run("filter by error_class", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs?error_class=timeout", nil)
		req.Header.Set("Authorization", "Bearer test")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		var resp struct {
			Entries []LogEntry `json:"entries"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		require.Len(t, resp.Entries, 1)
	})
}

func TestAdminLogsAuth(t *testing.T) {
	rb := NewAdminRingBuffer(10)
	h := &Handler{token: "secret123", buffer: rb, start: time.Now()}

	t.Run("missing token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		require.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("invalid token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
		req.Header.Set("Authorization", "Bearer wrong")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		require.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("valid token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
		req.Header.Set("Authorization", "Bearer secret123")
		rr := httptest.NewRecorder()
		h.authMiddleware(h.handleAdminLogs)(rr, req)
		require.Equal(t, http.StatusOK, rr.Code)
	})
}

func TestAdminHealth(t *testing.T) {
	rb := NewAdminRingBuffer(10)
	rb.push(LogEntry{Ts: time.Now(), Level: "INFO", Msg: "test"})
	h := &Handler{token: "tok", buffer: rb, start: time.Now().Add(-30 * time.Second)}

	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminHealth)(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	if _, ok := resp["uptime_seconds"]; !ok {
		t.Fatal("missing uptime_seconds")
	}
	v, ok := resp["buffer_size"].(float64)
	require.True(t, ok)
	require.Equal(t, 1, int(v))
	if _, ok := resp["go_version"]; !ok {
		t.Fatal("missing go_version")
	}
}

func TestAdminMetricsSummary(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	now := time.Now()
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10, ErrorClass: "none"})
	rb.push(LogEntry{Ts: now, Level: "ERROR", Msg: "fail", Route: "proxy/media", ElapsedMs: 200, ErrorClass: "timeout"})
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "ok2", Route: "proxy/media", ElapsedMs: 50, ErrorClass: "none"})
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "no_route", ElapsedMs: 5})

	h := &Handler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, ok := resp["by_route"].(map[string]any)
	require.True(t, ok)
	routeEntry, ok := byRoute["proxy/media"]
	require.True(t, ok)
	re := routeEntry.(map[string]any)
	require.Equal(t, 3, int(re["count"].(float64)))
	require.Equal(t, 1, int(re["errors"].(float64)))
}

func TestAdminMetricsSummaryIgnoresErrorClassNone(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	now := time.Now()
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10, ErrorClass: "none"})
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "ok2", Route: "proxy/media", ElapsedMs: 20, ErrorClass: "none"})

	h := &Handler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, ok := resp["by_route"].(map[string]any)
	require.True(t, ok)
	re, ok := byRoute["proxy/media"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, 0, int(re["errors"].(float64)))
	byErrorClass, ok := resp["by_error_class"].(map[string]any)
	require.True(t, ok)
	if _, exists := byErrorClass["none"]; exists {
		t.Fatalf("by_error_class should not contain none: %v", byErrorClass)
	}
}

func TestAdminDisabledWhenTokenEmpty(t *testing.T) {
	t.Setenv(adminTokenEnv, "")

	mux := http.NewServeMux()
	h := SetupAdminHandler(mux)
	require.Nil(t, h)
}

func TestSetupAdminHandlerProtectsRegisteredRoutes(t *testing.T) {
	t.Setenv(adminTokenEnv, "prod-secret")
	oldLogger := slog.Default()
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	mux := http.NewServeMux()
	h := SetupAdminHandler(mux)
	require.NotNil(t, h)

	t.Run("registered route rejects missing auth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		require.Equal(t, http.StatusUnauthorized, rr.Code)
	})

	t.Run("registered route allows valid auth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
		req.Header.Set("Authorization", "Bearer prod-secret")
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
	})
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
		assert.Equal(t, tt.sensitive, got)
	}
}

func TestSensitiveRedactionInAttrs(t *testing.T) {
	rb := NewAdminRingBuffer(10)
	now := time.Now()

	attrs := []slog.Attr{
		slog.String("apiKey", "should-be-hidden"),
		slog.String("safe", "visible"),
		slog.String("workerSharedSecret", "hidden"),
	}
	flat := flattenAttrs(attrs)

	entry := LogEntry{Ts: now, Level: "INFO", Msg: "test", Attrs: flat}
	rb.push(entry)

	snap := rb.Snapshot()
	assert.Equal(t, "[REDACTED]", snap[0].Attrs["apiKey"])
	assert.Equal(t, "visible", snap[0].Attrs["safe"])
	assert.Equal(t, "[REDACTED]", snap[0].Attrs["workerSharedSecret"])
}

func TestLongAttrTruncation(t *testing.T) {
	long := strings.Repeat("x", 600)
	attrs := []slog.Attr{slog.String("data", long)}
	flat := flattenAttrs(attrs)
	assert.Len(t, flat["data"], maxAdminLogAttrValueLen)
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
		assert.Equal(t, tt.want, got)
	}
}

func TestAdminLogsClearRequiresPost(t *testing.T) {
	h := &Handler{token: "tok", buffer: NewAdminRingBuffer(10), start: time.Now()}

	req := httptest.NewRequest(http.MethodDelete, "/admin/logs/clear", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminLogsClear)(rr, req)

	require.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	got := rr.Header().Get("Allow")
	require.Equal(t, http.MethodPost, got)
}

func TestAdminReadRoutesRequireGet(t *testing.T) {
	h := &Handler{token: "tok", buffer: NewAdminRingBuffer(10), start: time.Now()}

	tests := []struct {
		name    string
		path    string
		handler http.HandlerFunc
	}{
		{name: "logs", path: "/admin/logs", handler: h.handleAdminLogs},
		{name: "health", path: "/admin/health", handler: h.handleAdminHealth},
		{name: "metrics", path: "/admin/metrics/summary", handler: h.handleAdminMetricsSummary},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tt.path, nil)
			req.Header.Set("Authorization", "Bearer tok")
			rr := httptest.NewRecorder()
			h.authMiddleware(tt.handler)(rr, req)

			require.Equal(t, http.StatusMethodNotAllowed, rr.Code)
			got := rr.Header().Get("Allow")
			require.Equal(t, http.MethodGet, got)
		})
	}
}

func TestCacheControlNoStore(t *testing.T) {
	rb := NewAdminRingBuffer(10)
	h := &Handler{token: "tok", buffer: rb, start: time.Now()}

	tests := []string{"/admin/logs", "/admin/health", "/admin/metrics/summary"}
	for _, path := range tests {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer tok")
		rr := httptest.NewRecorder()
		h.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))(rr, req)
		cc := rr.Header().Get("Cache-Control")
		require.Equal(t, "no-store", cc)
		p := rr.Header().Get("Pragma")
		require.Equal(t, "no-cache", p)
	}
}

func TestSummaryExcludesAdminRequests(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	now := time.Now()
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "/admin/logs", ElapsedMs: 5})
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "ok", Route: "proxy/media", ElapsedMs: 10})

	h := &Handler{token: "tok", buffer: rb, start: time.Now()}
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
	rb := NewAdminRingBuffer(100)
	now := time.Now()
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "no route"})
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "no elapsed", Route: "proxy/media"})
	rb.push(LogEntry{Ts: now, Level: "INFO", Msg: "valid", Route: "proxy/media", ElapsedMs: 10})

	h := &Handler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/metrics/summary", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminMetricsSummary)(rr, req)

	var resp map[string]any
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	byRoute, _ := resp["by_route"].(map[string]any)
	re, ok := byRoute["proxy/media"].(map[string]any)
	require.True(t, ok)
	// count should be 2 (entries with route)
	require.Equal(t, 2, int(re["count"].(float64)))
}

func TestAdminLogBufferBounds(t *testing.T) {
	assert.Equal(t, 100, minAdminLogBuffer)
	assert.Equal(t, 10000, maxAdminLogBuffer)
}

func TestAdminRingBufferCapacity(t *testing.T) {
	rb := NewAdminRingBuffer(2000)
	require.Equal(t, 2000, rb.cap)
	require.Equal(t, 0, rb.size())
}

func TestSlogHandlerExcludesAdminFromRing(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	inner := slog.Default().Handler()
	h := &AdminSlogHandler{Handler: inner, buffer: rb}

	now := time.Now()
	r := slog.Record{Time: now, Level: slog.LevelInfo, Message: "req"}
	r.AddAttrs(slog.String("route", "/admin/logs"), slog.String("elapsed_ms", "5"))
	_ = h.Handle(context.Background(), r)

	require.Equal(t, 0, rb.size())

	r2 := slog.Record{Time: now, Level: slog.LevelInfo, Message: "req"}
	r2.AddAttrs(slog.String("route", "proxy/media"), slog.String("elapsed_ms", "10"))
	_ = h.Handle(context.Background(), r2)

	require.Equal(t, 1, rb.size())
}

func TestAdminSlogHandlerPromotesCanonicalFields(t *testing.T) {
	rb := NewAdminRingBuffer(10)
	h := &AdminSlogHandler{
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

	err := h.Handle(context.Background(), r)
	require.NoError(t, err)

	snap := rb.Snapshot()
	require.Len(t, snap, 1)
	entry := snap[0]
	require.Equal(t, "proxy/media", entry.Route)
	require.Equal(t, "proxy", entry.UpstreamKind)
	require.Equal(t, "example.com", entry.UpstreamHost)
	require.Equal(t, "none", entry.ErrorClass)
	require.Equal(t, 12.5, entry.ElapsedMs)
	require.Equal(t, 200, entry.Status)
	if _, ok := entry.Attrs["route"]; ok {
		t.Fatal("route should be removed from attrs")
	}
	if _, ok := entry.Attrs["upstream_kind"]; ok {
		t.Fatal("upstream_kind should be removed from attrs")
	}
	if _, ok := entry.Attrs["upstream_host"]; ok {
		t.Fatal("upstream_host should be removed from attrs")
	}
	require.Equal(t, "[REDACTED]", entry.Attrs["secret_token"])
}

func TestFlattenAttrsGroup(t *testing.T) {
	attrs := []slog.Attr{
		slog.Group("http", slog.String("method", "GET"), slog.Int("status", 200)),
	}
	flat := flattenAttrs(attrs)
	assert.Equal(t, "GET", flat["http.method"])
	assert.Equal(t, "200", flat["http.status"])
}

func TestMaxAttrCount(t *testing.T) {
	attrs := make([]slog.Attr, 50)
	for i := range attrs {
		attrs[i] = slog.String(fmt.Sprintf("key%d", i), "val")
	}
	flat := flattenAttrs(attrs)
	assert.Len(t, flat, maxAdminLogAttrs)
}

func TestAdminLogsNewestFirst(t *testing.T) {
	rb := NewAdminRingBuffer(100)
	now := time.Now()
	for i := 0; i < 5; i++ {
		rb.push(LogEntry{
			Ts:    now.Add(time.Duration(i) * time.Second),
			Level: "INFO",
			Msg:   fmt.Sprintf("msg-%d", i),
		})
	}

	h := &Handler{token: "tok", buffer: rb, start: time.Now()}
	req := httptest.NewRequest(http.MethodGet, "/admin/logs", nil)
	req.Header.Set("Authorization", "Bearer tok")
	rr := httptest.NewRecorder()
	h.authMiddleware(h.handleAdminLogs)(rr, req)

	var resp struct {
		Entries []LogEntry `json:"entries"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&resp)

	require.Len(t, resp.Entries, 5)
	if !sort.SliceIsSorted(resp.Entries, func(i, j int) bool { return resp.Entries[i].Ts.After(resp.Entries[j].Ts) }) {
		t.Error("entries not sorted newest first")
	}
}
