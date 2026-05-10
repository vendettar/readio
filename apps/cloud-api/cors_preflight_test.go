package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDiscoveryServicePreflightCORS(t *testing.T) {
	service := &discoveryService{
		allowedOrigins: []string{"https://app.example"},
	}

	t.Run("allows configured origin", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, discoveryTopPodcastsRoute, nil)
		req.Header.Set("Origin", "https://app.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)
		req.Header.Set("Access-Control-Request-Headers", "content-type")

		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNoContent)
		}
		if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example" {
			t.Fatalf("allow-origin = %q, want https://app.example", got)
		}
		if got := rr.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, OPTIONS" {
			t.Fatalf("allow-methods = %q, want GET, POST, OPTIONS", got)
		}
		if got := rr.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, Accept" {
			t.Fatalf("allow-headers = %q, want Content-Type, Accept", got)
		}
		if got := rr.Header().Get("Access-Control-Max-Age"); got != "86400" {
			t.Fatalf("max-age = %q, want 86400", got)
		}
		if got := rr.Header().Get("Vary"); got != "Origin" {
			t.Fatalf("vary = %q, want Origin", got)
		}
		if rr.Body.Len() != 0 {
			t.Fatalf("body length = %d, want 0", rr.Body.Len())
		}
	})

	t.Run("omits CORS headers for disallowed origin", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, discoveryTopPodcastsRoute, nil)
		req.Header.Set("Origin", "https://evil.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)

		service.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNoContent)
		}
		if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("allow-origin = %q, want empty", got)
		}
		if got := rr.Header().Get("Access-Control-Allow-Methods"); got != "" {
			t.Fatalf("allow-methods = %q, want empty", got)
		}
	})
}

func TestASRRelayPreflightCORS(t *testing.T) {
	rb, restore := captureAdminLogsForPreflightTest()
	defer restore()

	relay := newASRRelayService()
	relay.allowedOrigins = []string{"https://app.example"}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, asrRelayRoute, nil)
	req.Header.Set("Origin", "https://app.example")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type,x-readio-relay-public-token")

	relay.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example" {
		t.Fatalf("allow-origin = %q, want https://app.example", got)
	}
	if got := rr.Header().Get("Access-Control-Allow-Methods"); got != "POST, OPTIONS" {
		t.Fatalf("allow-methods = %q, want POST, OPTIONS", got)
	}
	if got := rr.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, asrRelayPublicTokenHeader) {
		t.Fatalf("allow-headers = %q, want %s", got, asrRelayPublicTokenHeader)
	}
	assertAdminLogStatus(t, rb, "asr-relay", http.StatusNoContent)
}

func TestProxyPreflightCORS(t *testing.T) {
	t.Run("allows configured origin and records no-content status", func(t *testing.T) {
		rb, restore := captureAdminLogsForPreflightTest()
		defer restore()

		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("preflight must not contact upstream")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, "/api/proxy", nil)
		req.Header.Set("Origin", testProxyAllowedOrigin)
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		req.Header.Set("Access-Control-Request-Headers", "content-type,x-proxy-token,range")
		req.RemoteAddr = "198.51.100.10:12345"

		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNoContent)
		}
		if got := rr.Header().Get("Access-Control-Allow-Origin"); got != testProxyAllowedOrigin {
			t.Fatalf("allow-origin = %q, want %q", got, testProxyAllowedOrigin)
		}
		if got := rr.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, OPTIONS" {
			t.Fatalf("allow-methods = %q, want GET, POST, OPTIONS", got)
		}
		assertHeaderTokens(t, rr.Header().Get("Access-Control-Allow-Headers"), []string{
			"Content-Type",
			"Accept",
			"X-Proxy-Token",
			"Range",
			"If-Range",
			"If-None-Match",
			"If-Modified-Since",
			"Cache-Control",
			"Pragma",
			"Accept-Language",
		})
		assertAdminLogStatus(t, rb, "proxy/media", http.StatusNoContent)
	})

	t.Run("omits CORS headers for disallowed origin", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("preflight must not contact upstream")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, "/api/proxy", nil)
		req.Header.Set("Origin", "https://evil.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		req.RemoteAddr = "198.51.100.10:12345"

		proxy.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusNoContent)
		}
		if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("allow-origin = %q, want empty", got)
		}
	})
}

func assertHeaderTokens(t *testing.T, got string, want []string) {
	t.Helper()

	gotSet := make(map[string]struct{})
	for _, part := range strings.Split(got, ",") {
		token := strings.ToLower(strings.TrimSpace(part))
		if token != "" {
			gotSet[token] = struct{}{}
		}
	}

	if len(gotSet) != len(want) {
		t.Fatalf("allow-headers = %q, want tokens %#v", got, want)
	}
	for _, token := range want {
		if _, ok := gotSet[strings.ToLower(token)]; !ok {
			t.Fatalf("allow-headers = %q, missing token %q", got, token)
		}
	}
}

func captureAdminLogsForPreflightTest() (*adminRingBuffer, func()) {
	rb := newAdminRingBuffer(10)
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(&adminSlogHandler{
		Handler: slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelInfo}),
		buffer:  rb,
	}))
	return rb, func() {
		slog.SetDefault(oldLogger)
	}
}

func assertAdminLogStatus(t *testing.T, rb *adminRingBuffer, route string, wantStatus int) {
	t.Helper()

	for _, entry := range rb.snapshot() {
		if entry.Route == route {
			if entry.Status != wantStatus {
				t.Fatalf("logged status = %d, want %d", entry.Status, wantStatus)
			}
			return
		}
	}
	t.Fatalf("%s log entry not found in snapshot: %#v", route, rb.snapshot())
}
