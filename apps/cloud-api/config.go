package main

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

func envIntOrDefault(name string, fallback int, allowNonPositive bool) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || (!allowNonPositive && value <= 0) {
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
