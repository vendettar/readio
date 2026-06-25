package proxy

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"readio-cloud/internal/httputil"
)

func copyResponseHeaders(dst http.Header, src http.Header, method string) {
	for _, headerName := range AllowedResponseHeaders {
		if headerName == "Content-Length" && method != http.MethodHead {
			continue
		}
		value := strings.TrimSpace(src.Get(headerName))
		if value != "" {
			dst.Set(headerName, value)
		}
	}
}

func (p *Service) allowRequest(remoteAddr string) bool {
	if p == nil || p.limiter == nil {
		return true
	}
	return p.limiter.Allow(remoteAddr)
}

func (p *Service) authorizeOrigin(r *http.Request) (string, error) {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return "", NewError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}

	if len(p.allowedOrigins) > 0 {
		if match, ok := httputil.MatchOrigin(p.allowedOrigins, origin); ok {
			return match, nil
		}
		return "", NewError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}

	requestScheme, requestHost, ok := httputil.ProxyRequestOriginContext(r, p.trustedProxies)
	if !ok {
		return "", NewError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}
	parsed, err := url.Parse(origin)
	if err != nil || !httputil.IsSameOrigin(parsed.Scheme, parsed.Host, requestScheme, requestHost) {
		return "", NewError(http.StatusForbidden, "PROXY_ORIGIN_NOT_ALLOWED", "origin not allowed")
	}
	return origin, nil
}

func applyCORSHeaders(headers http.Header, allowedOrigin string) {
	if allowedOrigin == "" || allowedOrigin == "*" {
		return
	}
	headers.Set("Access-Control-Allow-Origin", allowedOrigin)
	headers.Set("Access-Control-Expose-Headers", strings.Join(AllowedResponseHeaders, ", "))
	headers.Add("Vary", "Origin")
}

func WriteError(ctx context.Context, w http.ResponseWriter, status int, code string, message string, allowedOrigin string) {
	if strings.TrimSpace(code) == "" {
		code = "PROXY_UNKNOWN_ERROR"
	}
	requestID := httputil.GenerateRequestID()
	applyCORSHeaders(w.Header(), allowedOrigin)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	payload := map[string]string{
		"code":       code,
		"message":    message,
		"request_id": requestID,
	}
	_ = json.NewEncoder(w).Encode(payload)
	slog.InfoContext(ctx, "proxy error response", "request_id", requestID, "code", code, "status", status)
}
