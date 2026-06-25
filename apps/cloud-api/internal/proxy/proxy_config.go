package proxy

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

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
