package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	lokiURLEnv                = "READIO_GRAFANA_LOKI_URL"
	lokiUserEnv               = "READIO_GRAFANA_LOKI_USER"
	lokiTokenEnv              = "READIO_GRAFANA_LOKI_TOKEN"
	lokiLogLevelEnv           = "READIO_LOKI_LOG_LEVEL"
	lokiBatchSizeEnv          = "READIO_LOKI_BATCH_SIZE"
	lokiFlushIntervalEnv      = "READIO_LOKI_FLUSH_INTERVAL_SECONDS"
	lokiQueueSizeEnv          = "READIO_LOKI_QUEUE_SIZE"
	lokiDefaultBatchSize      = 100
	lokiDefaultFlushInterval  = 5 * time.Second
	lokiDefaultQueueSize      = 1000
	lokiDefaultRequestTimeout = 3 * time.Second
	deployEnvEnv              = "READIO_DEPLOY_ENV"
)

type lokiConfig struct {
	Enabled       bool
	URL           string
	User          string
	Token         string
	Env           string
	MinLevel      slog.Level
	BatchSize     int
	FlushInterval time.Duration
	QueueSize     int
}

type lokiQueue interface {
	Enqueue(adminLogEntry) bool
}

type lokiShipper struct {
	cfg        lokiConfig
	client     *http.Client
	queue      chan adminLogEntry
	stop       chan struct{}
	done       chan struct{}
	stopOnce   sync.Once
	stopped    atomic.Bool
	dropped    atomic.Uint64
	flushErrs  atomic.Uint64
	logSignals atomic.Uint64
}

type lokiPushRequest struct {
	Streams []lokiStream `json:"streams"`
}

type lokiStream struct {
	Stream map[string]string `json:"stream"`
	Values [][2]string       `json:"values"`
}

func resolveLokiConfig() lokiConfig {
	urlValue := strings.TrimSpace(os.Getenv(lokiURLEnv))
	user := strings.TrimSpace(os.Getenv(lokiUserEnv))
	token := strings.TrimSpace(os.Getenv(lokiTokenEnv))
	cfg := lokiConfig{
		URL:           urlValue,
		User:          user,
		Token:         token,
		Env:           resolveLokiEnv(),
		MinLevel:      resolveLokiLevel(),
		BatchSize:     envIntOrDefault(lokiBatchSizeEnv, lokiDefaultBatchSize, false),
		FlushInterval: envDurationSecondsOrDefault(lokiFlushIntervalEnv, lokiDefaultFlushInterval),
		QueueSize:     envIntOrDefault(lokiQueueSizeEnv, lokiDefaultQueueSize, false),
	}
	cfg.Enabled = cfg.URL != "" && cfg.User != "" && cfg.Token != ""
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = lokiDefaultBatchSize
	}
	if cfg.QueueSize <= 0 {
		cfg.QueueSize = lokiDefaultQueueSize
	}
	if cfg.FlushInterval <= 0 {
		cfg.FlushInterval = lokiDefaultFlushInterval
	}
	return cfg
}

func resolveLokiLevel() slog.Level {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(lokiLogLevelEnv))) {
	case "debug":
		return slog.LevelDebug
	case "", "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		slog.Warn("invalid Loki log level; using default", "env", lokiLogLevelEnv)
		return slog.LevelInfo
	}
}

func normalizeLokiEnv(raw string) string {
	return normalizeMetricEnv(raw)
}

func resolveLokiEnv() string {
	if v := strings.TrimSpace(os.Getenv(deployEnvEnv)); v != "" {
		return normalizeLokiEnv(v)
	}
	return normalizeLokiEnv(os.Getenv("VITE_GRAFANA_FARO_ENV"))
}

func newLokiShipper(cfg lokiConfig, client *http.Client) *lokiShipper {
	if client == nil {
		client = &http.Client{Timeout: lokiDefaultRequestTimeout}
	} else if client.Timeout == 0 {
		copied := *client
		copied.Timeout = lokiDefaultRequestTimeout
		client = &copied
	}
	s := &lokiShipper{
		cfg:    cfg,
		client: client,
		queue:  make(chan adminLogEntry, cfg.QueueSize),
		stop:   make(chan struct{}),
		done:   make(chan struct{}),
	}
	go s.run()
	return s
}

func initLokiShipper() (*lokiShipper, error) {
	cfg := resolveLokiConfig()
	if !cfg.Enabled {
		slog.Info("observability: Loki log push disabled (set READIO_GRAFANA_LOKI_URL, READIO_GRAFANA_LOKI_USER, READIO_GRAFANA_LOKI_TOKEN to enable)")
		return nil, nil
	}
	slog.Info("observability: Loki log push enabled", "url", cfg.URL, "env", cfg.Env)
	return newLokiShipper(cfg, nil), nil
}

func (s *lokiShipper) Enqueue(entry adminLogEntry) bool {
	if s == nil || s.stopped.Load() || entryLevel(entry.Level) < s.cfg.MinLevel {
		return true
	}
	select {
	case s.queue <- entry:
		return true
	default:
		dropped := s.dropped.Add(1)
		if dropped == 1 || dropped%100 == 0 {
			s.emitLocalSignal("loki queue full; dropping logs", "dropped", dropped)
		}
		return false
	}
}

func (s *lokiShipper) Dropped() uint64 {
	if s == nil {
		return 0
	}
	return s.dropped.Load()
}

func (s *lokiShipper) run() {
	defer close(s.done)
	ticker := time.NewTicker(s.cfg.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			_ = s.Flush(context.Background())
		case <-s.stop:
			return
		}
	}
}

func (s *lokiShipper) Flush(ctx context.Context) error {
	if s == nil {
		return nil
	}
	batchCap := s.flushBatchCap()
	for {
		batch := make([]adminLogEntry, 0, minInt(len(s.queue), batchCap))
		for len(batch) < batchCap {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case entry := <-s.queue:
				batch = append(batch, entry)
			default:
				if len(batch) == 0 {
					return nil
				}
				return s.flushBatch(ctx, batch)
			}
		}
		if err := s.flushBatch(ctx, batch); err != nil {
			return err
		}
	}
}

func (s *lokiShipper) flushBatchCap() int {
	if s == nil || s.cfg.BatchSize <= 0 {
		return lokiDefaultBatchSize
	}
	return s.cfg.BatchSize
}

func (s *lokiShipper) Shutdown(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.stopOnce.Do(func() {
		s.stopped.Store(true)
		close(s.stop)
	})
	select {
	case <-s.done:
	case <-ctx.Done():
		return ctx.Err()
	}
	return s.Flush(ctx)
}

func (s *lokiShipper) flushBatch(ctx context.Context, entries []adminLogEntry) error {
	payload, err := buildLokiPayload(s.cfg, entries)
	if err != nil {
		return err
	}
	if len(payload.Streams) == 0 {
		return nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(s.cfg.User+":"+s.cfg.Token)))

	resp, err := s.client.Do(req)
	if err != nil {
		s.recordFlushError(err)
		return nil
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		s.recordFlushError(fmt.Errorf("loki push status %d", resp.StatusCode))
		return nil
	}
	return nil
}

func (s *lokiShipper) recordFlushError(err error) {
	count := s.flushErrs.Add(1)
	if count == 1 || count%100 == 0 {
		s.emitLocalSignal("loki push failed", "failures", count, "error", err)
	}
}

func (s *lokiShipper) emitLocalSignal(msg string, attrs ...any) {
	if s.logSignals.Add(1) > 20 {
		return
	}
	record := slog.NewRecord(time.Now(), slog.LevelWarn, msg, 0)
	record.Add(attrs...)
	handler := slog.Default().Handler()
	if adminHandler, ok := handler.(*adminSlogHandler); ok {
		handler = adminHandler.delegate()
	}
	_ = handler.Handle(context.Background(), record)
}

func buildLokiPayload(cfg lokiConfig, entries []adminLogEntry) (lokiPushRequest, error) {
	streamsByKey := make(map[string]*lokiStream)
	for _, entry := range entries {
		level := normalizeLokiLevel(entry.Level)
		if level == "" {
			continue
		}
		key := cfg.Env + "\x00" + level
		stream := streamsByKey[key]
		if stream == nil {
			stream = &lokiStream{
				Stream: map[string]string{
					"service": "readio-cloud",
					"env":     cfg.Env,
					"level":   level,
				},
			}
			streamsByKey[key] = stream
		}
		line, err := json.Marshal(lokiLogLine(entry))
		if err != nil {
			return lokiPushRequest{}, err
		}
		stream.Values = append(stream.Values, [2]string{
			strconv.FormatInt(entry.Ts.UnixNano(), 10),
			string(line),
		})
	}

	out := lokiPushRequest{Streams: make([]lokiStream, 0, len(streamsByKey))}
	for _, stream := range streamsByKey {
		out.Streams = append(out.Streams, *stream)
	}
	return out, nil
}

func lokiLogLine(entry adminLogEntry) map[string]any {
	line := map[string]any{
		"ts":    entry.Ts.UTC().Format(time.RFC3339Nano),
		"level": normalizeLokiLevel(entry.Level),
		"msg":   entry.Msg,
	}
	if entry.Route != "" {
		line["route"] = entry.Route
	}
	if entry.Status != 0 {
		line["status"] = entry.Status
	}
	if entry.ElapsedMs != 0 {
		line["elapsed_ms"] = entry.ElapsedMs
	}
	if entry.ErrorClass != "" {
		line["error_class"] = entry.ErrorClass
	}
	if requestID := sanitizedAttr(entry.Attrs, "request_id"); requestID != "" {
		line["request_id"] = requestID
	}
	if entry.TraceID != "" {
		line["trace_id"] = entry.TraceID
	}
	if entry.SpanID != "" {
		line["span_id"] = entry.SpanID
	}
	return line
}

func sanitizedAttr(attrs map[string]string, key string) string {
	if attrs == nil {
		return ""
	}
	value := strings.TrimSpace(attrs[key])
	if value == "" || value == "[REDACTED]" {
		return ""
	}
	return value
}

func normalizeLokiLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return "debug"
	case "info":
		return "info"
	case "warn", "warning":
		return "warn"
	case "error":
		return "error"
	default:
		return ""
	}
}

func entryLevel(level string) slog.Level {
	switch normalizeLokiLevel(level) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
