package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"os"
	"runtime"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const adminTokenEnv = "READIO_ADMIN_TOKEN"
const adminLogBufferEnv = "READIO_ADMIN_LOG_BUFFER"
const defaultAdminLogBuffer = 2000
const minAdminLogBuffer = 100
const maxAdminLogBuffer = 10000
const maxAdminLogAttrs = 32
const maxAdminLogAttrValueLen = 512
const adminDefaultLimit = 200
const adminMaxLimit = 500
const p95Quantile = 0.95

type adminLogEntry struct {
	Ts           time.Time         `json:"ts"`
	Level        string            `json:"level"`
	Msg          string            `json:"msg"`
	Route        string            `json:"route,omitempty"`
	UpstreamKind string            `json:"upstream_kind,omitempty"`
	UpstreamHost string            `json:"upstream_host,omitempty"`
	ElapsedMs    float64           `json:"elapsed_ms,omitempty"`
	ErrorClass   string            `json:"error_class,omitempty"`
	Status       int               `json:"status,omitempty"`
	Attrs        map[string]string `json:"attrs,omitempty"`
}

type adminRingBuffer struct {
	mu      sync.RWMutex
	entries []adminLogEntry
	cap     int
	pos     int
	count   int
}

func newAdminRingBuffer(capacity int) *adminRingBuffer {
	return &adminRingBuffer{
		entries: make([]adminLogEntry, capacity),
		cap:     capacity,
	}
}

func (rb *adminRingBuffer) push(entry adminLogEntry) {
	rb.mu.Lock()
	rb.entries[rb.pos] = entry
	rb.pos = (rb.pos + 1) % rb.cap
	rb.count++
	rb.mu.Unlock()
}

func (rb *adminRingBuffer) snapshot() []adminLogEntry {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	var out []adminLogEntry
	if rb.count < rb.cap {
		out = make([]adminLogEntry, rb.count)
		copy(out, rb.entries[:rb.count])
	} else {
		out = make([]adminLogEntry, rb.cap)
		copy(out, rb.entries[rb.pos:])
		copy(out[rb.cap-rb.pos:], rb.entries[:rb.pos])
	}
	return out
}

func (rb *adminRingBuffer) size() int {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	if rb.count < rb.cap {
		return rb.count
	}
	return rb.cap
}

var sensitivePatterns = []string{
	"authorization",
	"apikey",
	"token",
	"secret",
	"cookie",
	"setcookie",
	"xreadiocloudsecret",
	"xreadiorelaypublictoken",
}

func normalizeSensitiveKey(key string) string {
	var b strings.Builder
	b.Grow(len(key))
	upper := false
	for _, r := range key {
		if r == '-' || r == '_' {
			upper = true
			continue
		}
		if r >= 'A' && r <= 'Z' {
			b.WriteByte(byte(r) + ('a' - 'A'))
			upper = false
			continue
		}
		if upper && r >= 'a' && r <= 'z' {
			b.WriteRune(r)
			upper = false
			continue
		}
		upper = false
		b.WriteRune(r)
	}
	return b.String()
}

func isSensitiveKey(key string) bool {
	normalized := normalizeSensitiveKey(key)
	for _, p := range sensitivePatterns {
		if strings.Contains(normalized, p) {
			return true
		}
	}
	return false
}

func flattenAttrs(attrs []slog.Attr) map[string]string {
	flat := make(map[string]string, len(attrs))
	flattenAttrsRecursive("", attrs, flat)
	return flat
}

func flattenAttrsRecursive(prefix string, attrs []slog.Attr, out map[string]string) {
	if len(out) >= maxAdminLogAttrs {
		return
	}
	for _, a := range attrs {
		if len(out) >= maxAdminLogAttrs {
			return
		}
		key := a.Key
		if prefix != "" {
			key = prefix + "." + key
		}
		if a.Value.Kind() == slog.KindGroup {
			flattenAttrsRecursive(key, a.Value.Group(), out)
			continue
		}
		val := a.Value.String()
		if isSensitiveKey(a.Key) || isSensitiveKey(key) {
			val = "[REDACTED]"
		} else if len(val) > maxAdminLogAttrValueLen {
			val = val[:maxAdminLogAttrValueLen]
		}
		out[key] = val
	}
}

type adminSlogHandler struct {
	slog.Handler
	buffer *adminRingBuffer
}

func (h *adminSlogHandler) Handle(ctx context.Context, r slog.Record) error {
	flat := flattenRecordAttrs(r)
	entry := adminLogEntry{
		Ts:    r.Time,
		Level: r.Level.String(),
		Msg:   r.Message,
		Attrs: flat,
	}

	// Promote canonical fields to top-level, remove from attrs.
	if route, ok := flat["route"]; ok {
		entry.Route = route
		delete(flat, "route")
		if strings.HasPrefix(route, "/admin/") {
			return h.Handler.Handle(ctx, r)
		}
	}
	if ec, ok := flat["error_class"]; ok {
		entry.ErrorClass = ec
		delete(flat, "error_class")
	}
	if uk, ok := flat["upstream_kind"]; ok {
		entry.UpstreamKind = uk
		delete(flat, "upstream_kind")
	}
	if uh, ok := flat["upstream_host"]; ok {
		entry.UpstreamHost = uh
		delete(flat, "upstream_host")
	}
	if ems, ok := flat["elapsed_ms"]; ok {
		if v, err := strconv.ParseFloat(ems, 64); err == nil {
			entry.ElapsedMs = v
		}
		delete(flat, "elapsed_ms")
	}
	if st, ok := flat["status"]; ok {
		if v, err := strconv.Atoi(st); err == nil {
			entry.Status = v
		}
		delete(flat, "status")
	}

	if len(flat) == 0 {
		entry.Attrs = nil
	}

	h.buffer.push(entry)
	return h.Handler.Handle(ctx, r)
}

func flattenRecordAttrs(r slog.Record) map[string]string {
	attrs := make([]slog.Attr, 0)
	r.Attrs(func(a slog.Attr) bool {
		attrs = append(attrs, a)
		return true
	})
	if len(attrs) == 0 {
		return nil
	}
	flat := make(map[string]string, minInt(len(attrs), maxAdminLogAttrs))
	flattenAttrsRecursive("", attrs, flat)
	if len(flat) == 0 {
		return nil
	}
	return flat
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func resolveAdminLogBuffer() int {
	raw := strings.TrimSpace(os.Getenv(adminLogBufferEnv))
	if raw == "" {
		return defaultAdminLogBuffer
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < minAdminLogBuffer || v > maxAdminLogBuffer {
		return defaultAdminLogBuffer
	}
	return v
}

type adminHandler struct {
	token  string
	buffer *adminRingBuffer
	start  time.Time
}

func setupAdminHandler(mux *http.ServeMux) *adminHandler {
	token := strings.TrimSpace(os.Getenv(adminTokenEnv))
	if token == "" {
		// Register 404 handlers so /admin/* doesn't fall through to SPA fallback.
		mux.HandleFunc("/admin/", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
			http.NotFound(w, nil)
		})
		return nil
	}

	capacity := resolveAdminLogBuffer()
	buffer := newAdminRingBuffer(capacity)

	handler := &adminSlogHandler{
		Handler: slog.Default().Handler(),
		buffer:  buffer,
	}
	slog.SetDefault(slog.New(handler))

	h := &adminHandler{
		token:  token,
		buffer: buffer,
		start:  time.Now(),
	}

	mux.HandleFunc("/admin/logs", h.handleAdminLogs)
	mux.HandleFunc("/admin/health", h.handleAdminHealth)
	mux.HandleFunc("/admin/metrics/summary", h.handleAdminMetricsSummary)

	return h
}

func (h *adminHandler) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")

		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		if subtle.ConstantTimeCompare([]byte(token), []byte(h.token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (h *adminHandler) handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	levelFilter := strings.ToLower(strings.TrimSpace(q.Get("level")))
	routeFilter := strings.TrimSpace(q.Get("route"))
	errorClassFilter := strings.TrimSpace(q.Get("error_class"))

	limit := adminDefaultLimit
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			if v > adminMaxLimit {
				limit = adminMaxLimit
			} else {
				limit = v
			}
		}
	}

	entries := h.buffer.snapshot()

	filtered := make([]adminLogEntry, 0, len(entries))
	for _, e := range entries {
		if levelFilter != "" && strings.ToLower(e.Level) != levelFilter {
			continue
		}
		if routeFilter != "" && !strings.Contains(e.Route, routeFilter) {
			continue
		}
		if errorClassFilter != "" && e.ErrorClass != errorClassFilter {
			continue
		}
		filtered = append(filtered, e)
	}

	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Ts.After(filtered[j].Ts)
	})

	if len(filtered) > limit {
		filtered = filtered[:limit]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"entries":         filtered,
		"total":           h.buffer.size(),
		"buffer_capacity": h.buffer.cap,
	})
}

func (h *adminHandler) handleAdminHealth(w http.ResponseWriter, _ *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	info, _ := debug.ReadBuildInfo()

	resp := map[string]any{
		"uptime_seconds":  int(time.Since(h.start).Seconds()),
		"buffer_size":     h.buffer.size(),
		"buffer_capacity": h.buffer.cap,
		"go_version":      info.GoVersion,
		"goroutines":      runtime.NumGoroutine(),
		"memory_alloc_mb": mem.Alloc / 1024 / 1024,
		"memory_sys_mb":   mem.Sys / 1024 / 1024,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *adminHandler) handleAdminMetricsSummary(w http.ResponseWriter, _ *http.Request) {
	entries := h.buffer.snapshot()

	type routeStats struct {
		count      int
		errorCount int
		latencies  []float64
	}

	routes := make(map[string]*routeStats)
	errorByClass := make(map[string]int)
	totalRequests := 0

	for _, e := range entries {
		if e.Route == "" || strings.HasPrefix(e.Route, "/admin/") {
			continue
		}

		totalRequests++

		rs, exists := routes[e.Route]
		if !exists {
			rs = &routeStats{}
			routes[e.Route] = rs
		}
		rs.count++

		if e.ErrorClass != "" && e.ErrorClass != "none" {
			rs.errorCount++
			errorByClass[e.ErrorClass]++
		}

		if e.ElapsedMs > 0 {
			rs.latencies = append(rs.latencies, e.ElapsedMs)
		}
	}

	byRoute := make(map[string]map[string]any, len(routes))
	for route, rs := range routes {
		entry := map[string]any{
			"count":  rs.count,
			"errors": rs.errorCount,
		}
		if len(rs.latencies) > 0 {
			sort.Float64s(rs.latencies)
			idx := int(math.Ceil(p95Quantile*float64(len(rs.latencies)))) - 1
			if idx < 0 {
				idx = 0
			}
			entry["p95_ms"] = rs.latencies[idx]
		}
		byRoute[route] = entry
	}

	resp := map[string]any{
		"uptime_seconds": int(time.Since(h.start).Seconds()),
		"total_requests": totalRequests,
		"by_route":       byRoute,
		"by_error_class": errorByClass,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
