package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
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

func ResolveRateLimitBurst() int {
	return envIntOrDefaultAllowNonPositive(RateLimitBurstEnv, RateLimitBurst)
}

func ResolveRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(RateLimitWindowMsEnv, RateLimitWindow)
}

func ResolveUpstreamUserAgent() string {
	return BrowserLikeUserAgent
}

func ResolveAllowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv(AllowedOriginsEnv))
	if raw == "" {
		return nil
	}

	var origins []string
	for _, part := range strings.Split(raw, ",") {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}
		if !strings.Contains(candidate, "://") {
			continue
		}
		origins = append(origins, candidate)
	}
	if len(origins) == 0 {
		return nil
	}
	return origins
}

func envIntOrDefaultAllowNonPositive(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		slog.Warn("invalid integer environment value; using default", "env", name)
		return fallback
	}
	return value
}

func envDurationMillisOrDefault(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		slog.Warn("invalid duration environment value; using default", "env", name)
		return fallback
	}
	return time.Duration(value) * time.Millisecond
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

func (p *Service) parseProxyRequest(r *http.Request) (*requestSpec, error) {
	switch r.Method {
	case http.MethodGet:
		rawTarget := r.URL.Query().Get("url")
		if rawTarget == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_MISSING_URL", "missing url")
		}
		parsedURL, err := parseTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}
		if err := validateTarget(parsedURL); err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", err.Error())
		}
		headers, err := filterForwardHeaders(r.Header)
		if err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}
		return &requestSpec{targetURL: parsedURL, method: http.MethodGet, headers: headers}, nil

	case http.MethodPost:
		if ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))); ct != "" && !strings.HasPrefix(ct, "application/json") {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_CONTENT_TYPE", "content-type must be application/json")
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, p.bodyLimit+1))
		if err != nil {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		if int64(len(body)) > p.bodyLimit {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()

		var payload RequestPayload
		if err := decoder.Decode(&payload); err != nil {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		var trailing json.RawMessage
		if err := decoder.Decode(&trailing); err != io.EOF {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}

		rawTarget := strings.TrimSpace(payload.URL)
		if rawTarget == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_MISSING_URL", "missing url")
		}
		parsedURL, err := parseTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}
		if err := validateTarget(parsedURL); err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", err.Error())
		}

		method := strings.ToUpper(strings.TrimSpace(payload.Method))
		if method == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_MISSING_METHOD", "missing method")
		}
		if method != http.MethodGet && method != http.MethodHead {
			return nil, NewError(http.StatusBadRequest, "PROXY_UNSUPPORTED_METHOD", "unsupported proxy method")
		}
		headers, err := ValidateForwardHeaders(payloadHeaders(payload.Headers))
		if err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}
		return &requestSpec{targetURL: parsedURL, method: method, headers: headers}, nil
	default:
		return nil, NewError(http.StatusMethodNotAllowed, "PROXY_METHOD_NOT_ALLOWED", "only GET and POST are allowed")
	}
}

func (p *Service) respondProxyError(ctx context.Context, w http.ResponseWriter, err error, allowedOrigin string) {
	var proxyErr *Error
	if errors.As(err, &proxyErr) {
		if proxyErr.Status == http.StatusMethodNotAllowed {
			w.Header().Set("Allow", "GET, POST")
		}
		WriteError(ctx, w, proxyErr.Status, proxyErr.Code, proxyErr.Message, allowedOrigin)
		return
	}
	WriteError(ctx, w, http.StatusBadGateway, "PROXY_UPSTREAM_FAILED", err.Error(), allowedOrigin)
}

func classifyParseError(err *Error) string {
	if err.Status == http.StatusMethodNotAllowed {
		return "invalid_method"
	}
	return "invalid_request"
}

func parseTargetURL(raw string) (*url.URL, error) {
	parsedURL, err := url.ParseRequestURI(raw)
	if err != nil {
		return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "invalid url")
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "only http and https urls are allowed")
	}
	if parsedURL.User != nil {
		return nil, NewError(http.StatusBadRequest, "PROXY_USERINFO_NOT_ALLOWED", "userinfo is not allowed")
	}
	return parsedURL, nil
}

func payloadHeaders(headers map[string]string) http.Header {
	payloadHeaders := make(http.Header, len(headers))
	for key, value := range headers {
		payloadHeaders.Set(key, value)
	}
	return payloadHeaders
}

func ValidateForwardHeaders(headers http.Header) (http.Header, error) {
	forwarded := make(http.Header)
	rangeValueCount := 0
	for rawName, values := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		if name == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}
		if _, ok := allowedRequestHeaders[strings.ToLower(name)]; !ok {
			return nil, NewError(http.StatusBadRequest, "PROXY_UNSUPPORTED_HEADER", "unsupported proxy header")
		}
		for _, rawValue := range values {
			value := strings.TrimSpace(rawValue)
			if value == "" {
				return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
			}
			if name == "Range" {
				rangeValueCount++
				if rangeValueCount > 1 || !rangePattern.MatchString(value) {
					return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_RANGE", "invalid range header")
				}
			}
			forwarded.Add(name, value)
		}
	}
	return forwarded, nil
}

func filterForwardHeaders(headers http.Header) (http.Header, error) {
	forwarded := make(http.Header)
	rangeValueCount := 0
	for rawName, values := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		if name == "" {
			continue
		}
		if _, ok := allowedRequestHeaders[strings.ToLower(name)]; !ok {
			continue
		}
		for _, rawValue := range values {
			value := strings.TrimSpace(rawValue)
			if value == "" {
				continue
			}
			if name == "Range" {
				rangeValueCount++
				if rangeValueCount > 1 || !rangePattern.MatchString(value) {
					return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_RANGE", "invalid range header")
				}
			}
			forwarded.Add(name, value)
		}
	}
	return forwarded, nil
}

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

func validateTarget(target *url.URL) error {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "target host is required")
	}
	lowerHost := strings.ToLower(host)
	switch {
	case lowerHost == "localhost",
		strings.HasSuffix(lowerHost, ".localhost"),
		strings.HasSuffix(lowerHost, ".local"),
		lowerHost == "metadata",
		lowerHost == "metadata.google.internal":
		return NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		return nil
	}
	if isDisallowedAddr(addr) {
		return NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}
	return nil
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

func (p *Service) resolveTargetAddresses(ctx context.Context, target *url.URL) ([]netip.Addr, error) {
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "target host is required")
	}
	if _, err := netip.ParseAddr(host); err == nil {
		addr, _ := netip.ParseAddr(host)
		if isDisallowedAddr(addr) {
			return nil, NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
		}
		return []netip.Addr{addr.Unmap()}, nil
	}

	lookup := net.DefaultResolver.LookupIPAddr
	if p != nil && p.lookupIP != nil {
		lookup = p.lookupIP
	}
	addresses, err := lookup(ctx, host)
	if err != nil || len(addresses) == 0 {
		return nil, NewError(http.StatusBadGateway, "PROXY_RESOLVE_FAILED", "unable to resolve target host")
	}

	allowed := make([]netip.Addr, 0, len(addresses))
	for _, addr := range addresses {
		ip, ok := netip.AddrFromSlice(addr.IP)
		if !ok || isDisallowedAddr(ip) {
			return nil, NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
		}
		allowed = append(allowed, ip.Unmap())
	}
	return allowed, nil
}

func isDisallowedAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsUnspecified() || addr.IsMulticast()
}

func (p *Service) newClient(addrs []netip.Addr) *http.Client {
	pinnedAddrs := append([]netip.Addr(nil), addrs...)
	var pinnedOnce sync.Mutex
	pinnedUsed := false

	transport := &http.Transport{
		DisableCompression: true,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}

			if contextAddrs, ok := pinnedAddrsFromContext(ctx); ok {
				return p.dialValidatedTargets(ctx, network, port, contextAddrs)
			}

			pinnedOnce.Lock()
			usePinned := !pinnedUsed && len(pinnedAddrs) > 0
			if usePinned {
				pinnedUsed = true
			}
			pinnedOnce.Unlock()

			if usePinned {
				return p.dialValidatedTargets(ctx, network, port, pinnedAddrs)
			}

			validatedAddrs, err := p.resolveTargetAddresses(ctx, &url.URL{Host: host})
			if err != nil {
				return nil, err
			}
			return p.dialValidatedTargets(ctx, network, port, validatedAddrs)
		},
	}

	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= MaxRedirects {
				return NewError(http.StatusBadGateway, "PROXY_REDIRECT_TOO_LONG", "redirect chain too long")
			}
			if err := validateTarget(req.URL); err != nil {
				return err
			}
			validatedAddrs, err := p.resolveTargetAddresses(req.Context(), req.URL)
			if err != nil {
				return err
			}
			*req = *req.WithContext(context.WithValue(req.Context(), redirectAddrsContextKey{}, validatedAddrs))
			if len(via) > 0 && len(via[0].Header) > 0 {
				copyRequestHeaders(req.Header, via[0].Header)
			}
			req.Header.Set("User-Agent", p.userAgent)
			return nil
		},
	}
	if p != nil && p.timeout > 0 {
		client.Timeout = p.timeout
	}
	return client
}

type redirectAddrsContextKey struct{}

func pinnedAddrsFromContext(ctx context.Context) ([]netip.Addr, bool) {
	addrs, ok := ctx.Value(redirectAddrsContextKey{}).([]netip.Addr)
	return addrs, ok && len(addrs) > 0
}

func copyRequestHeaders(dst http.Header, src http.Header) {
	dst.Del("Accept")
	dst.Del("Accept-Language")
	dst.Del("Cache-Control")
	dst.Del("If-Modified-Since")
	dst.Del("If-None-Match")
	dst.Del("If-Range")
	dst.Del("Pragma")
	dst.Del("Range")

	for _, headerName := range []string{
		"Accept",
		"Accept-Language",
		"Cache-Control",
		"If-Modified-Since",
		"If-None-Match",
		"If-Range",
		"Pragma",
		"Range",
	} {
		if value := strings.TrimSpace(src.Get(headerName)); value != "" {
			dst.Set(headerName, value)
		}
	}
}

func (p *Service) dialValidatedTargets(ctx context.Context, network, port string, addrs []netip.Addr) (net.Conn, error) {
	if len(addrs) == 0 {
		return nil, NewError(http.StatusBadRequest, "PROXY_HOST_NOT_ALLOWED", "target host is not allowed")
	}
	for _, addr := range addrs {
		conn, err := p.dialTarget(ctx, network, net.JoinHostPort(addr.String(), port))
		if err == nil {
			return conn, nil
		}
	}
	return nil, NewError(http.StatusBadGateway, "PROXY_DIAL_FAILED", "unable to dial upstream")
}

func (p *Service) dialTarget(ctx context.Context, network, address string) (net.Conn, error) {
	if p != nil && p.dialContext != nil {
		return p.dialContext(ctx, network, address)
	}
	var d net.Dialer
	return d.DialContext(ctx, network, address)
}
