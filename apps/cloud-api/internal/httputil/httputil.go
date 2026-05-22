package httputil

import (
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/http"
	"strings"

	"readio-cloud/internal/clientip"
)

func ProxyRequestOriginContext(r *http.Request, trusted clientip.TrustedProxySet) (scheme string, host string, ok bool) {
	if r == nil {
		return "", "", false
	}

	peerHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		peerHost = r.RemoteAddr
	}
	peerIP := net.ParseIP(peerHost)

	isTrustedProxy := peerIP != nil && (peerIP.IsLoopback() || trusted.Contains(peerIP))
	if !isTrustedProxy {
		return "", "", false
	}

	if proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); proto != "" {
		parts := strings.Split(proto, ",")
		scheme = strings.ToLower(strings.TrimSpace(parts[0]))
	}

	if hostHeader := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); hostHeader != "" {
		parts := strings.Split(hostHeader, ",")
		host = strings.TrimSpace(parts[0])
	}

	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	if host == "" {
		host = r.Host
	}

	host = strings.TrimSpace(host)
	ok = scheme != "" && host != ""
	return scheme, host, ok
}

func MatchOrigin(patterns []string, origin string) (string, bool) {
	if origin == "" {
		return "", false
	}
	origin = strings.ToLower(origin)

	for _, pattern := range patterns {
		pattern = strings.ToLower(pattern)
		if pattern == "*" {
			return "*", true
		}
		if pattern == origin {
			return origin, true
		}
		if strings.HasPrefix(pattern, "*.") {
			suffix := pattern[1:]
			if strings.HasSuffix(origin, suffix) {
				return origin, true
			}
		}
	}
	return "", false
}

func GenerateRequestID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// normalizeHost strips the default port for the given scheme so that
// e.g. "example.com:443" is treated the same as "example.com" for https.
func normalizeHost(scheme, host string) string {
	h := strings.ToLower(host)
	switch scheme {
	case "https":
		h = strings.TrimSuffix(h, ":443")
	case "http":
		h = strings.TrimSuffix(h, ":80")
	}
	return h
}

// IsSameOrigin reports whether the given origin (scheme + host) and request
// (scheme + host) represent the same origin.  It normalises default ports
// (443 for https, 80 for http) and does a case-insensitive hostname comparison.
func IsSameOrigin(originScheme, originHost string, requestScheme, requestHost string) bool {
	if originScheme == "" || originHost == "" || requestScheme == "" || requestHost == "" {
		return false
	}
	if !strings.EqualFold(originScheme, requestScheme) {
		return false
	}
	return normalizeHost(originScheme, originHost) == normalizeHost(requestScheme, requestHost)
}
