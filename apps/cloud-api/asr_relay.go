package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const asrRelayRoute = "/api/v1/asr/transcriptions"
const asrVerifyRoute = "/api/v1/asr/verify"
const asrRelayTokenHeader = "X-Readio-Relay-Token"
const asrRelayTokenEnv = "READIO_ASR_RELAY_TOKEN"
const asrRelayAllowedOriginsEnv = "READIO_ASR_ALLOWED_ORIGINS"
const asrRelayRateLimitBurstEnv = "READIO_ASR_RATE_LIMIT_BURST"
const asrRelayRateLimitWindowMsEnv = "READIO_ASR_RATE_LIMIT_WINDOW_MS"

const asrRelayBodyLimit = 20 << 20
const asrRelayRequestTimeout = 60 * time.Second
const asrRelayRateLimitWindow = time.Minute
const asrRelayRateLimitBurst = 60

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
	AudioBytes    []byte
	AudioMimeType string
}

type asrRelayResponsePayload struct {
	Cues            []asrRelayCue `json:"cues"`
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

type asrRelayCue struct {
	Start     float64        `json:"start"`
	End       float64        `json:"end"`
	Text      string         `json:"text"`
	Words     []asrRelayWord `json:"words,omitempty"`
	SpeakerID string         `json:"speakerId,omitempty"`
}

type asrRelayWord struct {
	Word       string   `json:"word"`
	Start      float64  `json:"start"`
	End        float64  `json:"end"`
	Confidence *float64 `json:"confidence,omitempty"`
}

type asrRelayErrorPayload struct {
	Code         string `json:"code"`
	Message      string `json:"message"`
	Status       int    `json:"status"`
	RetryAfterMs *int64 `json:"retryAfterMs,omitempty"`
}

type asrRelayService struct {
	client         *http.Client
	timeout        time.Duration
	bodyLimit      int64
	providers      map[string]asrRelayProviderConfig
	limiter        *rateLimiter
	allowedOrigins map[string]struct{}
	relayToken     string
}

func newASRRelayService() *asrRelayService {
	return &asrRelayService{
		client:         &http.Client{},
		timeout:        asrRelayRequestTimeout,
		bodyLimit:      asrRelayBodyLimit,
		providers:      defaultASRRelayProviders(),
		limiter:        newRateLimiter(resolveASRRelayRateLimitBurst(), resolveASRRelayRateLimitWindow(), time.Now),
		allowedOrigins: resolveASRRelayAllowedOrigins(),
		relayToken:     strings.TrimSpace(os.Getenv(asrRelayTokenEnv)),
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
		"qwen": {
			id:             "qwen",
			label:          "Qwen",
			transcribeURL:  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
			verifyURL:      "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
			responseFormat: "chat",
			allowedModels: map[string]struct{}{
				"qwen3-asr-flash":    {},
				"qwen3-asr-flash-us": {},
			},
			transport: "qwen-chat-completions",
		},
		"deepgram": {
			id:             "deepgram",
			label:          "Deepgram",
			transcribeURL:  "https://api.deepgram.com/v1/listen",
			verifyURL:      "https://api.deepgram.com/v1/projects",
			responseFormat: "json",
			allowedModels: map[string]struct{}{
				"nova-3":  {},
				"nova-2":  {},
				"nova":    {},
				"base":    {},
				"whisper": {},
			},
			transport: "deepgram-native",
		},
		"volcengine": {
			id:             "volcengine",
			label:          "Volcengine",
			transcribeURL:  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
			verifyURL:      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
			responseFormat: "json",
			allowedModels: map[string]struct{}{
				"bigmodel": {},
			},
			transport: "volcengine-asr",
		},
	}
}

func (s *asrRelayService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeASRRelayError(w, http.StatusMethodNotAllowed, "only POST is allowed", "invalid_method", nil)
		return
	}
	if relayErr := s.authorizeRequest(r); relayErr != nil {
		writeASRRelayError(w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
		return
	}

	switch r.URL.Path {
	case asrRelayRoute:
		payload, relayErr := s.decodeMultipartRelayPayload(w, r)
		if relayErr != nil {
			writeASRRelayError(w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
			return
		}
		result, relayErr := s.transcribe(r.Context(), *payload)
		if relayErr != nil {
			writeASRRelayError(w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
			return
		}
		writeJSON(w, http.StatusOK, result)
	case asrVerifyRoute:
		if ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))); ct == "" || !strings.HasPrefix(ct, "application/json") {
			writeASRRelayError(w, http.StatusBadRequest, "content-type must be application/json", "invalid_payload", nil)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, s.bodyLimit+1))
		if err != nil {
			writeASRRelayError(w, http.StatusBadRequest, "invalid relay request payload", "invalid_payload", nil)
			return
		}
		if int64(len(body)) > s.bodyLimit {
			writeASRRelayError(w, http.StatusRequestEntityTooLarge, "relay request body too large", "payload_too_large", nil)
			return
		}
		var payload asrVerifyRequestPayload
		if err := decodeStrictJSON(body, &payload); err != nil {
			writeASRRelayError(w, http.StatusBadRequest, "invalid relay request payload", "invalid_payload", nil)
			return
		}
		ok, relayErr := s.verify(r.Context(), payload)
		if relayErr != nil {
			writeASRRelayError(w, relayErr.Status, relayErr.Message, relayErr.Code, relayErr.RetryAfterMs)
			return
		}
		if !ok {
			writeASRRelayError(w, http.StatusUnauthorized, "provider rejected credentials", "unauthorized", nil)
			return
		}
		writeJSON(w, http.StatusOK, asrVerifyResponsePayload{OK: ok})
	default:
		http.NotFound(w, r)
		return
	}
}

func (s *asrRelayService) authorizeRequest(r *http.Request) *asrRelayErrorPayload {
	if !s.isAllowedOrigin(r) {
		return &asrRelayErrorPayload{
			Status:  http.StatusForbidden,
			Code:    "forbidden",
			Message: "origin is not allowed",
		}
	}

	if token := strings.TrimSpace(s.relayToken); token != "" {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get(asrRelayTokenHeader)), []byte(token)) != 1 {
			return &asrRelayErrorPayload{
				Status:  http.StatusUnauthorized,
				Code:    "unauthorized",
				Message: "invalid relay token",
			}
		}
	}

	if s.limiter != nil && !s.limiter.allow(remoteIP(r.RemoteAddr)) {
		return &asrRelayErrorPayload{
			Status:  http.StatusTooManyRequests,
			Code:    "rate_limited",
			Message: "rate limit exceeded",
		}
	}

	return nil
}

func (s *asrRelayService) isAllowedOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}

	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || parsed.User != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}

	normalized := parsed.Scheme + "://" + parsed.Host
	if len(s.allowedOrigins) > 0 {
		_, ok := s.allowedOrigins[normalized]
		return ok
	}

	requestHost := strings.TrimSpace(r.Host)
	return requestHost != "" && strings.EqualFold(parsed.Host, requestHost)
}

func resolveASRRelayAllowedOrigins() map[string]struct{} {
	raw := strings.TrimSpace(os.Getenv(asrRelayAllowedOriginsEnv))
	if raw == "" {
		return nil
	}

	origins := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}
		parsed, err := url.Parse(candidate)
		if err != nil || parsed.Host == "" || parsed.User != nil {
			continue
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			continue
		}
		origins[parsed.Scheme+"://"+parsed.Host] = struct{}{}
	}

	if len(origins) == 0 {
		return nil
	}
	return origins
}

func resolveASRRelayRateLimitBurst() int {
	raw := strings.TrimSpace(os.Getenv(asrRelayRateLimitBurstEnv))
	if raw == "" {
		return asrRelayRateLimitBurst
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return asrRelayRateLimitBurst
	}
	return value
}

func resolveASRRelayRateLimitWindow() time.Duration {
	raw := strings.TrimSpace(os.Getenv(asrRelayRateLimitWindowMsEnv))
	if raw == "" {
		return asrRelayRateLimitWindow
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return asrRelayRateLimitWindow
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
			Code:    "invalid_payload",
			Message: "content-type must be multipart/form-data",
		}
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.bodyLimit)
	if err := r.ParseMultipartForm(s.bodyLimit); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return nil, &asrRelayErrorPayload{
				Status:  http.StatusRequestEntityTooLarge,
				Code:    "payload_too_large",
				Message: "relay request body too large",
			}
		}
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "invalid_payload",
			Message: "invalid relay request payload",
		}
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	file, _, err := r.FormFile("audio")
	if err != nil {
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "invalid_payload",
			Message: "missing audio payload",
		}
	}
	defer file.Close()

	audioBytes, err := io.ReadAll(file)
	if err != nil || len(audioBytes) == 0 {
		return nil, &asrRelayErrorPayload{
			Status:  http.StatusBadRequest,
			Code:    "invalid_payload",
			Message: "invalid audio payload",
		}
	}

	return &asrRelayRequestPayload{
		Provider:      r.FormValue("provider"),
		Model:         r.FormValue("model"),
		APIKey:        r.FormValue("apiKey"),
		AudioBytes:    audioBytes,
		AudioMimeType: r.FormValue("audioMimeType"),
	}, nil
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

func (s *asrRelayService) transcribe(ctx context.Context, payload asrRelayRequestPayload) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	provider, ok := s.providers[strings.ToLower(strings.TrimSpace(payload.Provider))]
	if !ok {
		return nil, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "unsupported_provider", Message: "unsupported ASR provider"}
	}

	model := strings.TrimSpace(payload.Model)
	if model == "" {
		return nil, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "invalid_payload", Message: "missing model"}
	}
	if _, ok := provider.allowedModels[model]; !ok {
		return nil, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "invalid_payload", Message: "unsupported ASR model"}
	}

	apiKey := strings.TrimSpace(payload.APIKey)
	if apiKey == "" {
		return nil, &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "missing ASR API key"}
	}

	audioBytes := payload.AudioBytes
	if len(audioBytes) == 0 {
		return nil, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "invalid_payload", Message: "invalid audio payload"}
	}

	audioMimeType := strings.TrimSpace(payload.AudioMimeType)
	if audioMimeType == "" {
		audioMimeType = "audio/mpeg"
	}

	logger := slog.Default()
	logger.Info("asr relay request", "provider", provider.id, "model", model, "audioBytes", len(audioBytes))

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
		return s.transcribeOpenAICompatible(reqCtx, client, provider, model, apiKey, audioBytes, audioMimeType)
	case "qwen-chat-completions":
		return s.transcribeQwen(reqCtx, client, provider, model, apiKey, audioBytes, audioMimeType)
	case "deepgram-native":
		return s.transcribeDeepgram(reqCtx, client, provider, model, apiKey, audioBytes, audioMimeType)
	case "volcengine-asr":
		return s.transcribeVolcengine(reqCtx, client, provider, model, apiKey, audioBytes, audioMimeType)
	default:
		return nil, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "invalid_payload", Message: "unsupported provider transport"}
	}
}

func (s *asrRelayService) verify(ctx context.Context, payload asrVerifyRequestPayload) (bool, *asrRelayErrorPayload) {
	provider, ok := s.providers[strings.ToLower(strings.TrimSpace(payload.Provider))]
	if !ok {
		return false, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "unsupported_provider", Message: "unsupported ASR provider"}
	}

	apiKey := strings.TrimSpace(payload.APIKey)
	if apiKey == "" {
		return false, &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "missing ASR API key"}
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
	case "qwen-chat-completions":
		return s.verifyQwen(reqCtx, client, provider, apiKey)
	case "deepgram-native":
		return s.verifyDeepgram(reqCtx, client, provider, apiKey)
	case "volcengine-asr":
		return s.verifyVolcengine(reqCtx, client, provider, apiKey)
	default:
		return false, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "invalid_payload", Message: "unsupported provider transport"}
	}
}

func (s *asrRelayService) transcribeOpenAICompatible(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	model string,
	apiKey string,
	audioBytes []byte,
	audioMimeType string,
) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	fileName := "input.mp3"
	if strings.Contains(strings.ToLower(audioMimeType), "wav") {
		fileName = "input.wav"
	}
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return nil, asrRelayInternalError("failed to build transcription request")
	}
	if _, err := part.Write(audioBytes); err != nil {
		return nil, asrRelayInternalError("failed to build transcription request")
	}
	_ = writer.WriteField("model", model)
	_ = writer.WriteField("response_format", provider.responseFormat)
	_ = writer.WriteField("temperature", "0")
	_ = writer.WriteField("timestamp_granularities[]", "segment")
	_ = writer.WriteField("timestamp_granularities[]", "word")
	if err := writer.Close(); err != nil {
		return nil, asrRelayInternalError("failed to build transcription request")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.transcribeURL, &body)
	if err != nil {
		return nil, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := client.Do(req)
	if err != nil {
		return nil, mapASRRelayTransportError(err)
	}
	defer resp.Body.Close()

	return parseOpenAICompatibleRelayResponse(resp, provider, model)
}

func (s *asrRelayService) transcribeQwen(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	model string,
	apiKey string,
	audioBytes []byte,
	audioMimeType string,
) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	dataURI := "data:" + audioMimeType + ";base64," + base64.StdEncoding.EncodeToString(audioBytes)
	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "input_audio",
						"input_audio": map[string]any{
							"data": dataURI,
						},
					},
				},
			},
		},
		"stream": false,
		"asr_options": map[string]any{
			"enable_itn": false,
		},
	}

	req, err := jsonRequest(ctx, http.MethodPost, provider.transcribeURL, body)
	if err != nil {
		return nil, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, mapASRRelayTransportError(err)
	}
	defer resp.Body.Close()

	return parseQwenRelayResponse(resp, provider, model)
}

func (s *asrRelayService) transcribeDeepgram(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	model string,
	apiKey string,
	audioBytes []byte,
	audioMimeType string,
) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	u, err := url.Parse(provider.transcribeURL)
	if err != nil {
		return nil, asrRelayInternalError("invalid upstream url")
	}
	q := u.Query()
	q.Set("model", model)
	q.Set("smart_format", "true")
	q.Set("punctuate", "true")
	q.Set("paragraphs", "true")
	q.Set("diarize", "false")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(audioBytes))
	if err != nil {
		return nil, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("Authorization", "Token "+apiKey)
	req.Header.Set("Content-Type", audioMimeType)

	resp, err := client.Do(req)
	if err != nil {
		return nil, mapASRRelayTransportError(err)
	}
	defer resp.Body.Close()

	return parseDeepgramRelayResponse(resp, provider, model)
}

func (s *asrRelayService) transcribeVolcengine(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	model string,
	apiKey string,
	audioBytes []byte,
	audioMimeType string,
) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	appId, accessToken, err := parseVolcengineRelayCredentials(apiKey)
	if err != nil {
		return nil, &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "unauthorized", Message: err.Error()}
	}

	body := map[string]any{
		"user":    map[string]any{"uid": appId},
		"audio":   map[string]any{"data": base64.StdEncoding.EncodeToString(audioBytes)},
		"request": map[string]any{"model_name": model},
	}

	req, err := jsonRequest(ctx, http.MethodPost, provider.transcribeURL, body)
	if err != nil {
		return nil, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("X-Api-App-Key", appId)
	req.Header.Set("X-Api-Access-Key", accessToken)
	req.Header.Set("X-Api-Resource-Id", "volc.bigasr.auc_turbo")
	req.Header.Set("X-Api-Request-Id", newRelayRequestID())
	req.Header.Set("X-Api-Sequence", "-1")
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, mapASRRelayTransportError(err)
	}
	defer resp.Body.Close()

	return parseVolcengineRelayResponse(resp, provider, model)
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
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, asrRelayStatusToError(resp)
	}
	return true, nil
}

func (s *asrRelayService) verifyQwen(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	apiKey string,
) (bool, *asrRelayErrorPayload) {
	return s.verifyOpenAICompatible(ctx, client, provider, apiKey)
}

func (s *asrRelayService) verifyDeepgram(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	apiKey string,
) (bool, *asrRelayErrorPayload) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.verifyURL, nil)
	if err != nil {
		return false, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("Authorization", "Token "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return false, mapASRRelayTransportError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, asrRelayStatusToError(resp)
	}
	return true, nil
}

func (s *asrRelayService) verifyVolcengine(
	ctx context.Context,
	client *http.Client,
	provider asrRelayProviderConfig,
	apiKey string,
) (bool, *asrRelayErrorPayload) {
	appId, accessToken, err := parseVolcengineRelayCredentials(apiKey)
	if err != nil {
		return false, &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "unauthorized", Message: err.Error()}
	}

	body := map[string]any{
		"user":    map[string]any{"uid": appId},
		"audio":   map[string]any{"data": base64.StdEncoding.EncodeToString(minimalSilentWAVBytes())},
		"request": map[string]any{"model_name": "bigmodel"},
	}

	req, err := jsonRequest(ctx, http.MethodPost, provider.verifyURL, body)
	if err != nil {
		return false, asrRelayInternalError("failed to create upstream request")
	}
	req.Header.Set("X-Api-App-Key", appId)
	req.Header.Set("X-Api-Access-Key", accessToken)
	req.Header.Set("X-Api-Resource-Id", "volc.bigasr.auc_turbo")
	req.Header.Set("X-Api-Request-Id", newRelayRequestID())
	req.Header.Set("X-Api-Sequence", "-1")

	resp, err := client.Do(req)
	if err != nil {
		return false, mapASRRelayTransportError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, asrRelayStatusToError(resp)
	}

	statusCode := strings.TrimSpace(resp.Header.Get("X-Api-Status-Code"))
	if statusCode == "" || statusCode == "20000000" || statusCode == "20000003" {
		return true, nil
	}
	if strings.HasPrefix(statusCode, "550") {
		return false, &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "Volcengine service unavailable"}
	}
	if strings.HasPrefix(statusCode, "450") {
		return false, nil
	}
	return false, &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "Volcengine returned an unknown status"}
}

func parseOpenAICompatibleRelayResponse(resp *http.Response, provider asrRelayProviderConfig, model string) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
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

	cues := make([]asrRelayCue, 0, len(payload.Segments))
	for _, seg := range payload.Segments {
		if strings.TrimSpace(seg.Text) == "" {
			continue
		}
		cue := asrRelayCue{Start: seg.Start, End: seg.End, Text: strings.TrimSpace(seg.Text)}
		if len(seg.Words) > 0 {
			cue.Words = make([]asrRelayWord, 0, len(seg.Words))
			for _, word := range seg.Words {
				if strings.TrimSpace(word.Word) == "" {
					continue
				}
				cue.Words = append(cue.Words, asrRelayWord{
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
		cues = append(cues, asrRelayCue{Start: 0, End: duration, Text: strings.TrimSpace(payload.Text)})
	}

	var durationSeconds *float64
	if payload.Duration > 0 {
		durationSeconds = &payload.Duration
	}

	return &asrRelayResponsePayload{
		Cues:            cues,
		Language:        payload.Language,
		DurationSeconds: durationSeconds,
		Provider:        provider.id,
		Model:           model,
	}, nil
}

func parseQwenRelayResponse(resp *http.Response, provider asrRelayProviderConfig, model string) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, asrRelayStatusToError(resp)
	}

	var payload struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, asrRelayInternalError("invalid provider response payload")
	}

	text := ""
	if len(payload.Choices) > 0 {
		text = strings.TrimSpace(payload.Choices[0].Message.Content)
	}
	cues := make([]asrRelayCue, 0, 1)
	if text != "" {
		cues = append(cues, asrRelayCue{Start: 0, End: 0, Text: text})
	}

	return &asrRelayResponsePayload{
		Cues:     cues,
		Provider: provider.id,
		Model:    model,
	}, nil
}

func parseDeepgramRelayResponse(resp *http.Response, provider asrRelayProviderConfig, model string) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, asrRelayStatusToError(resp)
	}

	var payload struct {
		Results struct {
			Channels []struct {
				Alternatives []struct {
					Transcript string `json:"transcript"`
					Words      []struct {
						Word       string   `json:"word"`
						Start      float64  `json:"start"`
						End        float64  `json:"end"`
						Confidence *float64 `json:"confidence"`
					} `json:"words"`
					Paragraphs struct {
						Paragraphs []struct {
							Sentences []struct {
								Text  string  `json:"text"`
								Start float64 `json:"start"`
								End   float64 `json:"end"`
							} `json:"sentences"`
						} `json:"paragraphs"`
					} `json:"paragraphs"`
				} `json:"alternatives"`
			} `json:"channels"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, asrRelayInternalError("invalid provider response payload")
	}

	alternative := payload.Results.Channels
	if len(alternative) == 0 || len(alternative[0].Alternatives) == 0 {
		return nil, asrRelayInternalError("empty provider response payload")
	}
	alt := alternative[0].Alternatives[0]
	cues := make([]asrRelayCue, 0)
	for _, paragraph := range alt.Paragraphs.Paragraphs {
		for _, sentence := range paragraph.Sentences {
			text := strings.TrimSpace(sentence.Text)
			if text == "" {
				continue
			}
			cues = append(cues, asrRelayCue{Start: sentence.Start, End: sentence.End, Text: text})
		}
	}
	if len(cues) == 0 {
		words := make([]asrRelayWord, 0, len(alt.Words))
		for _, word := range alt.Words {
			if strings.TrimSpace(word.Word) == "" {
				continue
			}
			words = append(words, asrRelayWord{
				Word:       strings.TrimSpace(word.Word),
				Start:      word.Start,
				End:        word.End,
				Confidence: word.Confidence,
			})
		}
		if len(words) > 0 {
			start := words[0].Start
			end := words[len(words)-1].End
			cues = append(cues, asrRelayCue{Start: start, End: end, Text: strings.TrimSpace(alt.Transcript), Words: words})
		} else if text := strings.TrimSpace(alt.Transcript); text != "" {
			cues = append(cues, asrRelayCue{Start: 0, End: 0, Text: text})
		}
	}
	if len(cues) == 0 {
		return nil, asrRelayInternalError("empty transcript")
	}

	lastCue := cues[len(cues)-1]
	duration := lastCue.End
	return &asrRelayResponsePayload{
		Cues:            cues,
		DurationSeconds: &duration,
		Provider:        provider.id,
		Model:           model,
	}, nil
}

func parseVolcengineRelayResponse(resp *http.Response, provider asrRelayProviderConfig, model string) (*asrRelayResponsePayload, *asrRelayErrorPayload) {
	statusCode := strings.TrimSpace(resp.Header.Get("X-Api-Status-Code"))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, asrRelayStatusToError(resp)
	}
	if statusCode != "" && statusCode != "20000000" && statusCode != "20000003" {
		if strings.HasPrefix(statusCode, "450") {
			return nil, &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "client_error", Message: "Volcengine client error"}
		}
		if strings.HasPrefix(statusCode, "550") {
			return nil, &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "Volcengine service unavailable"}
		}
		return nil, &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "Volcengine returned an unknown status"}
	}

	var payload struct {
		AudioInfo struct {
			Duration float64 `json:"duration"`
		} `json:"audio_info"`
		Result struct {
			Text       string `json:"text"`
			Utterances []struct {
				Text      string  `json:"text"`
				StartTime float64 `json:"start_time"`
				EndTime   float64 `json:"end_time"`
				Words     []struct {
					Text       string   `json:"text"`
					StartTime  float64  `json:"start_time"`
					EndTime    float64  `json:"end_time"`
					Confidence *float64 `json:"confidence"`
				} `json:"words"`
			} `json:"utterances"`
			Additions struct {
				Duration float64 `json:"duration"`
			} `json:"additions"`
		} `json:"result"`
	}
	if statusCode == "20000003" {
		return &asrRelayResponsePayload{
			Cues:     []asrRelayCue{},
			Provider: provider.id,
			Model:    model,
		}, nil
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, asrRelayInternalError("invalid provider response payload")
	}

	cues := make([]asrRelayCue, 0)
	for _, utt := range payload.Result.Utterances {
		text := strings.TrimSpace(utt.Text)
		if text == "" {
			continue
		}
		cue := asrRelayCue{Start: utt.StartTime / 1000, End: utt.EndTime / 1000, Text: text}
		if len(utt.Words) > 0 {
			cue.Words = make([]asrRelayWord, 0, len(utt.Words))
			for _, word := range utt.Words {
				if strings.TrimSpace(word.Text) == "" {
					continue
				}
				cue.Words = append(cue.Words, asrRelayWord{
					Word:       strings.TrimSpace(word.Text),
					Start:      word.StartTime / 1000,
					End:        word.EndTime / 1000,
					Confidence: word.Confidence,
				})
			}
		}
		cues = append(cues, cue)
	}
	if len(cues) == 0 {
		if text := strings.TrimSpace(payload.Result.Text); text != "" {
			cues = append(cues, asrRelayCue{Start: 0, End: 0, Text: text})
		}
	}
	if len(cues) == 0 {
		return nil, asrRelayInternalError("empty transcript")
	}

	duration := payload.AudioInfo.Duration / 1000
	if duration <= 0 {
		duration = payload.Result.Additions.Duration / 1000
	}
	if duration <= 0 {
		duration = cues[len(cues)-1].End
	}
	return &asrRelayResponsePayload{
		Cues:            cues,
		DurationSeconds: &duration,
		Provider:        provider.id,
		Model:           model,
	}, nil
}

func minimalSilentWAVBytes() []byte {
	header := []byte{
		0x52, 0x49, 0x46, 0x46,
		0xcc, 0x00, 0x00, 0x00,
		0x57, 0x41, 0x56, 0x45,
		0x66, 0x6d, 0x74, 0x20,
		0x10, 0x00, 0x00, 0x00,
		0x01, 0x00,
		0x01, 0x00,
		0x40, 0x1f, 0x00, 0x00,
		0x80, 0x3e, 0x00, 0x00,
		0x02, 0x00,
		0x10, 0x00,
		0x64, 0x61, 0x74, 0x61,
		0xa0, 0x00, 0x00, 0x00,
	}
	silence := make([]byte, 160)
	wav := make([]byte, 0, len(header)+len(silence))
	wav = append(wav, header...)
	wav = append(wav, silence...)
	return wav
}

func asrRelayStatusToError(resp *http.Response) *asrRelayErrorPayload {
	retryAfterMs := parseRetryAfterHeader(resp.Header.Get("Retry-After"))
	switch resp.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return &asrRelayErrorPayload{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "provider rejected credentials", RetryAfterMs: retryAfterMs}
	case http.StatusRequestEntityTooLarge:
		return &asrRelayErrorPayload{Status: http.StatusRequestEntityTooLarge, Code: "payload_too_large", Message: "provider rejected payload", RetryAfterMs: retryAfterMs}
	case http.StatusTooManyRequests:
		return &asrRelayErrorPayload{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "provider rate limited the request", RetryAfterMs: retryAfterMs}
	}

	if resp.StatusCode >= 500 {
		return &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "provider service unavailable", RetryAfterMs: retryAfterMs}
	}
	return &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "client_error", Message: "provider rejected the request", RetryAfterMs: retryAfterMs}
}

func asrRelayInternalError(message string) *asrRelayErrorPayload {
	return &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: message}
}

func mapASRRelayTransportError(err error) *asrRelayErrorPayload {
	if err == nil {
		return asrRelayInternalError("upstream request failed")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "upstream request timed out"}
	}
	if errors.Is(err, context.Canceled) {
		return &asrRelayErrorPayload{Status: http.StatusBadRequest, Code: "client_error", Message: "request canceled"}
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) && errors.Is(urlErr.Err, context.DeadlineExceeded) {
		return &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "upstream request timed out"}
	}
	return &asrRelayErrorPayload{Status: http.StatusServiceUnavailable, Code: "service_unavailable", Message: "upstream request failed"}
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
		ms := t.Sub(time.Now()).Milliseconds()
		if ms < 0 {
			ms = 0
		}
		return &ms
	}
	return nil
}

func parseVolcengineRelayCredentials(apiKey string) (string, string, error) {
	separator := strings.Index(apiKey, ":")
	if separator <= 0 || separator >= len(apiKey)-1 {
		return "", "", fmt.Errorf("Volcengine API key must be in the format %q", "appId:accessToken")
	}
	appID := strings.TrimSpace(apiKey[:separator])
	accessToken := strings.TrimSpace(apiKey[separator+1:])
	if appID == "" || accessToken == "" {
		return "", "", fmt.Errorf("Volcengine API key must be in the format %q", "appId:accessToken")
	}
	return appID, accessToken, nil
}

func newRelayRequestID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err == nil {
		return fmt.Sprintf("relay-%x", buf[:])
	}
	return fmt.Sprintf("relay-%d", time.Now().UnixNano())
}

func jsonRequest(ctx context.Context, method, target string, body any) (*http.Request, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func writeASRRelayError(w http.ResponseWriter, status int, message string, code string, retryAfterMs *int64) {
	payload := asrRelayErrorPayload{
		Status:  status,
		Code:    code,
		Message: message,
	}
	if retryAfterMs != nil {
		payload.RetryAfterMs = retryAfterMs
		w.Header().Set("Retry-After", strconv.FormatInt(*retryAfterMs/1000, 10))
	}
	writeJSON(w, status, payload)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
