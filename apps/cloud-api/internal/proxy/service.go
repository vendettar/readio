package proxy

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"readio-cloud/internal/clientip"
	"readio-cloud/internal/httputil"
	"readio-cloud/internal/observability"
)

const BrowserLikeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Readio/1.0"
const RequestTimeout = 10 * time.Second
const BodyLimit = 2 << 20
const RateLimitWindow = time.Minute
const RateLimitBurst = 5
const RateLimitBurstEnv = "READIO_PROXY_RATE_LIMIT_BURST"
const RateLimitWindowMsEnv = "READIO_PROXY_RATE_LIMIT_WINDOW_MS"
const AllowedOriginsEnv = "READIO_PROXY_ALLOWED_ORIGINS"
const Route = "/api/proxy"
const MaxRedirects = 20

var allowedRequestHeaders = map[string]struct{}{
	"accept":            {},
	"accept-language":   {},
	"cache-control":     {},
	"if-modified-since": {},
	"if-none-match":     {},
	"if-range":          {},
	"pragma":            {},
	"range":             {},
}

var allowedCORSRequestHeaders = []string{
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
}

var AllowedResponseHeaders = []string{
	"Accept-Ranges",
	"Age",
	"Cache-Control",
	"Content-Disposition",
	"Content-Encoding",
	"Content-Length",
	"Content-Range",
	"Content-Type",
	"ETag",
	"Expires",
	"Last-Modified",
	"Retry-After",
	"Vary",
}

var rangePattern = regexp.MustCompile(`^bytes=(?:\d+-\d*|\d*-\d+)$`)

type Config struct {
	Client         *http.Client
	Limiter        *httputil.RateLimiter
	AllowedOrigins []string
	Timeout        time.Duration
	UserAgent      string
	BodyLimit      int64
	LookupIP       func(context.Context, string) ([]net.IPAddr, error)
	DialContext    func(context.Context, string, string) (net.Conn, error)
	TrustedProxies clientip.TrustedProxySet
}

type Service struct {
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

type RequestPayload struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers,omitempty"`
}

type requestSpec struct {
	targetURL *url.URL
	method    string
	headers   http.Header
}

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

func NewError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func NewServiceWithConfig(cfg Config) *Service {
	return &Service{
		client:         cfg.Client,
		limiter:        cfg.Limiter,
		allowedOrigins: cfg.AllowedOrigins,
		timeout:        cfg.Timeout,
		userAgent:      cfg.UserAgent,
		bodyLimit:      cfg.BodyLimit,
		lookupIP:       cfg.LookupIP,
		dialContext:    cfg.DialContext,
		trustedProxies: cfg.TrustedProxies,
	}
}

func NewDefaultService() *Service {
	burst := ResolveRateLimitBurst()
	if burst <= 0 {
		slog.Warn("application-layer rate limiting disabled for /api/proxy", RateLimitBurstEnv, burst)
	}
	return NewServiceWithConfig(Config{
		Limiter:        httputil.NewRateLimiter(burst, ResolveRateLimitWindow(), time.Now),
		AllowedOrigins: ResolveAllowedOrigins(),
		Timeout:        RequestTimeout,
		UserAgent:      ResolveUpstreamUserAgent(),
		BodyLimit:      BodyLimit,
		LookupIP:       net.DefaultResolver.LookupIPAddr,
		TrustedProxies: clientip.LoadTrustedProxySet(slog.Default()),
	})
}

func (p *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	errClass := "none"
	var httpStatus int
	var upstreamKind string
	var upstreamHost string
	attemptedUpstream := false
	allowedOrigin := ""
	effectiveClientIP := clientip.EffectiveClientIP(r, p.trustedProxies)

	defer func() {
		elapsed := time.Since(start)
		observability.RecordHTTPMetric(r.Context(), "proxy/media", httpStatus, errClass, elapsed)
		if attemptedUpstream && upstreamKind != "" {
			observability.RecordUpstreamMetric(r.Context(), upstreamKind, "proxy/media", httpStatus, errClass, "uncached", elapsed)
		}
		slog.InfoContext(r.Context(), "proxy request",
			"route", "proxy/media",
			"upstream_kind", upstreamKind,
			"upstream_host", upstreamHost,
			"method", r.Method,
			"origin", strings.TrimSpace(r.Header.Get("Origin")),
			"client_ip", effectiveClientIP,
			"elapsed_ms", elapsed.Milliseconds(),
			"error_class", errClass,
			"status", httpStatus,
		)
	}()

	if r.Method == http.MethodOptions {
		httpStatus = http.StatusNoContent
		allowedOrigin, originErr := p.authorizeOrigin(r)
		if originErr == nil && allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(allowedCORSRequestHeaders, ", "))
			w.Header().Set("Access-Control-Max-Age", "86400")
			w.Header().Set("Vary", "Origin")
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	allowedOrigin = p.corsAllowedOrigin(r)

	if !p.allowRequest(effectiveClientIP) {
		httpStatus = http.StatusTooManyRequests
		errClass = "rate_limit"
		WriteError(r.Context(), w, http.StatusTooManyRequests, "PROXY_RATE_LIMIT_EXCEEDED", "rate limit exceeded", allowedOrigin)
		return
	}

	spec, pErr := p.parseProxyRequest(r)
	if pErr != nil {
		httpStatus = http.StatusBadRequest
		errClass = "invalid_request"
		var proxyErr *Error
		if errors.As(pErr, &proxyErr) {
			httpStatus = proxyErr.Status
			errClass = classifyParseError(proxyErr)
		}
		p.respondProxyError(r.Context(), w, pErr, allowedOrigin)
		return
	}
	upstreamKind = "proxy"
	upstreamHost = spec.targetURL.Host

	var originErr error
	allowedOrigin, originErr = p.authorizeOrigin(r)
	if originErr != nil {
		httpStatus = http.StatusForbidden
		errClass = "origin_not_allowed"
		p.respondProxyError(r.Context(), w, originErr, allowedOrigin)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), p.timeout)
	defer cancel()

	validatedAddrs, err := p.resolveTargetAddresses(ctx, spec.targetURL)
	if err != nil {
		httpStatus = http.StatusBadGateway
		errClass = "ssrf"
		p.respondProxyError(r.Context(), w, err, allowedOrigin)
		return
	}

	client := p.client
	if client == nil {
		client = p.newClient(validatedAddrs)
	}

	req, err := http.NewRequestWithContext(ctx, spec.method, spec.targetURL.String(), nil)
	if err != nil {
		httpStatus = http.StatusBadGateway
		errClass = "create_request"
		WriteError(r.Context(), w, http.StatusBadGateway, "PROXY_CREATE_REQUEST_FAILED", "unable to create upstream request", allowedOrigin)
		return
	}

	req.Header.Set("User-Agent", p.userAgent)
	for key, values := range spec.headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	attemptedUpstream = true
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) {
			httpStatus = http.StatusGatewayTimeout
			errClass = "timeout"
			WriteError(r.Context(), w, http.StatusGatewayTimeout, "PROXY_UPSTREAM_TIMEOUT", "upstream request timed out", allowedOrigin)
			return
		}

		var proxyErr *Error
		if errors.As(err, &proxyErr) {
			httpStatus = proxyErr.Status
			errClass = "upstream"
			WriteError(r.Context(), w, proxyErr.Status, proxyErr.Code, proxyErr.Message, allowedOrigin)
			return
		}

		httpStatus = http.StatusBadGateway
		errClass = "upstream"
		WriteError(r.Context(), w, http.StatusBadGateway, "PROXY_UPSTREAM_FAILED", "upstream request failed", allowedOrigin)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	copyResponseHeaders(w.Header(), resp.Header, spec.method)
	applyCORSHeaders(w.Header(), allowedOrigin)
	httpStatus = resp.StatusCode
	w.WriteHeader(resp.StatusCode)

	if spec.method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, resp.Body); err != nil {
		if ctx.Err() != nil {
			slog.WarnContext(ctx, "proxy body copy interrupted", "error", err, "target_host", spec.targetURL.Host)
			return
		}
		slog.WarnContext(ctx, "proxy body copy failed", "error", err, "target_host", spec.targetURL.Host)
	}
}

func (p *Service) corsAllowedOrigin(r *http.Request) string {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return ""
	}

	if len(p.allowedOrigins) > 0 {
		if match, ok := httputil.MatchOrigin(p.allowedOrigins, origin); ok {
			return match
		}
		return ""
	}

	requestScheme, requestHost, ok := httputil.ProxyRequestOriginContext(r, p.trustedProxies)
	if !ok {
		return ""
	}
	parsed, err := url.Parse(origin)
	if err != nil || !httputil.IsSameOrigin(parsed.Scheme, parsed.Host, requestScheme, requestHost) {
		return ""
	}
	return origin
}
