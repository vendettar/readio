// Package asr provides the ASR relay server endpoints.
package asr

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"readio-cloud/internal/clientip"
	"readio-cloud/internal/httputil"
	"readio-cloud/internal/observability"
)

const RelayRoute = "/api/v1/asr/transcriptions"
const VerifyRoute = "/api/v1/asr/verify"
const asrRelayPublicTokenHeader = "X-Readio-Relay-Public-Token"
const RelayPublicTokenEnv = "READIO_ASR_RELAY_PUBLIC_TOKEN"
const asrRelayAllowedOriginsEnv = "READIO_ASR_ALLOWED_ORIGINS"
const asrRelayRateLimitBurstEnv = "READIO_ASR_RATE_LIMIT_BURST"
const asrRelayRateLimitWindowMsEnv = "READIO_ASR_RATE_LIMIT_WINDOW_MS"

const asrWorkerBaseURLEnv = "READIO_ASR_WORKER_BASE_URL"
const asrWorkerSharedSecretEnv = "READIO_ASR_WORKER_SHARED_SECRET"
const asrWorkerSecretHeader = "X-Readio-Cloud-Secret"
const asrWorkerGroqRoute = "/relay/groq/transcriptions"

const asrRelayBodyLimit = 20 << 20
const asrRelayVerifyBodyLimit = 16 << 10
const asrRelayRequestTimeout = 60 * time.Second
const asrRelayRateLimitWindow = time.Minute
const asrRelayRateLimitBurst = 60
const asrRelayStatusBodyReadLimit = 4096

type asrRelayProviderConfig struct {
	id             string
	label          string
	transcribeURL  string
	verifyURL      string
	responseFormat string
	allowedModels  map[string]struct{}
	transport      string
}

type asrRelayRequestPayload struct {
	Provider      string
	Model         string
	APIKey        string
	AudioReader   io.ReadCloser
	AudioSize     int64
	AudioMimeType string
}

type ASRRelayResponsePayload struct {
	Cues            []ASRRelayCue `json:"cues"`
	Language        string        `json:"language,omitempty"`
	DurationSeconds *float64      `json:"durationSeconds,omitempty"`
	Provider        string        `json:"provider"`
	Model           string        `json:"model"`
}

type asrVerifyRequestPayload struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey"`
}

type asrVerifyResponsePayload struct {
	OK bool `json:"ok"`
}

type ASRRelayCue struct {
	Start     float64        `json:"start"`
	End       float64        `json:"end"`
	Text      string         `json:"text"`
	Words     []ASRRelayWord `json:"words,omitempty"`
	SpeakerID string         `json:"speakerId,omitempty"`
}

type ASRRelayWord struct {
	Word       string   `json:"word"`
	Start      float64  `json:"start"`
	End        float64  `json:"end"`
	Confidence *float64 `json:"confidence,omitempty"`
}

type asrRelayErrorPayload struct {
	Code         string `json:"code"`
	Message      string `json:"message"`
	Status       int    `json:"status"`
	RequestID    string `json:"request_id,omitempty"`
	RetryAfterMs *int64 `json:"retryAfterMs,omitempty"`
}

func (e *asrRelayErrorPayload) Error() string { return e.Message }

// Sentinel ASR error values for use with errors.Is().
// Only errors with fully static messages are exposed as sentinels.
// Errors with dynamic messages (e.g., err.Error()) must be constructed inline.
var (
	ErrASRInvalidMethod           = &asrRelayErrorPayload{Status: http.StatusMethodNotAllowed, Code: "ASR_INVALID_METHOD", Message: "only POST is allowed"}
	ErrASRUnsupportedProvider     = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_UNSUPPORTED_PROVIDER", Message: "unsupported ASR provider"}
	ErrASRMissingModel            = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_INVALID_PAYLOAD", Message: "missing model"}
	ErrASRUnsupportedModel        = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_INVALID_PAYLOAD", Message: "unsupported ASR model"}
	ErrASRMissingAPIKey           = &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "ASR_UNAUTHORIZED", Message: "missing ASR API key"}
	ErrASRInvalidAudio            = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_INVALID_PAYLOAD", Message: "invalid audio payload"}
	ErrASRUnsupportedTransport    = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_INVALID_PAYLOAD", Message: "unsupported provider transport"}
	ErrASRProviderRejectedCreds   = &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "ASR_UNAUTHORIZED", Message: "provider rejected credentials"}
	ErrASRProviderRejectedPayload = &asrRelayErrorPayload{Status: http.StatusRequestEntityTooLarge, Code: "ASR_PAYLOAD_TOO_LARGE", Message: "provider rejected payload"}
	ErrASRProviderRateLimited     = &asrRelayErrorPayload{Status: http.StatusTooManyRequests, Code: "ASR_RATE_LIMITED", Message: "provider rate limited the request"}
	ErrASRProviderUnavailable     = &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "ASR_SERVICE_UNAVAILABLE", Message: "provider service unavailable"}
	ErrASRProviderClientError     = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_CLIENT_ERROR", Message: "provider rejected the request"}
	ErrASRUpstreamTimeout         = &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "ASR_SERVICE_UNAVAILABLE", Message: "upstream request timed out"}
	ErrASRRequestCanceled         = &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "ASR_CLIENT_ERROR", Message: "request canceled"}
	ErrASRUpstreamFailed          = &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "ASR_SERVICE_UNAVAILABLE", Message: "upstream request failed"}
)

type asrRelayService struct {
	// client targets third-party ASR provider endpoints directly (Groq,
	// Cloudflare AI, etc.). It must NOT be tracing-instrumented, so the
	// project never propagates traceparent to third-party providers and
	// never records full upstream URLs as span attributes.
	client *http.Client
	// workerClient targets the first-party Readio ASR worker hop. The worker
	// is repo-owned and bounded; outbound spans here may safely propagate
	// W3C TraceContext to support end-to-end traces.
	workerClient       *http.Client
	timeout            time.Duration
	bodyLimit          int64
	providers          map[string]asrRelayProviderConfig
	limiter            *httputil.RateLimiter
	allowedOrigins     []string
	relayPublicToken   string
	trustedProxies     clientip.TrustedProxySet
	workerBaseURL      string
	workerSharedSecret string
}

func NewASRRelayService() http.Handler {
	burst := resolveASRRelayRateLimitBurst()
	if burst <= 0 {
		slog.Warn("application-layer rate limiting disabled for ASR relay", "READIO_ASR_RATE_LIMIT_BURST", burst)
	}

	workerBase := strings.TrimSpace(os.Getenv(asrWorkerBaseURLEnv))
	workerSecret := strings.TrimSpace(os.Getenv(asrWorkerSharedSecretEnv))
	if workerBase != "" && workerSecret != "" {
		slog.Info("ASR worker transport enabled", "baseURL", workerBase)
	} else {
		slog.Info("ASR worker transport disabled (env not configured)")
	}

	return &asrRelayService{
		client:             &http.Client{},
		workerClient:       newASRWorkerHTTPClient(),
		timeout:            asrRelayRequestTimeout,
		bodyLimit:          asrRelayBodyLimit,
		providers:          defaultASRRelayProviders(),
		limiter:            httputil.NewRateLimiter(burst, resolveASRRelayRateLimitWindow(), time.Now),
		allowedOrigins:     resolveASRRelayAllowedOrigins(),
		relayPublicToken:   strings.TrimSpace(os.Getenv(RelayPublicTokenEnv)),
		trustedProxies:     clientip.LoadTrustedProxySet(slog.Default()),
		workerBaseURL:      workerBase,
		workerSharedSecret: workerSecret,
	}
}

func (s *asrRelayService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := "asr-relay" // Default route to ensure error logging works even before route is determined
	errClass := "none"
	var httpStatus int
	var upstreamKind string
	var upstreamHost string
	metricProviderLabel := "unknown"
	metricModeLabel := "unknown"
	effectiveClientIP := clientip.EffectiveClientIP(r, s.trustedProxies)

	defer func() {
		elapsed := time.Since(start)
		observability.RecordHTTPMetric(r.Context(), route, httpStatus, errClass, elapsed)
		if upstreamKind != "" {
			observability.RecordUpstreamMetric(r.Context(), upstreamKind, route, httpStatus, errClass, "uncached", elapsed)
		}
		if route == "asr-relay/transcriptions" {
			observability.RecordASRRelayMetric(r.Context(), metricProviderLabel, metricModeLabel, httpStatus, errClass)
		}
		slog.InfoContext(r.Context(), "asr-relay request",
			"route", route,
			"upstream_kind", upstreamKind,
			"upstream_host", upstreamHost,
			"provider", metricProviderLabel,
			"origin", strings.TrimSpace(r.Header.Get("Origin")),
			"client_ip", effectiveClientIP,
			"elapsed_ms", elapsed.Milliseconds(),
			"error_class", errClass,
			"status", httpStatus,
		)
	}()

	// CORS Authorization
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	var isAllowedOrigin bool
	if origin != "" {
		if match, ok := httputil.MatchOrigin(s.allowedOrigins, origin); ok {
			isAllowedOrigin = true
			w.Header().Set("Access-Control-Allow-Origin", match)
			w.Header().Set("Vary", "Origin")
		}
	}

	if r.Method == http.MethodOptions {
		httpStatus = http.StatusNoContent
		if isAllowedOrigin {
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, "+asrRelayPublicTokenHeader)
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		httpStatus = http.StatusMethodNotAllowed
		errClass = "invalid_method"
		route = "asr-relay"
		writeASRRelayError(r.Context(), w, http.StatusMethodNotAllowed, "only POST is allowed", "ASR_INVALID_METHOD", nil)
		return
	}
	if relayErr := s.authorizeRequest(r); relayErr != nil {
		httpStatus = relayErr.Status
		errClass = asrErrClass(relayErr.Code)
		route = "asr-relay"
		writeASRRelayError(r.Context(), w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
		return
	}

	switch r.URL.Path {
	case RelayRoute:
		route = "asr-relay/transcriptions"
		payload, relayErr := s.decodeMultipartRelayPayload(w, r)
		if relayErr != nil {
			httpStatus = relayErr.Status
			errClass = asrErrClass(relayErr.Code)
			writeASRRelayError(r.Context(), w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
			return
		}
		metricProviderLabel = payload.Provider
		metricModeLabel = observability.ResolveASRRelayMode(payload.Provider, s.asrMetricTransport())
		upstreamKind, upstreamHost = s.transcribeRequestUpstream(payload.Provider)
		result, relayErr := s.transcribe(r.Context(), *payload)
		if relayErr != nil {
			httpStatus = relayErr.Status
			errClass = asrErrClass(relayErr.Code)
			writeASRRelayError(r.Context(), w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
			return
		}
		httpStatus = http.StatusOK
		writeJSON(w, http.StatusOK, result)
	case VerifyRoute:
		route = "asr-relay/verify"
		if ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))); ct == "" || !strings.HasPrefix(ct, "application/json") {
			httpStatus = http.StatusBadRequest
			errClass = "invalid_payload"
			writeASRRelayError(r.Context(), w, http.StatusBadRequest, "content-type must be application/json", "ASR_INVALID_PAYLOAD", nil)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, asrRelayVerifyBodyLimit+1))
		if err != nil {
			httpStatus = http.StatusBadRequest
			errClass = "invalid_payload"
			writeASRRelayError(r.Context(), w, http.StatusBadRequest, "invalid relay request payload", "ASR_INVALID_PAYLOAD", nil)
			return
		}
		if int64(len(body)) > asrRelayVerifyBodyLimit {
			httpStatus = http.StatusRequestEntityTooLarge
			errClass = "payload_too_large"
			writeASRRelayError(r.Context(), w, http.StatusRequestEntityTooLarge, "relay request body too large", "ASR_PAYLOAD_TOO_LARGE", nil)
			return
		}
		var payload asrVerifyRequestPayload
		if err := decodeStrictJSON(body, &payload); err != nil {
			httpStatus = http.StatusBadRequest
			errClass = "invalid_payload"
			writeASRRelayError(r.Context(), w, http.StatusBadRequest, "invalid relay request payload", "ASR_INVALID_PAYLOAD", nil)
			return
		}
		metricProviderLabel = strings.TrimSpace(payload.Provider)
		if metricProviderLabel == "" {
			metricProviderLabel = "unknown"
		}
		upstreamKind, upstreamHost = s.verifyRequestUpstream(payload.Provider)
		ok, relayErr := s.verify(r.Context(), payload)
		if relayErr != nil {
			httpStatus = relayErr.Status
			errClass = asrErrClass(relayErr.Code)
			writeASRRelayError(r.Context(), w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
			return
		}
		if !ok {
			httpStatus = http.StatusUnauthorized
			errClass = "unauthorized"
			writeASRRelayError(r.Context(), w, http.StatusUnauthorized, "provider rejected credentials", "ASR_UNAUTHORIZED", nil)
			return
		}
		httpStatus = http.StatusOK
		writeJSON(w, http.StatusOK, asrVerifyResponsePayload{OK: ok})
	default:
		httpStatus = http.StatusNotFound
		route = "asr-relay"
		http.NotFound(w, r)
		return
	}
}

func (s *asrRelayService) authorizeRequest(r *http.Request) *asrRelayErrorPayload {
	if s.limiter != nil && !s.limiter.Allow(clientip.EffectiveClientIP(r, s.trustedProxies)) {
		return &asrRelayErrorPayload{
			Status:  http.StatusTooManyRequests,
			Code:    "ASR_RATE_LIMITED",
			Message: "rate limit exceeded",
		}
	}

	if originErr := s.originAuthorizationError(r); originErr != nil {
		return originErr
	}

	if token := strings.TrimSpace(s.relayPublicToken); token != "" {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get(asrRelayPublicTokenHeader)), []byte(token)) != 1 {
			return &asrRelayErrorPayload{
				Status:  http.StatusUnauthorized,
				Code:    "ASR_UNAUTHORIZED",
				Message: "invalid relay token",
			}
		}
	}

	return nil
}

func (s *asrRelayService) originAuthorizationError(r *http.Request) *asrRelayErrorPayload {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		s.logOriginAuthorizationFailure(r, "ASR_MISSING_OR_DISALLOWED_ORIGIN")
		return &asrRelayErrorPayload{
			Status:  http.StatusForbidden,
			Code:    "ASR_MISSING_OR_DISALLOWED_ORIGIN",
			Message: "missing or disallowed origin",
		}
	}
	if !s.isAllowedOrigin(r) {
		s.logOriginAuthorizationFailure(r, "ASR_ORIGIN_NOT_ALLOWED")
		return &asrRelayErrorPayload{
			Status:  http.StatusForbidden,
			Code:    "ASR_ORIGIN_NOT_ALLOWED",
			Message: "missing or disallowed origin",
		}
	}
	return nil
}

func (s *asrRelayService) logOriginAuthorizationFailure(r *http.Request, code string) {
	requestScheme, requestHost, requestContextOK := httputil.ProxyRequestOriginContext(r, s.trustedProxies)

	peerHost, _, splitOK := net.SplitHostPort(r.RemoteAddr)
	peerIP := net.ParseIP(peerHost)
	trustedProxyMatch := peerIP != nil && s.trustedProxies.Contains(peerIP)
	loopbackPeer := peerIP != nil && peerIP.IsLoopback()

	slog.WarnContext(r.Context(), "asr relay origin authorization failed",
		"code", code,
		"remote_addr", r.RemoteAddr,
		"host", r.Host,
		"origin", sanitizedURLForLog(r.Header.Get("Origin")),
		"referer", sanitizedURLForLog(r.Header.Get("Referer")),
		"x_forwarded_proto", strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")),
		"x_forwarded_for_present", strings.TrimSpace(r.Header.Get("X-Forwarded-For")) != "",
		"x_real_ip", strings.TrimSpace(r.Header.Get("X-Real-IP")),
		"trusted_proxy_match", trustedProxyMatch,
		"loopback_peer", loopbackPeer,
		"tls", r.TLS != nil,
		"resolved_request_scheme", requestScheme,
		"resolved_request_host", requestHost,
		"request_context_ok", requestContextOK,
		"remote_addr_split_ok", splitOK,
	)
}

func sanitizedURLForLog(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "invalid"
	}
	return parsed.Scheme + "://" + parsed.Host
}

// normalizeHostPort returns (hostname, effectivePort) from a host:port string.
// If no port is specified, returns the default port for the given scheme.
func normalizeHostPort(hostPort string, scheme string) (string, int) {
	host, portStr, err := net.SplitHostPort(hostPort)
	if err != nil {
		host = hostPort
		portStr = ""
	}
	if portStr == "" {
		switch scheme {
		case "https":
			return host, 443
		case "http":
			return host, 80
		default:
			return host, 0
		}
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return host, 0
	}
	return host, port
}

// httputil.IsSameOrigin compares two origins accounting for default port normalization.

func (s *asrRelayService) isAllowedOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}

	if len(s.allowedOrigins) > 0 {
		_, ok := httputil.MatchOrigin(s.allowedOrigins, origin)
		return ok
	}

	requestScheme, requestHost, ok := httputil.ProxyRequestOriginContext(r, s.trustedProxies)
	if !ok {
		return false
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return httputil.IsSameOrigin(parsed.Scheme, parsed.Host, requestScheme, requestHost)
}

func writeASRRelayError(ctx context.Context, w http.ResponseWriter, status int, message string, code string, retryAfterMs *int64) {
	requestID := httputil.GenerateRequestID()
	payload := asrRelayErrorPayload{
		Status:    status,
		Code:      code,
		Message:   message,
		RequestID: requestID,
	}
	if retryAfterMs != nil {
		payload.RetryAfterMs = retryAfterMs
		w.Header().Set("Retry-After", strconv.FormatInt(*retryAfterMs/1000, 10))
	}
	writeJSON(w, status, payload)
	slog.InfoContext(ctx, "asr relay error response", "request_id", requestID, "code", code, "status", status)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// asrErrClass maps public ASR error codes to low-cardinality observability classes.
// Public codes (ASR_*) must never leak into error_class, which is used for
// metrics aggregation and must remain stable and bounded.
func asrErrClass(code string) string {
	switch code {
	case "ASR_INVALID_METHOD", "ASR_INVALID_PAYLOAD":
		return "invalid_request"
	case "ASR_UNAUTHORIZED", "ASR_MISSING_OR_DISALLOWED_ORIGIN", "ASR_ORIGIN_NOT_ALLOWED":
		return "unauthorized"
	case "ASR_RATE_LIMITED":
		return "rate_limit"
	case "ASR_UNSUPPORTED_PROVIDER", "ASR_CLIENT_ERROR":
		return "client_error"
	case "ASR_SERVICE_UNAVAILABLE":
		return "service_unavailable"
	case "ASR_PAYLOAD_TOO_LARGE":
		return "payload_too_large"
	default:
		return "unknown"
	}
}
