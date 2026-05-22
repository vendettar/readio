package observability

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultRuntimeAppVersion = "1.0.0"
	deployEnvEnv             = "READIO_DEPLOY_ENV"
)

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envDurationSecondsOrDefault(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		slog.Warn("invalid duration environment value; using default", "env", name, "unit", "s")
		return fallback
	}
	return time.Duration(value) * time.Second
}

func NormalizeMetricEnv(env string) string {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "prod", "production":
		return "production"
	case "pre", "preprod", "preproduction", "staging":
		return "preproduction"
	case "dev", "develop":
		return "develop"
	default:
		return "unknown"
	}
}
