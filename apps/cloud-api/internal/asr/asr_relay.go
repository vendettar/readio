// Package asr provides the ASR relay server endpoints.
package asr

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
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

func relayAudioUploadFileName(audioMimeType string) string {
	lowerMime := strings.ToLower(audioMimeType)
	switch {
	case strings.Contains(lowerMime, "wav"):
		return "input.wav"
	case strings.Contains(lowerMime, "mp4"), strings.Contains(lowerMime, "m4a"), strings.Contains(lowerMime, "x-m4a"):
		return "input.m4a"
	case strings.Contains(lowerMime, "webm"):
		return "input.webm"
	case strings.Contains(lowerMime, "ogg"):
		return "input.ogg"
	case strings.Contains(lowerMime, "flac"):
		return "input.flac"
	case strings.Contains(lowerMime, "aac"):
		return "input.aac"
	default:
		return "input.mp3"
	}
}

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

func defaultASRRelayProviders() map[string]asrRelayProviderConfig {
	return map[string]asrRelayProviderConfig{
		"groq": {
			id:             "groq",
			label:          "Groq",
			transcribeURL:  "https://api.groq.com/openai/v1/audio/transcriptions",
			verifyURL:      "https://api.groq.com/openai/v1/models",
			responseFormat: "verbose_json",
			allowedModels: map[string]struct{}{
				"whisper-large-v3-turbo": {},
				"whisper-large-v3":       {},
			},
			transport: "openai-compatible",
		},
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

func resolveASRRelayAllowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv(asrRelayAllowedOriginsEnv))
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

func resolveASRRelayRateLimitBurst() int {
	return envIntOrDefaultAllowNonPositive(asrRelayRateLimitBurstEnv, asrRelayRateLimitBurst)
}

func resolveASRRelayRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(asrRelayRateLimitWindowMsEnv, asrRelayRateLimitWindow)
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
		slog.Warn("invalid duration environment value; using default", "env", name, "unit", "ms")
		return fallback
	}
	return time.Duration(value) * time.Millisecond
}

func (s *asrRelayService) decodeMultipartRelayPayload(
	w http.ResponseWriter,
	r *http.Request,
) (*asrRelayRequestPayload, *asrRelayErrorPayload) {
	ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if ct == "" || !strings.HasPrefix(ct, "multipart/form-data") {
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "ASR_INVALID_PAYLOAD",
			Message: "content-type must be multipart/form-data",
		}
	}

	// Limit memory usage for multipart parsing to 2MB. Larger files go to disk.
	const memoryLimit = 2 << 20
	r.Body = http.MaxBytesReader(w, r.Body, s.bodyLimit)
	if err := r.ParseMultipartForm(memoryLimit); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return nil, &asrRelayErrorPayload{
				Status:  http.StatusRequestEntityTooLarge,
				Code:    "ASR_PAYLOAD_TOO_LARGE",
				Message: "relay request body too large",
			}
		}
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "ASR_INVALID_PAYLOAD",
			Message: "invalid relay request payload",
		}
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "ASR_INVALID_PAYLOAD",
			Message: "missing audio payload",
		}
	}
	if header.Size <= 0 {
		_ = file.Close()
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		return nil, ErrASRInvalidAudio
	}

	// Wrap file and form in a custom ReadCloser to ensure cleanup
	reader := &asrMultipartReadCloser{
		File: file,
		form: r.MultipartForm,
	}

	return &asrRelayRequestPayload{
		Provider:      r.FormValue("provider"),
		Model:         r.FormValue("model"),
		APIKey:        r.FormValue("apiKey"),
		AudioReader:   reader,
		AudioSize:     header.Size,
		AudioMimeType: r.FormValue("audioMimeType"),
	}, nil
}

type asrMultipartReadCloser struct {
	multipart.File
	form *multipart.Form
}

func (m *asrMultipartReadCloser) Close() error {
	fileErr := m.File.Close()
	var formErr error
	if m.form != nil {
		formErr = m.form.RemoveAll()
	}
	if fileErr != nil {
		return fileErr
	}
	return formErr
}

func decodeStrictJSON[T any](body []byte, out *T) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return err
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); err != io.EOF {
		return err
	}
	return nil
}

func (s *asrRelayService) transcribe(ctx context.Context, payload asrRelayRequestPayload) (*ASRRelayResponsePayload, *asrRelayErrorPayload) {
	if payload.AudioReader == nil {
		return nil, ErrASRInvalidAudio
	}
	defer func() { _ = payload.AudioReader.Close() }()

	provider, ok := s.providers[strings.ToLower(strings.TrimSpace(payload.Provider))]
	if !ok {
		return nil, ErrASRUnsupportedProvider
	}

	model := strings.TrimSpace(payload.Model)
	if model == "" {
		return nil, ErrASRMissingModel
	}
	if _, ok := provider.allowedModels[model]; !ok {
		return nil, ErrASRUnsupportedModel
	}

	apiKey := strings.TrimSpace(payload.APIKey)
	if apiKey == "" {
		return nil, ErrASRMissingAPIKey
	}

	audioMimeType := strings.TrimSpace(payload.AudioMimeType)
	if audioMimeType == "" {
		audioMimeType = "audio/mpeg"
	}

	transportMode := "direct"
	if s.asrWorkerTransportEnabled() && provider.id == "groq" {
		transportMode = "worker"
	}

	logger := slog.Default()
	logger.Info("asr relay request", "provider", provider.id, "model", model, "audioSize", payload.AudioSize, "transport", transportMode)

	client := s.client
	if client == nil {
		client = &http.Client{}
	}

	timeout := s.timeout
	if timeout <= 0 {
		timeout = asrRelayRequestTimeout
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Worker transport: only Groq transcription submit. The worker hop is a
	// first-party endpoint where outbound trace propagation is desired, so
	// it uses workerClient (instrumented transport) instead of the direct
	// third-party client.
	if transportMode == "worker" {
		workerClient := s.workerClient
		if workerClient == nil {
			workerClient = client
		}
		start := time.Now()
		result, relayErr, hopError := s.transcribeViaWorker(reqCtx, workerClient, provider, model, apiKey, payload.AudioReader, audioMimeType)
		duration := time.Since(start)
		if relayErr != nil {
			if hopError {
				// Worker hop itself failed (network, auth, misconfigured).
				// Fall through to direct transport.
				logger.Warn("asr worker hop failed, falling back to direct",
					"provider", provider.id, "duration_ms", duration.Milliseconds(),
					"status", relayErr.Status, "code", relayErr.Code)

				// Reset reader for retry if it supports seeking
				if seeker, ok := payload.AudioReader.(io.Seeker); ok {
					if _, err := seeker.Seek(0, io.SeekStart); err != nil {
						logger.Error("failed to seek audio reader for retry", "error", err)
						return nil, relayErr
					}
				}
			} else {
				// Groq upstream error transparently forwarded by Worker.
				logger.Warn("asr worker transport returned upstream error",
					"provider", provider.id, "duration_ms", duration.Milliseconds(),
					"status", relayErr.Status, "code", relayErr.Code)
				return nil, relayErr
			}
		} else {
			logger.Info("asr worker transport success",
				"provider", provider.id, "duration_ms", duration.Milliseconds())
			return result, nil
		}
	}

	switch provider.transport {
	case "openai-compatible":
		start := time.Now()
		result, relayErr := s.transcribeOpenAICompatible(reqCtx, client, provider, model, apiKey, payload.AudioReader, audioMimeType)
		duration := time.Since(start)
		if relayErr != nil {
			logger.Warn("asr direct transport failed",
				"provider", provider.id, "duration_ms", duration.Milliseconds(),
				"status", relayErr.Status, "code", relayErr.Code)
		} else {
			logger.Info("asr direct transport success",
				"provider", provider.id, "duration_ms", duration.Milliseconds())
		}
		return result, relayErr
	default:
		return nil, ErrASRUnsupportedTransport
	}
}

// asrWorkerTransportEnabled returns true when both Worker base URL
// and shared secret are configured, enabling the Worker egress hop.
func (s *asrRelayService) asrWorkerTransportEnabled() bool {
	return s.workerBaseURL != "" && s.workerSharedSecret != ""
}

func (s *asrRelayService) asrMetricTransport() observability.ASRRelayTransport {
	if s.asrWorkerTransportEnabled() {
		return observability.ASRRelayTransportWorker
	}
	return observability.ASRRelayTransportDirect
}

// transcribeViaWorker sends audio to the Cloudflare Worker egress hop,
// which forwards to the Groq upstream. The request body is built as
// the same multipart/form-data that Groq expects, so the Worker can
// stream it through without buffering or parsing.
//
// The third return value (hopError) distinguishes Worker-hop failures
// (network, auth, misconfigured — fallback-eligible) from transparent
// Groq upstream errors (not fallback-eligible, since direct would fail
// the same way and waste rate-limit budget).
func (s *asrRelayService) transcribeViaWorker(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	model string,
	apiKey string,
	audioReader io.Reader,
	audioMimeType string,
) (*ASRRelayResponsePayload, *asrRelayErrorPayload, bool) {
	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	go func() {
		var err error
		defer func() {
			_ = writer.Close()
			_ = pw.CloseWithError(err)
		}()

		// Build the same multipart body that transcribeOpenAICompatible builds.
		fileName := relayAudioUploadFileName(audioMimeType)
		part, err := writer.CreateFormFile("file", fileName)
		if err != nil {
			return
		}
		if _, err = io.Copy(part, audioReader); err != nil {
			return
		}
		_ = writer.WriteField("model", model)
		_ = writer.WriteField("response_format", provider.responseFormat)
		_ = writer.WriteField("temperature", "0")
		_ = writer.WriteField("timestamp_granularities[]", "segment")
		_ = writer.WriteField("timestamp_granularities[]", "word")
	}()

	workerURL := strings.TrimRight(s.workerBaseURL, "/") + asrWorkerGroqRoute

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, workerURL, pr)
	if err != nil {
		return nil, asrRelayInternalError("failed to create worker request"), true
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set(asrWorkerSecretHeader, s.workerSharedSecret)

	resp, err := client.Do(req)
	if err != nil {
		// Network-level failure reaching the Worker: hop error, fallback-eligible.
		return nil, mapASRRelayTransportError(err), true
	}
	defer func() { _ = resp.Body.Close() }()

	// Detect Worker-hop errors vs transparent Groq responses.
	//
	// Rule: 401 (with Worker's own body) and any 5xx are treated as
	// hop errors (fallback-eligible).
	// We treat 5xx as hop errors because even if it's a real Groq 5xx,
	// retrying direct is safer than assuming the Worker's 5xx is from Groq.
	// (Groq only returns 5xx for rare infra issues).
	// Most notably, 502/504 from the Worker itself reaching Groq must be retried.
	if resp.StatusCode >= 500 {
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusServiceUnavailable,
			Code:    "ASR_SERVICE_UNAVAILABLE",
			Message: "worker hop failed or upstream unavailable",
		}, true
	}

	// Also treat Worker's own auth failure as a hop error.
	if resp.StatusCode == http.StatusUnauthorized {
		// Peek at the body to distinguish Worker auth error vs Groq auth error.
		bodyBytes, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024))
		if readErr == nil {
			var workerErr struct {
				Error string `json:"error"`
			}
			if json.Unmarshal(bodyBytes, &workerErr) == nil && (workerErr.Error == "unauthorized" || workerErr.Error == "misconfigured") {
				// Worker rejected our secret or is misconfigured — hop error.
				return nil, &asrRelayErrorPayload{
					Status:  http.StatusServiceUnavailable,
					Code:    "ASR_SERVICE_UNAVAILABLE",
					Message: "worker auth failed or misconfigured",
				}, true
			}
		}
		// Otherwise it's Groq's 401 forwarded through the Worker.
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusUnauthorized,
			Code:    "ASR_UNAUTHORIZED",
			Message: "provider rejected credentials",
		}, false
	}

	// All other responses: parse as transparent Groq response.
	result, relayErr := parseOpenAICompatibleRelayResponse(resp, provider, model)
	if relayErr != nil {
		// All non-500 upstream errors (429, 400, etc.) are NOT fallback-eligible.
		return nil, relayErr, false
	}
	return result, nil, false
}

func (s *asrRelayService) verify(ctx context.Context, payload asrVerifyRequestPayload) (bool, *asrRelayErrorPayload) {
	provider, ok := s.providers[strings.ToLower(strings.TrimSpace(payload.Provider))]
	if !ok {
		return false, ErrASRUnsupportedProvider
	}

	apiKey := strings.TrimSpace(payload.APIKey)
	if apiKey == "" {
		return false, ErrASRMissingAPIKey
	}

	client := s.client
	if client == nil {
		client = &http.Client{}
	}

	timeout := s.timeout
	if timeout <= 0 {
		timeout = asrRelayRequestTimeout
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	switch provider.transport {
	case "openai-compatible":
		return s.verifyOpenAICompatible(reqCtx, client, provider, apiKey)
	default:
		return false, ErrASRUnsupportedTransport
	}
}

func (s *asrRelayService) transcribeOpenAICompatible(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	model string,
	apiKey string,
	audioReader io.Reader,
	audioMimeType string,
) (*ASRRelayResponsePayload, *asrRelayErrorPayload) {
	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	go func() {
		var err error
		defer func() {
			_ = writer.Close()
			_ = pw.CloseWithError(err)
		}()

		fileName := relayAudioUploadFileName(audioMimeType)
		part, err := writer.CreateFormFile("file", fileName)
		if err != nil {
			return
		}
		if _, err = io.Copy(part, audioReader); err != nil {
			return
		}
		_ = writer.WriteField("model", model)
		_ = writer.WriteField("response_format", provider.responseFormat)
		_ = writer.WriteField("temperature", "0")
		_ = writer.WriteField("timestamp_granularities[]", "segment")
		_ = writer.WriteField("timestamp_granularities[]", "word")
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.transcribeURL, pr)
	if err != nil {
		return nil, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := client.Do(req)
	if err != nil {
		return nil, mapASRRelayTransportError(err)
	}
	defer func() { _ = resp.Body.Close() }()

	return parseOpenAICompatibleRelayResponse(resp, provider, model)
}

func (s *asrRelayService) verifyOpenAICompatible(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	apiKey string,
) (bool, *asrRelayErrorPayload) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.verifyURL, nil)
	if err != nil {
		return false, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return false, mapASRRelayTransportError(err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, asrRelayStatusToError(resp)
	}
	return true, nil
}

func parseOpenAICompatibleRelayResponse(resp *http.Response, provider asrRelayProviderConfig, model string) (*ASRRelayResponsePayload, *asrRelayErrorPayload) {
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, asrRelayStatusToError(resp)
	}

	var payload struct {
		Language string  `json:"language"`
		Duration float64 `json:"duration"`
		Segments []struct {
			Start float64 `json:"start"`
			End   float64 `json:"end"`
			Text  string  `json:"text"`
			Words []struct {
				Word       string   `json:"word"`
				Start      float64  `json:"start"`
				End        float64  `json:"end"`
				Confidence *float64 `json:"confidence"`
			} `json:"words"`
		} `json:"segments"`
		Text string `json:"text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, asrRelayInternalError("invalid provider response payload")
	}

	cues := make([]ASRRelayCue, 0, len(payload.Segments))
	for _, seg := range payload.Segments {
		if strings.TrimSpace(seg.Text) == "" {
			continue
		}
		cue := ASRRelayCue{Start: seg.Start, End: seg.End, Text: strings.TrimSpace(seg.Text)}
		if len(seg.Words) > 0 {
			cue.Words = make([]ASRRelayWord, 0, len(seg.Words))
			for _, word := range seg.Words {
				if strings.TrimSpace(word.Word) == "" {
					continue
				}
				cue.Words = append(cue.Words, ASRRelayWord{
					Word:       strings.TrimSpace(word.Word),
					Start:      word.Start,
					End:        word.End,
					Confidence: word.Confidence,
				})
			}
		}
		cues = append(cues, cue)
	}
	if len(cues) == 0 && strings.TrimSpace(payload.Text) != "" {
		duration := payload.Duration
		cues = append(cues, ASRRelayCue{Start: 0, End: duration, Text: strings.TrimSpace(payload.Text)})
	}

	var durationSeconds *float64
	if payload.Duration > 0 {
		durationSeconds = &payload.Duration
	}

	return &ASRRelayResponsePayload{
		Cues:            cues,
		Language:        payload.Language,
		DurationSeconds: durationSeconds,
		Provider:        provider.id,
		Model:           model,
	}, nil
}

func asrRelayStatusToError(resp *http.Response) *asrRelayErrorPayload {
	retryAfterMs := parseRetryAfterHeader(resp.Header.Get("Retry-After"))
	var base *asrRelayErrorPayload
	switch resp.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		base = ErrASRProviderRejectedCreds
	case http.StatusRequestEntityTooLarge:
		base = ErrASRProviderRejectedPayload
	case http.StatusTooManyRequests:
		base = ErrASRProviderRateLimited
	default:
		if resp.StatusCode >= 500 {
			base = ErrASRProviderUnavailable
		} else {
			base = ErrASRProviderClientError
		}
	}

	if resp.Body != nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, asrRelayStatusBodyReadLimit))
	}

	payload := &asrRelayErrorPayload{
		Status:  base.Status,
		Code:    base.Code,
		Message: base.Message,
	}

	if retryAfterMs != nil && *retryAfterMs > 0 {
		payload.RetryAfterMs = retryAfterMs
	}
	return payload
}

func asrRelayInternalError(message string) *asrRelayErrorPayload {
	return &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "ASR_SERVICE_UNAVAILABLE", Message: message}
}

func mapASRRelayTransportError(err error) *asrRelayErrorPayload {
	if err == nil {
		return asrRelayInternalError("upstream request failed")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return ErrASRUpstreamTimeout
	}
	if errors.Is(err, context.Canceled) {
		return ErrASRRequestCanceled
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) && errors.Is(urlErr.Err, context.DeadlineExceeded) {
		return ErrASRUpstreamTimeout
	}
	return ErrASRUpstreamFailed
}

func parseRetryAfterHeader(value string) *int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil {
		ms := seconds * 1000
		return &ms
	}
	if t, err := http.ParseTime(value); err == nil {
		ms := time.Until(t).Milliseconds()
		if ms < 0 {
			ms = 0
		}
		return &ms
	}
	return nil
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

func (s *asrRelayService) transcribeRequestUpstream(providerID string) (string, string) {
	return s.requestUpstream(providerID, func(provider asrRelayProviderConfig) string {
		return provider.transcribeURL
	})
}

func (s *asrRelayService) verifyRequestUpstream(providerID string) (string, string) {
	return s.requestUpstream(providerID, func(provider asrRelayProviderConfig) string {
		return provider.verifyURL
	})
}

func (s *asrRelayService) requestUpstream(providerID string, targetURL func(asrRelayProviderConfig) string) (string, string) {
	providerKey := strings.ToLower(strings.TrimSpace(providerID))
	if providerKey == "" {
		return "", ""
	}
	provider, ok := s.providers[providerKey]
	if !ok {
		return "asr-" + providerKey, ""
	}
	return "asr-" + provider.id, hostFromURL(targetURL(provider))
}

func hostFromURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Host
}

// newASRWorkerHTTPClient returns an http.Client whose transport is wrapped
// with the project's instrumented transport. Trace propagation is enabled
// because the worker is a first-party Readio service. The base transport is
// http.DefaultTransport so existing redirect/timeout behavior is preserved
// (per-request timeouts continue to be applied via context.WithTimeout in the
// caller, matching the direct client).
func newASRWorkerHTTPClient() *http.Client {
	return &http.Client{
		Transport: observability.NewPropagatingInstrumentedTransport(http.DefaultTransport),
	}
}
