package main

import (
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
)

// trustedProxySet holds pre-parsed trusted proxy CIDRs for efficient lookup.
type trustedProxySet struct {
	nets []*net.IPNet
}

// parseTrustedProxyCIDRs parses comma-separated CIDRs from env.
// Invalid entries are logged as warnings but do not panic.
// Empty input returns an empty set (no trusted proxies).
func parseTrustedProxyCIDRs(raw string, logger *slog.Logger) trustedProxySet {
	if strings.TrimSpace(raw) == "" {
		return trustedProxySet{}
	}
	var nets []*net.IPNet
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		_, ipNet, err := net.ParseCIDR(entry)
		if err != nil {
			logger.Warn("ignoring invalid trusted proxy CIDR entry", "entry", entry, "error", err)
			continue
		}
		nets = append(nets, ipNet)
	}
	return trustedProxySet{nets: nets}
}

// contains reports whether ip is in any trusted proxy CIDR.
func (s trustedProxySet) contains(ip net.IP) bool {
	for _, n := range s.nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// effectiveClientIP derives the real client IP respecting trusted proxy boundaries.
//
// Contract:
//   - If immediate peer is NOT in trusted proxy set: use RemoteAddr, ignore forwarded headers.
//   - If immediate peer IS in trusted proxy set: prefer X-Real-IP, then first valid X-Forwarded-For entry, then RemoteAddr.
func effectiveClientIP(r *http.Request, proxies trustedProxySet) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteHost = r.RemoteAddr
	}

	peerIP := net.ParseIP(remoteHost)
	if peerIP == nil {
		return remoteHost
	}

	// If peer is not a trusted proxy, ignore all forwarded headers.
	if !proxies.contains(peerIP) {
		return remoteHost
	}

	// Peer is trusted — honor forwarded headers.
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		if net.ParseIP(realIP) != nil {
			return realIP
		}
	}

	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		for _, entry := range strings.Split(xff, ",") {
			entry = strings.TrimSpace(entry)
			if entry != "" && net.ParseIP(entry) != nil {
				return entry
			}
		}
	}

	return remoteHost
}

// loadTrustedProxySet loads and parses READIO_TRUSTED_PROXY_CIDRS at startup.
func loadTrustedProxySet(logger *slog.Logger) trustedProxySet {
	return parseTrustedProxyCIDRs(os.Getenv("READIO_TRUSTED_PROXY_CIDRS"), logger)
}
