package asr

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

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
