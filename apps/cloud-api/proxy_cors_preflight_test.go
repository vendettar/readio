package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestProxyPreflightCORS(t *testing.T) {
	t.Run("allows configured origin and records no-content status", func(t *testing.T) {
		proxy, _ := newMediaProxyTestService(t, func(_ http.ResponseWriter, _ *http.Request) {
			t.Fatal("preflight must not contact upstream")
		}, testPublicLookupIP)

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, "/api/proxy", nil)
		req.Header.Set("Origin", testProxyAllowedOrigin)
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		req.Header.Set("Access-Control-Request-Headers", "content-type,range")
		req.RemoteAddr = "198.51.100.10:12345"

		proxy.ServeHTTP(rr, req)

		require.Equal(t, http.StatusNoContent, rr.Code)
		gotOrigin := rr.Header().Get("Access-Control-Allow-Origin")
		require.Equal(t, testProxyAllowedOrigin, gotOrigin)
		gotMethods := rr.Header().Get("Access-Control-Allow-Methods")
		require.Equal(t, "GET, POST, OPTIONS", gotMethods)
		assertHeaderTokens(t, rr.Header().Get("Access-Control-Allow-Headers"), []string{
			"Content-Type",
			"Accept",
			"Range",
			"If-Range",
			"If-None-Match",
			"If-Modified-Since",
			"Cache-Control",
			"Pragma",
			"Accept-Language",
			"traceparent",
		})
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

		require.Equal(t, http.StatusNoContent, rr.Code)
		got := rr.Header().Get("Access-Control-Allow-Origin")
		require.Equal(t, "", got)
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

	require.Len(t, gotSet, len(want))
	for _, token := range want {
		if _, ok := gotSet[strings.ToLower(token)]; !ok {
			t.Fatalf("allow-headers = %q, missing token %q", got, token)
		}
	}
}
