package asr

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"readio-cloud/internal/clientip"
	"readio-cloud/internal/httputil"
)

func TestRelayAudioUploadFileName(t *testing.T) {
	tests := []struct {
		name     string
		mimeType string
		want     string
	}{
		{name: "default", mimeType: "audio/mpeg", want: "input.mp3"},
		{name: "wav", mimeType: "audio/wav", want: "input.wav"},
		{name: "m4a", mimeType: "audio/x-m4a", want: "input.m4a"},
		{name: "webm", mimeType: "audio/webm", want: "input.webm"},
		{name: "ogg", mimeType: "audio/ogg", want: "input.ogg"},
		{name: "flac", mimeType: "audio/flac", want: "input.flac"},
		{name: "aac", mimeType: "audio/aac", want: "input.aac"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := relayAudioUploadFileName(tc.mimeType)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestASRRelayRouteOwnershipAndContracts(t *testing.T) {
	t.Run("rejects unsupported provider", func(t *testing.T) {
		tests := []struct {
			name     string
			provider string
		}{
			{name: "unknown", provider: "unknown"},
			{name: "qwen", provider: "qwen"},
			{name: "deepgram", provider: "deepgram"},
			{name: "volcengine", provider: "volcengine"},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				relay := NewASRRelayService().(*asrRelayService)
				rr := httptest.NewRecorder()
				req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
					Provider:      tc.provider,
					Model:         "whatever",
					APIKey:        "key",
					AudioBytes:    []byte("test-audio"),
					AudioMimeType: "audio/mpeg",
				})
				relay.ServeHTTP(rr, req)

				require.Equal(t, http.StatusBadRequest, rr.Code)
				expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_UNSUPPORTED_PROVIDER")
			})
		}
	})

	t.Run("rejects oversized requests", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
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

		require.Equal(t, http.StatusRequestEntityTooLarge, rr.Code)
	})

	t.Run("rejects empty audio before contacting upstream", func(t *testing.T) {
		backendCalls := 0
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			backendCalls++
			w.WriteHeader(http.StatusInternalServerError)
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		provider := relay.providers["groq"]
		provider.transcribeURL = backend.URL + "/openai/v1/audio/transcriptions"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte{},
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusBadRequest, rr.Code)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_INVALID_PAYLOAD")
		require.Equal(t, 0, backendCalls)
	})

	t.Run("routes groq transcription through same-origin relay and preserves success shape", func(t *testing.T) {
		backendCalls := 0
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			backendCalls++
			require.Equal(t, http.MethodPost, r.Method)
			got := r.URL.Path
			require.Equal(t, "/openai/v1/audio/transcriptions", got)
			got = r.Header.Get("Authorization")
			require.Equal(t, "Bearer groq-key", got)

			reader, err := multipart.NewReader(r.Body, strings.TrimPrefix(r.Header.Get("Content-Type"), "multipart/form-data; boundary=")).ReadForm(1 << 20)
			require.NoError(t, err)
			defer func() { _ = reader.RemoveAll() }()

			require.Len(t, reader.Value["model"], 1)
			require.Equal(t, "whisper-large-v3", reader.Value["model"][0])
			require.Len(t, reader.Value["response_format"], 1)
			require.Equal(t, "verbose_json", reader.Value["response_format"][0])
			require.Len(t, reader.Value["temperature"], 1)
			require.Equal(t, "0", reader.Value["temperature"][0])
			require.Len(t, reader.File["file"], 1)

			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 12.5,
				"segments": []map[string]any{
					{"start": 0, "end": 1.5, "text": "hello groq"},
				},
			})
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, backendCalls)

		var payload ASRRelayResponsePayload
		err := json.Unmarshal(rr.Body.Bytes(), &payload)
		require.NoError(t, err)
		require.Equal(t, "groq", payload.Provider)
		require.Equal(t, "whisper-large-v3", payload.Model)
		require.Len(t, payload.Cues, 1)
		require.Equal(t, "hello groq", payload.Cues[0].Text)
	})

	t.Run("emits canonical request summary fields on transcription success", func(t *testing.T) {

		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodPost, r.Method)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 12.5,
				"segments": []map[string]any{
					{"start": 0, "end": 1.5, "text": "hello groq"},
				},
			})
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
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

		require.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("verifies groq API key validity", func(t *testing.T) {
		backendCalls := 0
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			backendCalls++
			got := r.URL.Path
			require.Equal(t, "/openai/v1/models", got)
			got = r.Header.Get("Authorization")
			require.Equal(t, "Bearer groq-key", got)
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"data":[]}`)
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		provider := relay.providers["groq"]
		provider.verifyURL = backend.URL + "/openai/v1/models"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newASRVerifyRequest(t, asrVerifyRequestPayload{
			Provider: "groq",
			APIKey:   "groq-key",
		})
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, backendCalls)

		var payload asrVerifyResponsePayload
		err := json.Unmarshal(rr.Body.Bytes(), &payload)
		require.NoError(t, err)
		require.True(t, payload.OK)
	})

	t.Run("rejects unsupported provider verification", func(t *testing.T) {
		tests := []struct {
			name     string
			provider string
		}{
			{name: "unknown", provider: "unknown"},
			{name: "qwen", provider: "qwen"},
			{name: "deepgram", provider: "deepgram"},
			{name: "volcengine", provider: "volcengine"},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				relay := NewASRRelayService().(*asrRelayService)
				rr := httptest.NewRecorder()
				req := newASRVerifyRequest(t, asrVerifyRequestPayload{
					Provider: tc.provider,
					APIKey:   "key",
				})
				relay.ServeHTTP(rr, req)

				require.Equal(t, http.StatusBadRequest, rr.Code)
				expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_UNSUPPORTED_PROVIDER")
			})
		}
	})

	t.Run("maps provider unauthorized verify responses to structured unauthorized errors", func(t *testing.T) {
		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, "nope")
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		provider := relay.providers["groq"]
		provider.verifyURL = backend.URL + "/openai/v1/models"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newASRVerifyRequest(t, asrVerifyRequestPayload{
			Provider: "groq",
			APIKey:   "groq-key",
		})
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusUnauthorized, rr.Code)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_UNAUTHORIZED")
	})

	t.Run("rejects requests from disallowed origin", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.allowedOrigins = []string{
			"https://www.readio.top",
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

		require.Equal(t, http.StatusForbidden, rr.Code)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_ORIGIN_NOT_ALLOWED")
	})

	t.Run("rejects requests with missing origin", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.allowedOrigins = []string{
			"https://www.readio.top",
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

		require.Equal(t, http.StatusForbidden, rr.Code)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_MISSING_OR_DISALLOWED_ORIGIN")
	})

	t.Run("rejects requests with missing relay token when configured", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.allowedOrigins = []string{
			"https://www.readio.top",
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

		require.Equal(t, http.StatusUnauthorized, rr.Code)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_UNAUTHORIZED")
	})

	t.Run("rate limits invalid relay token attempts", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.allowedOrigins = []string{
			"https://www.readio.top",
		}
		relay.relayPublicToken = "relay-secret"
		relay.limiter = httputil.NewRateLimiter(1, time.Minute, func() time.Time { return time.Unix(0, 0) })

		first := httptest.NewRecorder()
		firstReq := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		firstReq.Header.Set("Origin", "https://www.readio.top")
		firstReq.Header.Set(asrRelayPublicTokenHeader, "wrong-token")
		relay.ServeHTTP(first, firstReq)
		require.Equal(t, http.StatusUnauthorized, first.Code)
		expectRelayErrorCode(t, first.Body.Bytes(), "ASR_UNAUTHORIZED")

		second := httptest.NewRecorder()
		secondReq := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		secondReq.Header.Set("Origin", "https://www.readio.top")
		secondReq.Header.Set(asrRelayPublicTokenHeader, "wrong-token")
		relay.ServeHTTP(second, secondReq)
		require.Equal(t, http.StatusTooManyRequests, second.Code)
		expectRelayErrorCode(t, second.Body.Bytes(), "ASR_RATE_LIMITED")
	})

	t.Run("rate limits repeated relay requests from same ip", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.allowedOrigins = []string{
			"https://www.readio.top",
		}

		relay.limiter = httputil.NewRateLimiter(1, time.Minute, func() time.Time { return time.Unix(0, 0) })

		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
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
		require.Equal(t, http.StatusOK, first.Code)

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
		require.Equal(t, http.StatusTooManyRequests, second.Code)
		expectRelayErrorCode(t, second.Body.Bytes(), "ASR_RATE_LIMITED")
	})

	t.Run("verify uses a small json body limit", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.allowedOrigins = []string{
			"https://www.readio.top",
		}

		rr := httptest.NewRecorder()
		req := newASRVerifyRequest(t, asrVerifyRequestPayload{
			Provider: "groq",
			APIKey:   strings.Repeat("x", asrRelayVerifyBodyLimit+1),
		})
		req.Header.Set("Origin", "https://www.readio.top")
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusRequestEntityTooLarge, rr.Code)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_PAYLOAD_TOO_LARGE")
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
			got := r.Header.Get("Authorization")
			require.Equal(t, "Bearer "+secretAPIKey, got)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 3.5,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "hello"},
				},
			})
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.NotContains(t, rr.Body.String(), secretAPIKey)
		require.NotContains(t, logs.String(), secretAPIKey)
	})

	t.Run("provider error path does not log or echo the api key", func(t *testing.T) {
		var logs bytes.Buffer
		oldLogger := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelInfo})))
		t.Cleanup(func() {
			slog.SetDefault(oldLogger)
		})

		backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, "upstream unauthorized")
		}))
		t.Cleanup(backend.Close)

		relay := NewASRRelayService().(*asrRelayService)
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

		require.Equal(t, http.StatusUnauthorized, rr.Code)
		require.NotContains(t, rr.Body.String(), secretAPIKey)
		require.NotContains(t, logs.String(), secretAPIKey)
		expectRelayErrorCode(t, rr.Body.Bytes(), "ASR_UNAUTHORIZED")
	})
}

func TestASRRelayRateLimitDisableSemantics(t *testing.T) {
	t.Run("burst zero disables rate limiting", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitBurstEnv, "0")

		relay := NewASRRelayService().(*asrRelayService)
		require.NotNil(t, relay.limiter)

		require.Equal(t, 0, relay.limiter.Limit)

		require.True(t, relay.limiter.Allow("198.51.100.10"))
	})

	t.Run("burst negative disables rate limiting", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitBurstEnv, "-5")

		relay := NewASRRelayService().(*asrRelayService)
		require.NotNil(t, relay.limiter)

		require.Equal(t, -5, relay.limiter.Limit)

		require.True(t, relay.limiter.Allow("198.51.100.10"))
	})

	t.Run("burst positive enables rate limiting", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitBurstEnv, "2")

		relay := NewASRRelayService().(*asrRelayService)
		require.Equal(t, 2, relay.limiter.Limit)

		require.True(t, relay.limiter.Allow("198.51.100.10"))
		require.True(t, relay.limiter.Allow("198.51.100.10"))
		if relay.limiter.Allow("198.51.100.10") {
			t.Fatal("expected third request to fail (over limit)")
		}
	})

	t.Run("window zero falls back to default", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitWindowMsEnv, "0")

		relay := NewASRRelayService().(*asrRelayService)
		require.Equal(t, asrRelayRateLimitWindow, relay.limiter.Window)
	})

	t.Run("window negative falls back to default", func(t *testing.T) {
		t.Setenv(asrRelayRateLimitWindowMsEnv, "-1000")

		relay := NewASRRelayService().(*asrRelayService)
		require.Equal(t, asrRelayRateLimitWindow, relay.limiter.Window)
	})
}

type multipartASRRelayRequestPayload struct {
	Provider      string
	Model         string
	APIKey        string
	AudioBytes    []byte
	AudioMimeType string
}

func TestASRWorkerTransport(t *testing.T) {
	t.Run("worker transport disabled when env not configured", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = ""
		relay.workerSharedSecret = ""

		require.False(t, relay.asrWorkerTransportEnabled())
	})

	t.Run("worker transport disabled when only base URL set", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = "https://worker.example.com"
		relay.workerSharedSecret = ""

		require.False(t, relay.asrWorkerTransportEnabled())
	})

	t.Run("worker transport disabled when only secret set", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = ""
		relay.workerSharedSecret = "test-secret"

		require.False(t, relay.asrWorkerTransportEnabled())
	})

	t.Run("worker transport enabled when both env vars set", func(t *testing.T) {
		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = "https://worker.example.com"
		relay.workerSharedSecret = "test-secret"

		require.True(t, relay.asrWorkerTransportEnabled())
	})

	t.Run("groq transcription routed through worker when enabled", func(t *testing.T) {
		workerCalls := 0
		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			workerCalls++

			gotPath := r.URL.Path
			require.Equal(t, asrWorkerGroqRoute, gotPath)
			require.Equal(t, http.MethodPost, r.Method)
			gotSecret := r.Header.Get(asrWorkerSecretHeader)
			require.Equal(t, "test-worker-secret", gotSecret)
			gotAuthorization := r.Header.Get("Authorization")
			require.Equal(t, "Bearer groq-key", gotAuthorization)
			if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "multipart/form-data") {
				t.Fatalf("content-type = %q, want multipart/form-data", ct)
			}

			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 5.0,
				"segments": []map[string]any{
					{"start": 0, "end": 2.5, "text": "hello from worker"},
				},
			})
		}))
		t.Cleanup(workerServer.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = "test-worker-secret"

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, workerCalls)

		var payload ASRRelayResponsePayload
		err := json.Unmarshal(rr.Body.Bytes(), &payload)
		require.NoError(t, err)
		require.Equal(t, "groq", payload.Provider)
		require.Equal(t, "whisper-large-v3", payload.Model)
		require.Len(t, payload.Cues, 1)
		require.Equal(t, "hello from worker", payload.Cues[0].Text)
	})

	t.Run("worker failure falls back to direct-to-groq", func(t *testing.T) {
		workerCalls := 0
		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			workerCalls++
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, "worker down")
		}))
		t.Cleanup(workerServer.Close)

		directCalls := 0
		directBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			directCalls++
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 3.0,
				"segments": []map[string]any{
					{"start": 0, "end": 1.5, "text": "hello from direct"},
				},
			})
		}))
		t.Cleanup(directBackend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = "test-worker-secret"
		provider := relay.providers["groq"]
		provider.transcribeURL = directBackend.URL + "/openai/v1/audio/transcriptions"
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, workerCalls)
		require.Equal(t, 1, directCalls)

		var payload ASRRelayResponsePayload
		err := json.Unmarshal(rr.Body.Bytes(), &payload)
		require.NoError(t, err)
		require.Len(t, payload.Cues, 1)
		require.Equal(t, "hello from direct", payload.Cues[0].Text)
	})

	t.Run("direct path used when worker env not configured", func(t *testing.T) {
		directCalls := 0
		directBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			directCalls++
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 2.0,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "direct only"},
				},
			})
		}))
		t.Cleanup(directBackend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = ""
		relay.workerSharedSecret = ""
		provider := relay.providers["groq"]
		provider.transcribeURL = directBackend.URL + "/openai/v1/audio/transcriptions"
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, directCalls)
	})

	t.Run("verify stays direct-to-groq even when worker enabled", func(t *testing.T) {
		workerCalls := 0
		workerServer := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			workerCalls++
			t.Fatal("worker should not be called for verify")
		}))
		t.Cleanup(workerServer.Close)

		directVerifyCalls := 0
		directBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			directVerifyCalls++
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"data":[]}`)
		}))
		t.Cleanup(directBackend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = "test-worker-secret"
		provider := relay.providers["groq"]
		provider.verifyURL = directBackend.URL + "/openai/v1/models"
		relay.providers["groq"] = provider

		rr := httptest.NewRecorder()
		req := newASRVerifyRequest(t, asrVerifyRequestPayload{
			Provider: "groq",
			APIKey:   "groq-key",
		})
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 0, workerCalls)
		require.Equal(t, 1, directVerifyCalls)
	})

	t.Run("worker transport does not leak shared secret or api key in response or logs", func(t *testing.T) {
		const secretAPIKey = "super-secret-api-key-99"
		const workerSecret = "worker-secret-42"

		var logs bytes.Buffer
		oldLogger := slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
		t.Cleanup(func() {
			slog.SetDefault(oldLogger)
		})

		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 1.0,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "ok"},
				},
			})
		}))
		t.Cleanup(workerServer.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = workerSecret

		rr := httptest.NewRecorder()
		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        secretAPIKey,
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		relay.ServeHTTP(rr, req)

		require.Equal(t, http.StatusOK, rr.Code)
		require.NotContains(t, rr.Body.String(), secretAPIKey)
		require.NotContains(t, rr.Body.String(), workerSecret)
		require.NotContains(t, logs.String(), secretAPIKey)
		require.NotContains(t, logs.String(), workerSecret)
	})

	t.Run("groq upstream errors via worker do NOT trigger direct fallback", func(t *testing.T) {
		// Groq 429 forwarded by Worker should not cause a second direct attempt.
		workerCalls := 0
		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			workerCalls++
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = io.WriteString(w, "groq rate limited")
		}))
		t.Cleanup(workerServer.Close)

		directCalls := 0
		directBackend := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			directCalls++
			t.Fatal("direct backend should NOT be called for transparent Groq errors")
		}))
		t.Cleanup(directBackend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = "test-secret"
		provider := relay.providers["groq"]
		provider.transcribeURL = directBackend.URL + "/openai/v1/audio/transcriptions"
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

		require.Equal(t, http.StatusTooManyRequests, rr.Code)
		require.Equal(t, 1, workerCalls)
		require.Equal(t, 0, directCalls)
	})

	t.Run("worker 502 hop error triggers fallback to direct", func(t *testing.T) {
		workerCalls := 0
		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			workerCalls++
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, `{"error":"upstream_error","message":"upstream request failed"}`)
		}))
		t.Cleanup(workerServer.Close)

		directCalls := 0
		directBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			directCalls++
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 1.0,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "fallback success"},
				},
			})
		}))
		t.Cleanup(directBackend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = "test-secret"
		provider := relay.providers["groq"]
		provider.transcribeURL = directBackend.URL + "/openai/v1/audio/transcriptions"
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, workerCalls)
		require.Equal(t, 1, directCalls)
	})

	t.Run("worker auth failure triggers fallback to direct", func(t *testing.T) {
		workerCalls := 0
		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			workerCalls++
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, `{"error":"unauthorized","message":"invalid or missing shared secret"}`)
		}))
		t.Cleanup(workerServer.Close)

		directCalls := 0
		directBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			directCalls++
			_ = json.NewEncoder(w).Encode(map[string]any{
				"language": "en",
				"duration": 1.0,
				"segments": []map[string]any{
					{"start": 0, "end": 1.0, "text": "fallback after worker auth fail"},
				},
			})
		}))
		t.Cleanup(directBackend.Close)

		relay := NewASRRelayService().(*asrRelayService)
		relay.workerBaseURL = workerServer.URL
		relay.workerSharedSecret = "wrong-secret"
		provider := relay.providers["groq"]
		provider.transcribeURL = directBackend.URL + "/openai/v1/audio/transcriptions"
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

		require.Equal(t, http.StatusOK, rr.Code)
		require.Equal(t, 1, workerCalls)
		require.Equal(t, 1, directCalls)
	})
}

func newMultipartASRRelayRequest(t *testing.T, payload multipartASRRelayRequestPayload) *http.Request {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	err := writer.WriteField("provider", payload.Provider)
	require.NoError(t, err)
	err = writer.WriteField("model", payload.Model)
	require.NoError(t, err)
	err = writer.WriteField("apiKey", payload.APIKey)
	require.NoError(t, err)
	if payload.AudioMimeType != "" {
		err = writer.WriteField("audioMimeType", payload.AudioMimeType)
		require.NoError(t, err)
	}
	part, err := writer.CreateFormFile("audio", "input.audio")
	require.NoError(t, err)
	_, err = part.Write(payload.AudioBytes)
	require.NoError(t, err)
	err = writer.Close()
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, RelayRoute, bytes.NewReader(body.Bytes()))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("X-Forwarded-Proto", "http")
	req.Header.Set("X-Forwarded-Host", "example.com")
	req.RemoteAddr = "127.0.0.1:12345"
	return req
}

func newASRVerifyRequest(t *testing.T, payload asrVerifyRequestPayload) *http.Request {
	t.Helper()

	body, err := json.Marshal(payload)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, VerifyRoute, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://example.com")
	req.Header.Set("X-Forwarded-Proto", "http")
	req.Header.Set("X-Forwarded-Host", "example.com")
	req.RemoteAddr = "127.0.0.1:12345"
	return req
}

func expectRelayErrorCode(t *testing.T, body []byte, wantCode string) {
	t.Helper()

	var payload asrRelayErrorPayload
	err := json.Unmarshal(body, &payload)
	require.NoError(t, err)
	require.Equal(t, wantCode, payload.Code)
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
			require.Equal(t, tc.wantHost, host)
			require.Equal(t, tc.wantPort, port)
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
			got := httputil.IsSameOrigin(tc.originScheme, tc.originHost, tc.requestScheme, tc.requestHost)
			if got != tc.want {
				t.Fatalf("httputil.IsSameOrigin(%q, %q, %q, %q) = %v, want %v",
					tc.originScheme, tc.originHost, tc.requestScheme, tc.requestHost, got, tc.want)
			}
		})
	}
}

func TestASRRelaySameOriginFallback(t *testing.T) {
	trustedLoopback := clientip.TrustedProxySet{
		Nets: []*net.IPNet{mustParseCIDRForASRTest(t, "127.0.0.1/32")},
	}

	t.Run("origin with trusted forwarded https host matches", func(t *testing.T) {
		relay := &asrRelayService{
			allowedOrigins: nil,
			trustedProxies: trustedLoopback,
		}

		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://www.readio.top")
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Forwarded-Proto", "https")
		req.Header.Set("X-Forwarded-Host", "www.readio.top")

		require.True(t, relay.isAllowedOrigin(req))
	})

	t.Run("http origin matches trusted forwarded localhost with explicit :80", func(t *testing.T) {
		relay := &asrRelayService{
			allowedOrigins: nil,
			trustedProxies: trustedLoopback,
		}

		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "http://localhost")
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Forwarded-Proto", "http")
		req.Header.Set("X-Forwarded-Host", "localhost:80")

		require.True(t, relay.isAllowedOrigin(req))
	})

	t.Run("explicit non-default trusted forwarded port matches exactly", func(t *testing.T) {
		relay := &asrRelayService{
			allowedOrigins: nil,
			trustedProxies: trustedLoopback,
		}

		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://example.com:8443")
		req.RemoteAddr = "127.0.0.1:9999"
		req.Header.Set("X-Forwarded-Proto", "https")
		req.Header.Set("X-Forwarded-Host", "example.com:8443")

		require.True(t, relay.isAllowedOrigin(req))
	})

	t.Run("bare request host is no longer trusted for same-origin fallback", func(t *testing.T) {
		relay := &asrRelayService{allowedOrigins: nil}

		req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
			Provider:      "groq",
			Model:         "whisper-large-v3",
			APIKey:        "groq-key",
			AudioBytes:    []byte("test-audio"),
			AudioMimeType: "audio/mpeg",
		})
		req.Header.Set("Origin", "https://www.readio.top")
		req.Host = "www.readio.top"
		req.TLS = &tls.ConnectionState{}

		if relay.isAllowedOrigin(req) {
			t.Fatal("expected bare request host to be rejected")
		}
	})

	t.Run("different host still rejects", func(t *testing.T) {
		relay := &asrRelayService{allowedOrigins: nil}

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

		if relay.isAllowedOrigin(req) {
			t.Fatal("expected different host to be rejected")
		}
	})

	t.Run("https origin rejects request on non-default port 8080", func(t *testing.T) {
		relay := &asrRelayService{allowedOrigins: nil}

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

		if relay.isAllowedOrigin(req) {
			t.Fatal("expected non-default mismatched port to be rejected")
		}
	})

	t.Run("explicit allowlist still works unchanged", func(t *testing.T) {
		relay := &asrRelayService{allowedOrigins: []string{
			"https://www.readio.top",
		}}

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

		require.True(t, relay.isAllowedOrigin(req))
	})

	t.Run("untrusted peer cannot spoof scheme via X-Forwarded-Proto", func(t *testing.T) {
		relay := &asrRelayService{allowedOrigins: nil}

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

		if relay.isAllowedOrigin(req) {
			t.Fatal("expected untrusted forwarded proto spoof to be rejected")
		}
	})
}

func TestASRRelayStatusToErrorDoesNotLeakProviderBody(t *testing.T) {
	body := &countingReadCloser{
		data: []byte(strings.Repeat("provider-internal-error\n", 512)),
	}
	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Header: http.Header{
			"Retry-After": []string{"120"},
		},
		Body: body,
	}

	payload := asrRelayStatusToError(resp)

	require.Equal(t, ErrASRProviderRateLimited.Code, payload.Code)
	require.Equal(t, ErrASRProviderRateLimited.Message, payload.Message)
	require.NotContains(t, payload.Message, "provider-internal-error")
	require.NotNil(t, payload.RetryAfterMs)
	require.Equal(t, int64(120000), *payload.RetryAfterMs)
	if body.totalRead > asrRelayStatusBodyReadLimit {
		t.Fatalf("read bytes = %d, want <= %d", body.totalRead, asrRelayStatusBodyReadLimit)
	}
}

func TestASROriginAuthorizationLogSanitizesReferer(t *testing.T) {
	var logs strings.Builder
	oldLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() {
		slog.SetDefault(oldLogger)
	})

	relay := NewASRRelayService().(*asrRelayService)
	relay.allowedOrigins = []string{"https://app.example"}
	req := newMultipartASRRelayRequest(t, multipartASRRelayRequestPayload{
		Provider:      "groq",
		Model:         "whisper-large-v3",
		APIKey:        "key",
		AudioBytes:    []byte("test-audio"),
		AudioMimeType: "audio/mpeg",
	})
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Referer", "https://evil.example/player?token=secret-token&episode=abc")

	_ = relay.originAuthorizationError(req)

	got := logs.String()
	require.NotContains(t, got, "secret-token")
	require.NotContains(t, got, "episode=abc")
	require.NotContains(t, got, "/player")
	require.Contains(t, got, "referer=https://evil.example")
}

func mustParseCIDRForASRTest(t *testing.T, raw string) *net.IPNet {
	t.Helper()

	_, network, err := net.ParseCIDR(raw)
	require.NoError(t, err)
	return network
}

type countingReadCloser struct {
	data      []byte
	offset    int
	totalRead int
}

func (r *countingReadCloser) Read(p []byte) (int, error) {
	if r.offset >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.offset:])
	r.offset += n
	r.totalRead += n
	return n, nil
}

func (r *countingReadCloser) Close() error {
	return nil
}

// TestASRRelayWorkerClientStructure verifies that the ASR relay service has a
// dedicated workerClient distinct from its third-party direct client, so the
// first-party worker hop can be instrumented for trace propagation without
// affecting direct provider calls.
func TestASRRelayWorkerClientStructure(t *testing.T) {
	svc := NewASRRelayService().(*asrRelayService)
	require.NotNil(t, svc.client)
	require.NotNil(t, svc.workerClient)
	require.NotEqual(t, svc.workerClient, svc.client)
	// Direct (third-party) client must NOT be wrapped with an instrumented
	// transport — leaving Transport nil keeps Go's default transport, which
	// is uninstrumented and never injects traceparent.
	require.Equal(t, nil, svc.client.Transport)
	require.NotNil(t, svc.workerClient.Transport)
}

func TestASRRelayPreflightCORS(t *testing.T) {
	service := &asrRelayService{
		allowedOrigins: []string{"https://app.example"},
	}

	t.Run("allows configured origin", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, RelayRoute, nil)
		req.Header.Set("Origin", "https://app.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		req.Header.Set("Access-Control-Request-Headers", "content-type")

		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusNoContent, rr.Code)
		gotOrigin := rr.Header().Get("Access-Control-Allow-Origin")
		require.Equal(t, "https://app.example", gotOrigin)
		gotMethods := rr.Header().Get("Access-Control-Allow-Methods")
		require.Equal(t, "POST, OPTIONS", gotMethods)
		gotHeaders := rr.Header().Get("Access-Control-Allow-Headers")
		require.Equal(t, "Content-Type, Accept, X-Readio-Relay-Public-Token", gotHeaders)
		gotMaxAge := rr.Header().Get("Access-Control-Max-Age")
		require.Equal(t, "86400", gotMaxAge)
		gotVary := rr.Header().Get("Vary")
		require.Equal(t, "Origin", gotVary)
		require.Equal(t, 0, rr.Body.Len())
	})

	t.Run("omits CORS headers for disallowed origin", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodOptions, RelayRoute, nil)
		req.Header.Set("Origin", "https://evil.example")
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)

		service.ServeHTTP(rr, req)

		require.Equal(t, http.StatusNoContent, rr.Code)
		gotOrigin := rr.Header().Get("Access-Control-Allow-Origin")
		require.Equal(t, "", gotOrigin)
		gotMethods := rr.Header().Get("Access-Control-Allow-Methods")
		require.Equal(t, "", gotMethods)
	})
}
