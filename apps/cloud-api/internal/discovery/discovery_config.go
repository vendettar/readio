package discovery

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

func resolveDiscoveryAllowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv(discoveryAllowedOriginsEnv))
	if raw == "" {
		return nil
	}

	var origins []string
	for _, part := range strings.Split(raw, ",") {
		candidate := strings.TrimSpace(part)
		if candidate == "" || !strings.Contains(candidate, "://") {
			continue
		}
		origins = append(origins, candidate)
	}
	if len(origins) == 0 {
		return nil
	}
	return origins
}

func resolveDiscoverySearchRateLimitBurst() int {
	return envIntOrDefaultAllowNonPositive(discoverySearchRateLimitBurstEnv, discoverySearchRateLimitBurst)
}

func resolveDiscoverySearchRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(discoverySearchRateLimitWindowMsEnv, discoverySearchRateLimitWindow)
}

func resolveDiscoveryTopRateLimitBurst() int {
	return envIntOrDefaultAllowNonPositive(discoveryTopRateLimitBurstEnv, discoveryTopRateLimitBurst)
}

func resolveDiscoveryTopRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(discoveryTopRateLimitWindowMsEnv, discoveryTopRateLimitWindow)
}

func resolveDiscoveryPodcastIndexRateLimitBurst() int {
	return envIntOrDefaultAllowNonPositive(discoveryPodcastIndexRateLimitBurstEnv, discoveryPodcastIndexRateLimitBurst)
}

func resolveDiscoveryPodcastIndexRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(discoveryPodcastIndexRateLimitWindowMsEnv, discoveryPodcastIndexRateLimitWindow)
}

func resolveDiscoveryPodcastIndexLocalReadRateLimitBurst() int {
	return envIntOrDefaultAllowNonPositive(discoveryPodcastIndexLocalReadRateLimitBurstEnv, discoveryPodcastIndexLocalReadRateLimitBurst)
}

func resolveDiscoveryPodcastIndexLocalReadRateLimitWindow() time.Duration {
	return envDurationMillisOrDefault(discoveryPodcastIndexLocalReadRateLimitWindowMsEnv, discoveryPodcastIndexLocalReadRateLimitWindow)
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
		slog.Warn("invalid duration milliseconds environment value; using default", "env", name)
		return fallback
	}
	return time.Duration(value) * time.Millisecond
}
