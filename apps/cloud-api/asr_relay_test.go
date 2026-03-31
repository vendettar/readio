package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestASRRelayRouteOwnershipAndContracts(t *testing.T) {
	t.Run("rejects unsupported provider", func(t *testing.T) {
		relay := newASRRelayService()
		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "unknown",
			Model:         "whatever",
			APIKey:        "key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "unsupported_provider")
	})

	t.Run("rejects oversized requests", func(t *testing.T) {
		relay := newASRRelayService()
		rr := httptest.NewRecorder()
		largeAudio := bytes.Repeat([]byte("a"), int(asrRelayBodyLimit))
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "key",
			AudioBytes:    largeAudio,
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusRequestEntityTooLarge)
		}
	})

	t.Run("routes groq transcription through same-origin relay and preserves success shape", func(t *testing.T) {
		backendCalls := 0
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			backendCalls++
			if r.Method != http.MethodPost {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodPost)
			}
			if got := r.URL.Path; got != "/openai/v1/audio/transcriptions" {
				t.Fatalf("path = %q, want %q", got, "/openai/v1/audio/transcriptions")
			}
			if got := r.Header.Get("Authorization"); got != "Bearer groq-key" {
				t.Fatalf("authorization = %q, want %q", got, "Bearer groq-key")
			}

			reader, err := multipart.NewReader(r.Body, strings.TrimPrefix(r.Header.Get("Content-Type"), "multipart/form-data; boundary=")).ReadForm(1 << 20)
			if err != nil {
				t.Fatalf("read form: %v", err)
			}
			defer func() { _ = reader.RemoveAll() }()

			if got := reader.Value["model"]; len(got) != 1 || got[0] != "whisper-large-v3" {
				t.Fatalf("model = %#v", got)
			}
			if got := reader.Value["response_format"]; len(got) != 1 || got[0] != "verbose_json" {
				t.Fatalf("response_format = %#v", got)
			}
			if got := reader.Value["temperature"]; len(got) != 1 || got[0] != "0" {
				t.Fatalf("temperature = %#v", got)
			}
			if got := reader.File["file"]; len(got) != 1 {
				t.Fatalf("file parts = %d, want 1", len(got))
			}

			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 12.5,
				"segments": []map[string]any{
					{"start": 0, "end": 1.5, "text": "hello groq"},
				},
			})
		}))
		t.Cleanup(backend.Close)

		relay := newASRRelayService()
		provider := relay.providers["groq"]
		provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if backendCalls != 1 {
			t.Fatalf("backend calls = %d, want %d", backendCalls, 1)
		}

		var payload asrRelayResponsePayload
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if payload.Provider != "groq" || payload.Model != "whisper-large-v3" {
			t.Fatalf("payload provider/model = %q/%q", payload.Provider, payload.Model)
		}
		if len(payload.Cues) != 1 || payload.Cues[0].Text != "hello groq" {
			t.Fatalf("payload cues = %#v", payload.Cues)
		}
	})

	t.Run("maps provider unauthorized and rate-limited errors", func(t *testing.T) {
		tests := []struct {
			name       string
			statusCode int
			wantStatus int
			wantCode   string
		}{
			{name: "unauthorized", statusCode: http.StatusUnauthorized, wantStatus: http.StatusUnauthorized, wantCode: "unauthorized"},
			{name: "rate limited", statusCode: http.StatusTooManyRequests, wantStatus: http.StatusTooManyRequests, wantCode: "rate_limited"},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(tc.statusCode)
					_, _ = io.WriteString(w, "boom")
				}))
				t.Cleanup(backend.Close)

				relay := newASRRelayService()
				provider := relay.providers["groq"]
				provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
				relay.providers["groq"] = provider

				rr := httptest.NewRecorder()
				req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
					Provider:      "groq",
					Model:         "whisper-large-v3",
					APIKey:        "groq-key",
					AudioBytes:    []byte("test-audio"),
					AudioMimeType: "audio/mpeg",
				})
				relay.ServeHTTP(rr, req)

				if rr.Code != tc.wantStatus {
					t.Fatalf("status = %d, want %d", rr.Code, tc.wantStatus)
				}
				expectRelayErrorCode(t, rr.Body.Bytes(), tc.wantCode)
			})
		}
	})

	t.Run("maps provider 5xx errors to service unavailable", func(t *testing.T) {
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, "upstream boom")
		}))
		t.Cleanup(backend.Close)

		relay := newASRRelayService()
		provider := relay.providers["groq"]
		provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusServiceUnavailable)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "service_unavailable")
	})

	t.Run("routes groq verify through same-origin relay and preserves boolean success shape", func(t *testing.T) {
		backendCalls := 0
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			backendCalls++
			if r.Method != http.MethodGet {
				t.Fatalf("method = %q, want %q", r.Method, http.MethodGet)
			}
			if got := r.URL.Path; got != "/openai/v1/models" {
				t.Fatalf("path = %q, want %q", got, "/openai/v1/models")
			}
			if got := r.Header.Get("Authorization"); got != "Bearer groq-key" {
				t.Fatalf("authorization = %q, want %q", got, "Bearer groq-key")
			}
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"data":[]}`)
		}))
		t.Cleanup(backend.Close)

		relay := newASRRelayService()
		provider := relay.providers["groq"]
		provider.verifyURL = backend.URL + "/openai/v1/models"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newASRVerifyRequest(t, asrVerifyRequestPayload{
			Provider: "groq",
			APIKey:   "groq-key",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if backendCalls != 1 {
			t.Fatalf("backend calls = %d, want %d", backendCalls, 1)
		}

		var payload asrVerifyResponsePayload
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if !payload.OK {
			t.Fatalf("payload ok = %v, want true", payload.OK)
		}
	})

	t.Run("maps provider unauthorized verify responses to structured unauthorized errors", func(t *testing.T) {
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, "nope")
		}))
		t.Cleanup(backend.Close)

		relay := newASRRelayService()
		provider := relay.providers["groq"]
		provider.verifyURL = backend.URL + "/openai/v1/models"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newASRVerifyRequest(t, asrVerifyRequestPayload{
			Provider: "groq",
			APIKey:   "groq-key",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "unauthorized")
	})

	t.Run("rejects requests from disallowed origin", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = map[string]struct{}{
			"https://www.readio.top": {},
		}

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://evil.example")
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "origin_not_allowed")
	})

	t.Run("rejects requests with missing origin", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = map[string]struct{}{
			"https://www.readio.top": {},
		}

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Del("Origin")
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "missing_or_disallowed_origin")
	})

	t.Run("rejects requests with missing relay token when configured", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = map[string]struct{}{
			"https://www.readio.top": {},
		}
		relay.relayPublicToken = "relay-secret"

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://www.readio.top")
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "unauthorized")
	})

	t.Run("rate limits repeated relay requests from same ip", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = map[string]struct{}{
			"https://www.readio.top": {},
		}
		relay.limiter = newRateLimiter(1, time.Minute, func() time.Time { return time.Unix(0, 0) })

		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 1.0,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "hello"},
				},
			})
		}))
		t.Cleanup(backend.Close)

		provider := relay.providers["groq"]
		provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
		relay.providers["groq"] = provider

		first := httptest.NewRecorder()
		firstReq := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		firstReq.Header.Set("Origin", "https://www.readio.top")
		relay.ServeHTTP(first, firstReq)
		if first.Code != http.StatusOK {
			t.Fatalf("first status = %d, want %d", first.Code, http.StatusOK)
		}

		second := httptest.NewRecorder()
		secondReq := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		secondReq.Header.Set("Origin", "https://www.readio.top")
		relay.ServeHTTP(second, secondReq)
		if second.Code != http.StatusTooManyRequests {
			t.Fatalf("second status = %d, want %d", second.Code, http.StatusTooManyRequests)
		}
		expectRelayErrorCode(t, second.Body.Bytes(), "rate_limited")
	})
}

func TestASRRelayCredentialsStayTransient(t *testing.T) {
	const secretAPIKey = "browser-secret-token-123"

	t.Run("success path does not log or echo the api key", func(t *testing.T) {
		var logs bytes.Buffer
		oldLogger := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelInfo})))
		t.Cleanup(func() {
			slog.SetDefault(oldLogger)
		})

		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer "+secretAPIKey {
				t.Fatalf("authorization = %q, want %q", got, "Bearer "+secretAPIKey)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 3.5,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "hello"},
				},
			})
		}))
		t.Cleanup(backend.Close)

		relay := newASRRelayService()
		provider := relay.providers["groq"]
		provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        secretAPIKey,
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
		}
		if strings.Contains(rr.Body.String(), secretAPIKey) {
			t.Fatalf("response body leaked api key: %s", rr.Body.String())
		}
		if strings.Contains(logs.String(), secretAPIKey) {
			t.Fatalf("logs leaked api key: %s", logs.String())
		}
	})

	t.Run("provider error path does not log or echo the api key", func(t *testing.T) {
		var logs bytes.Buffer
		oldLogger := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelInfo})))
		t.Cleanup(func() {
			slog.SetDefault(oldLogger)
		})

		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, "upstream unauthorized")
		}))
		t.Cleanup(backend.Close)

		relay := newASRRelayService()
		provider := relay.providers["groq"]
		provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        secretAPIKey,
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
		}
		if strings.Contains(rr.Body.String(), secretAPIKey) {
			t.Fatalf("response body leaked api key: %s", rr.Body.String())
		}
		if strings.Contains(logs.String(), secretAPIKey) {
			t.Fatalf("logs leaked api key: %s", logs.String())
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "unauthorized")
	})
}

func TestASRRelayRateLimitDisableSemantics(t *testing.T) {
	t.Run("burst zero disables rate limiting", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitBurstEnv, "0")

		relay := newASRRelayService()
		if relay.limiter == nil {
			t.Fatal("limiter = nil, want non-nil")
		}

		if relay.limiter.limit != 0 {
			t.Fatalf("limiter.limit = %d, want 0 (disabled)", relay.limiter.limit)
		}

		if !relay.limiter.allow("198.51.100.10") {
			t.Fatal("expected request to pass when limit == 0 (disabled)")
		}
	})

	t.Run("burst negative disables rate limiting", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitBurstEnv, "-5")

		relay := newASRRelayService()
		if relay.limiter == nil {
			t.Fatal("limiter = nil, want non-nil")
		}

		if relay.limiter.limit != -5 {
			t.Fatalf("limiter.limit = %d, want -5 (disabled)", relay.limiter.limit)
		}

		if !relay.limiter.allow("198.51.100.10") {
			t.Fatal("expected request to pass when limit < 0 (disabled)")
		}
	})

	t.Run("burst positive enables rate limiting", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitBurstEnv, "2")

		relay := newASRRelayService()
		if relay.limiter.limit != 2 {
			t.Fatalf("limiter.limit = %d, want 2", relay.limiter.limit)
		}

		if !relay.limiter.allow("198.51.100.10") {
			t.Fatal("expected first request to pass")
		}
		if !relay.limiter.allow("198.51.100.10") {
			t.Fatal("expected second request to pass (within limit)")
		}
		if relay.limiter.allow("198.51.100.10") {
			t.Fatal("expected third request to fail (over limit)")
		}
	})

	t.Run("window zero falls back to default", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitWindowMsEnv, "0")

		relay := newASRRelayService()
		if relay.limiter.window != asrRelayRateLimitWindow {
			t.Fatalf("limiter.window = %v, want default %v", relay.limiter.window, asrRelayRateLimitWindow)
		}
	})

	t.Run("window negative falls back to default", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitWindowMsEnv, "-1000")

		relay := newASRRelayService()
		if relay.limiter.window != asrRelayRateLimitWindow {
			t.Fatalf("limiter.window = %v, want default %v", relay.limiter.window, asrRelayRateLimitWindow)
		}
	})
}

type multipartASRRelayRequestPayload struct {
	Provider      string
	Model         string
	APIKey        string
	AudioBytes    []byte
	AudioMimeType string
}

func newMultipartASRRelayRequest(t *testing.T, payload multipartASRRelayRequestPayload) *http.Request {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("provider", payload.Provider); err != nil {
		t.Fatalf("write provider: %v", err)
	}
	if err := writer.WriteField("model", payload.Model); err != nil {
		t.Fatalf("write model: %v", err)
	}
	if err := writer.WriteField("apiKey", payload.APIKey); err != nil {
		t.Fatalf("write apiKey: %v", err)
	}
	if payload.AudioMimeType != "" {
		if err := writer.WriteField("audioMimeType", payload.AudioMimeType); err != nil {
			t.Fatalf("write audioMimeType: %v", err)
		}
	}
	part, err := writer.CreateFormFile("audio", "input.audio")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(payload.AudioBytes); err != nil {
		t.Fatalf("write audio bytes: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, asrRelayRoute, bytes.NewReader(body.Bytes()))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.RemoteAddr = "198.51.100.10:12345"
	req.Header.Set("Origin", "http://example.com")
	return req
}

func newASRVerifyRequest(t *testing.T, payload asrVerifyRequestPayload) *http.Request {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, asrVerifyRoute, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.10:12345"
	req.Header.Set("Origin", "http://example.com")
	return req
}

func expectRelayErrorCode(t *testing.T, body []byte, wantCode string) {
	t.Helper()

	var payload asrRelayErrorPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("unmarshal error payload: %v", err)
	}
	if payload.Code != wantCode {
		t.Fatalf("error code = %q, want %q", payload.Code, wantCode)
	}
}

func TestNormalizeHostPort(t *testing.T) {
	tests := []struct {
		name     string
		hostPort string
		scheme   string
		wantHost string
		wantPort int
	}{
		{name: "https default port stripped", hostPort: "www.readio.top:443", scheme: "https", wantHost: "www.readio.top", wantPort: 443},
		{name: "http default port stripped", hostPort: "localhost:80", scheme: "http", wantHost: "localhost", wantPort: 80},
		{name: "no port https defaults to 443", hostPort: "www.readio.top", scheme: "https", wantHost: "www.readio.top", wantPort: 443},
		{name: "no port http defaults to 80", hostPort: "localhost", scheme: "http", wantHost: "localhost", wantPort: 80},
		{name: "explicit non-default port", hostPort: "example.com:8443", scheme: "https", wantHost: "example.com", wantPort: 8443},
		{name: "explicit non-default port http", hostPort: "localhost:8080", scheme: "http", wantHost: "localhost", wantPort: 8080},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			host, port := normalizeHostPort(tc.hostPort, tc.scheme)
			if host != tc.wantHost {
				t.Fatalf("host = %q, want %q", host, tc.wantHost)
			}
			if port != tc.wantPort {
				t.Fatalf("port = %d, want %d", port, tc.wantPort)
			}
		})
	}
}

func TestIsSameOrigin(t *testing.T) {
	tests := []struct {
		name          string
		originScheme  string
		originHost    string
		requestScheme string
		requestHost   string
		want          bool
	}{
		{
			name:         "https origin with explicit 443 matches request with explicit 443 via X-Forwarded-Proto",
			originScheme: "https", originHost: "www.readio.top",
			requestScheme: "https", requestHost: "www.readio.top:443",
			want: true,
		},
		{
			name:         "http origin without port matches request with explicit :80",
			originScheme: "http", originHost: "localhost",
			requestScheme: "http", requestHost: "localhost:80",
			want: true,
		},
		{
			name:         "explicit non-default port matches",
			originScheme: "https", originHost: "example.com:8443",
			requestScheme: "https", requestHost: "example.com:8443",
			want: true,
		},
		{
			name:         "different host rejects",
			originScheme: "https", originHost: "evil.com",
			requestScheme: "https", requestHost: "www.readio.top",
			want: false,
		},
		{
			name:         "https origin rejects request on port 8080",
			originScheme: "https", originHost: "www.readio.top",
			requestScheme: "https", requestHost: "www.readio.top:8080",
			want: false,
		},
		{
			name:         "http origin rejects https request",
			originScheme: "http", originHost: "example.com",
			requestScheme: "https", requestHost: "example.com",
			want: false,
		},
		{
			name:         "case insensitive hostname match",
			originScheme: "https", originHost: "WWW.READIO.TOP",
			requestScheme: "https", requestHost: "www.readio.top",
			want: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isSameOrigin(tc.originScheme, tc.originHost, tc.requestScheme, tc.requestHost)
			if got != tc.want {
				t.Fatalf("isSameOrigin(%q, %q, %q, %q) = %v, want %v",
					tc.originScheme, tc.originHost, tc.requestScheme, tc.requestHost, got, tc.want)
			}
		})
	}
}

func TestASRRelaySameOriginFallback(t *testing.T) {
	t.Run("origin with default https port matches request host with :443", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = nil // same-origin fallback

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://www.readio.top")
		req.Host = "www.readio.top:443"
		req.TLS = &tls.ConnectionState{} // signal https scheme for request
		relay.ServeHTTP(rr, req)

		if rr.Code == http.StatusForbidden {
			t.Fatalf("expected non-forbidden status, got %d", rr.Code)
		}
	})

	t.Run("http origin matches localhost with explicit :80", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = nil

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "http://localhost")
		req.Host = "localhost:80"
		relay.ServeHTTP(rr, req)

		if rr.Code == http.StatusForbidden {
			t.Fatalf("expected non-forbidden status, got %d", rr.Code)
		}
	})

	t.Run("explicit non-default port matches exactly", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = nil

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://example.com:8443")
		req.Host = "example.com:8443"
		req.TLS = &tls.ConnectionState{} // signal https scheme for request
		relay.ServeHTTP(rr, req)

		if rr.Code == http.StatusForbidden {
			t.Fatalf("expected non-forbidden status, got %d", rr.Code)
		}
	})

	t.Run("different host still rejects", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = nil

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://evil.com")
		req.Host = "www.readio.top"
		req.Header.Set("X-Forwarded-Proto", "https")
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "origin_not_allowed")
	})

	t.Run("https origin rejects request on non-default port 8080", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = nil

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://www.readio.top")
		req.Host = "www.readio.top:8080"
		req.Header.Set("X-Forwarded-Proto", "https")
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
		}
		expectRelayErrorCode(t, rr.Body.Bytes(), "origin_not_allowed")
	})

	t.Run("explicit allowlist still works unchanged", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = map[string]struct{}{
			"https://www.readio.top": {},
		}

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://www.readio.top")
		req.Host = "www.readio.top:443"
		req.Header.Set("X-Forwarded-Proto", "https")
		relay.ServeHTTP(rr, req)

		// With explicit allowlist, origin is checked against the map directly
		// Origin "https://www.readio.top" should match the allowlist entry
		if rr.Code == http.StatusForbidden {
			t.Fatalf("expected non-forbidden status, got %d", rr.Code)
		}
	})

	t.Run("untrusted peer cannot spoof scheme via X-Forwarded-Proto", func(t *testing.T) {
		relay := newASRRelayService()
		relay.allowedOrigins = nil // same-origin fallback

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		// Origin says https, but request arrives plain http (no TLS, no trusted proxy)
		req.Header.Set("Origin", "https://www.readio.top")
		req.Host = "www.readio.top"
		req.Header.Set("X-Forwarded-Proto", "https") // attacker-supplied
		// RemoteAddr is untrusted (default httptest value), so X-Forwarded-Proto must be ignored
		relay.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected forbidden (scheme mismatch), got %d", rr.Code)
		}
	})
}
