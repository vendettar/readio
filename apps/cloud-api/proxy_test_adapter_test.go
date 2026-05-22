package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"

	"readio-cloud/internal/clientip"
	"readio-cloud/internal/httputil"
	proxypkg "readio-cloud/internal/proxy"
)

const proxyBrowserLikeUserAgent = proxypkg.BrowserLikeUserAgent
const proxyBodyLimit = proxypkg.BodyLimit
const proxyRateLimitWindow = proxypkg.RateLimitWindow
const proxyRateLimitBurst = proxypkg.RateLimitBurst
const proxyRateLimitBurstEnv = proxypkg.RateLimitBurstEnv
const proxyRateLimitWindowMsEnv = proxypkg.RateLimitWindowMsEnv

type proxyRequestPayload = proxypkg.RequestPayload
type proxyError = proxypkg.Error

type proxyService struct {
	client         *http.Client
	limiter        *httputil.RateLimiter
	allowedOrigins []string
	timeout        time.Duration
	userAgent      string
	bodyLimit      int64
	lookupIP       func(context.Context, string) ([]net.IPAddr, error)
	dialContext    func(context.Context, string, string) (net.Conn, error)
	trustedProxies clientip.TrustedProxySet
}

func newProxyService() *proxyService {
	return &proxyService{
		client:         nil,
		limiter:        httputil.NewRateLimiter(resolveProxyRateLimitBurst(), resolveProxyRateLimitWindow(), time.Now),
		allowedOrigins: proxypkg.ResolveAllowedOrigins(),
		timeout:        proxypkg.RequestTimeout,
		userAgent:      proxypkg.ResolveUpstreamUserAgent(),
		bodyLimit:      proxypkg.BodyLimit,
		lookupIP:       net.DefaultResolver.LookupIPAddr,
		trustedProxies: clientip.LoadTrustedProxySet(slog.Default()),
	}
}

func resolveProxyRateLimitBurst() int {
	return proxypkg.ResolveRateLimitBurst()
}

func resolveProxyRateLimitWindow() time.Duration {
	return proxypkg.ResolveRateLimitWindow()
}

func (p *proxyService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	proxypkg.NewServiceWithConfig(proxypkg.Config{
		Client:         p.client,
		Limiter:        p.limiter,
		AllowedOrigins: p.allowedOrigins,
		Timeout:        p.timeout,
		UserAgent:      p.userAgent,
		BodyLimit:      p.bodyLimit,
		LookupIP:       p.lookupIP,
		DialContext:    p.dialContext,
		TrustedProxies: p.trustedProxies,
	}).ServeHTTP(w, r)
}

func (p *proxyService) allowRequest(remoteAddr string) bool {
	if p == nil || p.limiter == nil {
		return true
	}
	return p.limiter.Allow(remoteAddr)
}

func validateProxyForwardHeaders(headers http.Header) (http.Header, error) {
	return proxypkg.ValidateForwardHeaders(headers)
}

func writeProxyError(ctx context.Context, w http.ResponseWriter, status int, code, message, allowedOrigin string) {
	proxypkg.WriteError(ctx, w, status, code, message, allowedOrigin)
}
