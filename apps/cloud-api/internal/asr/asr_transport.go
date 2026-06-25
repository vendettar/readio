package asr

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"readio-cloud/internal/observability"
)

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
