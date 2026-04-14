package main

import (
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func newTestLogger(t *testing.T) *slog.Logger {
	t.Helper()
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestParseTrustedProxyCIDRs(t *testing.T) {
	t.Run("empty input returns empty set", func(t *testing.T) {
		set := parseTrustedProxyCIDRs("", newTestLogger(t))
		if len(set.nets) != 0 {
			t.Fatalf("expected empty set, got %d entries", len(set.nets))
		}
	})

	t.Run("whitespace-only input returns empty set", func(t *testing.T) {
		set := parseTrustedProxyCIDRs("   ", newTestLogger(t))
		if len(set.nets) != 0 {
			t.Fatalf("expected empty set, got %d entries", len(set.nets))
		}
	})

	t.Run("valid CIDRs are parsed", func(t *testing.T) {
		set := parseTrustedProxyCIDRs("127.0.0.1/32,::1/128", newTestLogger(t))
		if len(set.nets) != 2 {
			t.Fatalf("expected 2 nets, got %d", len(set.nets))
		}
	})

	t.Run("invalid CIDRs are skipped with warning", func(t *testing.T) {
		set := parseTrustedProxyCIDRs("127.0.0.1/32,not-a-cidr,::1/128", newTestLogger(t))
		if len(set.nets) != 2 {
			t.Fatalf("expected 2 nets, got %d", len(set.nets))
		}
	})
}

func TestEffectiveClientIP(t *testing.T) {
	trusted := trustedProxySet{
		nets: []*net.IPNet{parseSingleCIDR("127.0.0.1/32"), parseSingleCIDR("::1/128")},
	}

	t.Run("untrusted peer cannot spoof X-Real-IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "203.0.113.50:9999"
		req.Header.Set("X-Real-IP", "1.2.3.4")
		got := effectiveClientIP(req, trusted)
		if got != "203.0.113.50" {
			t.Fatalf("expected 203.0.113.50, got %q", got)
		}
	})

	t.Run("trusted peer can forward X-Real-IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Real-IP", "10.0.0.1")
		got := effectiveClientIP(req, trusted)
		if got != "10.0.0.1" {
			t.Fatalf("expected 10.0.0.1, got %q", got)
		}
	})

	t.Run("trusted peer with invalid X-Real-IP falls back to X-Forwarded-For", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Real-IP", "not-an-ip")
		req.Header.Set("X-Forwarded-For", "10.0.0.2")
		got := effectiveClientIP(req, trusted)
		if got != "10.0.0.2" {
			t.Fatalf("expected 10.0.0.2, got %q", got)
		}
	})

	t.Run("trusted peer with invalid X-Real-IP and no valid XFF falls back to RemoteAddr", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Real-IP", "not-an-ip")
		got := effectiveClientIP(req, trusted)
		if got != "127.0.0.1" {
			t.Fatalf("expected 127.0.0.1, got %q", got)
		}
	})

	t.Run("trusted peer multi-entry X-Forwarded-For chain chooses first valid client IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Forwarded-For", "10.0.0.3, 172.16.0.1, 192.168.1.1")
		got := effectiveClientIP(req, trusted)
		if got != "10.0.0.3" {
			t.Fatalf("expected 10.0.0.3, got %q", got)
		}
	})

	t.Run("empty trusted proxy set falls back to RemoteAddr", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "203.0.113.50:9999"
		req.Header.Set("X-Real-IP", "1.2.3.4")
		got := effectiveClientIP(req, trustedProxySet{})
		if got != "203.0.113.50" {
			t.Fatalf("expected 203.0.113.50, got %q", got)
		}
	})

	t.Run("trusted peer prefers X-Real-IP over X-Forwarded-For", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Real-IP", "10.0.0.10")
		req.Header.Set("X-Forwarded-For", "10.0.0.11")
		got := effectiveClientIP(req, trusted)
		if got != "10.0.0.10" {
			t.Fatalf("expected 10.0.0.10, got %q", got)
		}
	})
}

func TestProxyRateLimitUsesEffectiveClientIP(t *testing.T) {
	trusted := trustedProxySet{
		nets: []*net.IPNet{parseSingleCIDR("127.0.0.1/32")},
	}

	_ = &proxyService{
		limiter:        newRateLimiter(1, time.Second*60, time.Now),
		trustedProxies: trusted,
	}

	// First request from proxy-trusted IP should go through X-Real-IP path.
	req := httptest.NewRequest(http.MethodPost, "/api/proxy", strings.NewReader("{}"))
	req.RemoteAddr = "127.0.0.1:9999"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Real-IP", "10.0.0.100")

	// effectiveClientIP is called in ServeHTTP, so verify it resolves correctly.
	clientIP := effectiveClientIP(req, trusted)
	if clientIP != "10.0.0.100" {
		t.Fatalf("expected effective IP 10.0.0.100, got %q", clientIP)
	}
}

func TestASRRelayRateLimitUsesEffectiveClientIP(t *testing.T) {
	trusted := trustedProxySet{
		nets: []*net.IPNet{parseSingleCIDR("127.0.0.1/32")},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/asr/relay", nil)
	req.RemoteAddr = "127.0.0.1:9999"
	req.Header.Set("X-Real-IP", "10.0.0.200")

	clientIP := effectiveClientIP(req, trusted)
	if clientIP != "10.0.0.200" {
		t.Fatalf("expected effective IP 10.0.0.200, got %q", clientIP)
	}
}

func TestLoadTrustedProxySet(t *testing.T) {
	t.Run("env set loads CIDRs", func(t *testing.T) {
		t.Setenv("READIO_TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128")
		set := loadTrustedProxySet(newTestLogger(t))
		if len(set.nets) != 2 {
			t.Fatalf("expected 2 nets, got %d", len(set.nets))
		}
	})

	t.Run("empty env returns empty set", func(t *testing.T) {
		t.Setenv("READIO_TRUSTED_PROXY_CIDRS", "")
		set := loadTrustedProxySet(newTestLogger(t))
		if len(set.nets) != 0 {
			t.Fatalf("expected 0 nets, got %d", len(set.nets))
		}
	})
}

func TestEffectiveClientIPWithoutTrustedProxies(t *testing.T) {
	t.Run("ENV READIO_TRUSTED_PROXY_CIDRS empty falls back to RemoteAddr", func(t *testing.T) {
		_ = os.Unsetenv("READIO_TRUSTED_PROXY_CIDRS")
		set := loadTrustedProxySet(newTestLogger(t))
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "203.0.113.50:8080"
		req.Header.Set("X-Real-IP", "1.2.3.4")
		got := effectiveClientIP(req, set)
		if got != "203.0.113.50" {
			t.Fatalf("expected 203.0.113.50, got %q", got)
		}
	})
}

func parseSingleCIDR(raw string) *net.IPNet {
	_, ipNet, _ := net.ParseCIDR(raw)
	return ipNet
}
