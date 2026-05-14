package main

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const (
	hostMetricsIntervalEnv        = "READIO_HOST_METRICS_INTERVAL_SECONDS"
	hostMetricsDefaultInterval    = 60 * time.Second
	hostMetricsMaxTranscriptFiles = 10000
	hostMetricsWalkBudget         = 200 * time.Millisecond
	hostMetricService             = "readio-cloud"

	hostMetricPathData        = "data"
	hostMetricPathSQLite      = "sqlite"
	hostMetricPathSQLiteWAL   = "sqlite_wal"
	hostMetricPathTranscripts = "transcripts"
)

var processStartedAt = time.Now()

type hostMetricsSnapshot struct {
	env                  string
	goroutines           int64
	heapAllocBytes       int64
	memorySysBytes       int64
	uptimeSeconds        int64
	cpuSecondsTotal      float64
	sqliteDBSizeBytes    int64
	sqliteWALSizeBytes   int64
	dataFSFreeBytes      int64
	dataFSTotalBytes     int64
	transcriptSizeBytes  int64
	transcriptWalkStale  bool
	transcriptConfigured bool
}

type hostMetricsCollector struct {
	mu         sync.Mutex
	interval   time.Duration
	last       time.Time
	snapshot   hostMetricsSnapshot
	now        func() time.Time
	dbPath     func() string
	transcript func() string
	env        func() string
}

func createHostMetricInstruments(meter metric.Meter) error {
	goroutines, err := meter.Int64ObservableGauge(
		"readio_cloud_process_goroutines",
		metric.WithDescription("Current number of Go goroutines."),
	)
	if err != nil {
		return err
	}
	heapAlloc, err := meter.Int64ObservableGauge(
		"readio_cloud_process_heap_alloc_bytes",
		metric.WithDescription("Bytes allocated and still in use by the Go heap."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}
	memorySys, err := meter.Int64ObservableGauge(
		"readio_cloud_process_memory_sys_bytes",
		metric.WithDescription("Bytes of memory obtained from the OS by the Go runtime."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}
	uptime, err := meter.Int64ObservableGauge(
		"readio_cloud_process_uptime_seconds",
		metric.WithDescription("Process uptime in seconds."),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}
	cpuSeconds, err := meter.Float64ObservableCounter(
		"readio_cloud_process_cpu_seconds_total",
		metric.WithDescription("Total user and system CPU seconds consumed by this process."),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}
	dbSize, err := meter.Int64ObservableGauge(
		"readio_cloud_sqlite_db_size_bytes",
		metric.WithDescription("Configured SQLite database file size."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}
	walSize, err := meter.Int64ObservableGauge(
		"readio_cloud_sqlite_wal_size_bytes",
		metric.WithDescription("Configured SQLite WAL file size when present."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}
	fsFree, err := meter.Int64ObservableGauge(
		"readio_cloud_data_filesystem_free_bytes",
		metric.WithDescription("Free bytes on the filesystem containing the configured data directory."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}
	fsTotal, err := meter.Int64ObservableGauge(
		"readio_cloud_data_filesystem_total_bytes",
		metric.WithDescription("Total bytes on the filesystem containing the configured data directory."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}
	transcripts, err := meter.Int64ObservableGauge(
		"readio_cloud_transcript_assets_size_bytes",
		metric.WithDescription("Best-effort size of configured transcript asset directory."),
		metric.WithUnit("By"),
	)
	if err != nil {
		return err
	}

	collector := newHostMetricsCollector()
	_, err = meter.RegisterCallback(func(ctx context.Context, observer metric.Observer) error {
		snapshot := collector.current()
		base := hostMetricBaseAttributes(snapshot.env)
		observer.ObserveInt64(goroutines, snapshot.goroutines, metric.WithAttributes(base...))
		observer.ObserveInt64(heapAlloc, snapshot.heapAllocBytes, metric.WithAttributes(base...))
		observer.ObserveInt64(memorySys, snapshot.memorySysBytes, metric.WithAttributes(base...))
		observer.ObserveInt64(uptime, snapshot.uptimeSeconds, metric.WithAttributes(base...))
		observer.ObserveFloat64(cpuSeconds, snapshot.cpuSecondsTotal, metric.WithAttributes(base...))
		observer.ObserveInt64(dbSize, snapshot.sqliteDBSizeBytes, metric.WithAttributes(hostMetricPathAttributes(snapshot.env, hostMetricPathSQLite)...))
		observer.ObserveInt64(walSize, snapshot.sqliteWALSizeBytes, metric.WithAttributes(hostMetricPathAttributes(snapshot.env, hostMetricPathSQLiteWAL)...))
		observer.ObserveInt64(fsFree, snapshot.dataFSFreeBytes, metric.WithAttributes(hostMetricPathAttributes(snapshot.env, hostMetricPathData)...))
		observer.ObserveInt64(fsTotal, snapshot.dataFSTotalBytes, metric.WithAttributes(hostMetricPathAttributes(snapshot.env, hostMetricPathData)...))
		if snapshot.transcriptConfigured {
			observer.ObserveInt64(transcripts, snapshot.transcriptSizeBytes, metric.WithAttributes(hostMetricPathAttributes(snapshot.env, hostMetricPathTranscripts)...))
		}
		_ = ctx
		return nil
	}, goroutines, heapAlloc, memorySys, uptime, cpuSeconds, dbSize, walSize, fsFree, fsTotal, transcripts)
	return err
}

func newHostMetricsCollector() *hostMetricsCollector {
	return &hostMetricsCollector{
		interval: resolveHostMetricsInterval(),
		now:      time.Now,
		dbPath: func() string {
			return strings.TrimSpace(os.Getenv(cloudDBEnv))
		},
		transcript: func() string {
			return strings.TrimSpace(os.Getenv(podcastTranscriptRootEnv))
		},
		env: func() string {
			if v := strings.TrimSpace(os.Getenv("READIO_DEPLOY_ENV")); v != "" {
				return v
			}
			return strings.TrimSpace(os.Getenv("VITE_GRAFANA_FARO_ENV"))
		},
	}
}

func (c *hostMetricsCollector) current() hostMetricsSnapshot {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	if !c.last.IsZero() && now.Sub(c.last) < c.interval {
		return c.snapshot
	}

	c.snapshot = collectHostMetricsSnapshot(c.dbPath(), c.transcript(), normalizeMetricEnv(c.env()), c.snapshot, now)
	c.last = now
	return c.snapshot
}

func collectHostMetricsSnapshot(dbPath, transcriptDir, env string, previous hostMetricsSnapshot, now time.Time) hostMetricsSnapshot {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	snapshot := hostMetricsSnapshot{
		env:                 normalizeMetricEnv(env),
		goroutines:          int64(runtime.NumGoroutine()),
		heapAllocBytes:      safeUint64ToInt64(mem.HeapAlloc),
		memorySysBytes:      safeUint64ToInt64(mem.Sys),
		uptimeSeconds:       int64(now.Sub(processStartedAt).Seconds()),
		cpuSecondsTotal:     getProcessCPUSeconds(),
		sqliteDBSizeBytes:   fileSizeOrZero(dbPath),
		sqliteWALSizeBytes:  fileSizeOrZero(dbPath + "-wal"),
		transcriptSizeBytes: previous.transcriptSizeBytes,
		transcriptWalkStale: previous.transcriptWalkStale,
	}

	if dir := filepath.Dir(dbPath); dbPath != "" && dir != "." {
		free, total, ok := filesystemStats(dir)
		if ok {
			snapshot.dataFSFreeBytes = free
			snapshot.dataFSTotalBytes = total
		}
	}

	if transcriptDir != "" {
		snapshot.transcriptConfigured = true
		size, complete := boundedDirectorySize(transcriptDir, hostMetricsMaxTranscriptFiles, hostMetricsWalkBudget, time.Now)
		if complete {
			snapshot.transcriptSizeBytes = size
			snapshot.transcriptWalkStale = false
		} else {
			snapshot.transcriptWalkStale = true
			slog.Warn("host metrics transcript directory collection exceeded budget")
		}
	}

	return snapshot
}

func fileSizeOrZero(path string) int64 {
	if strings.TrimSpace(path) == "" {
		return 0
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func filesystemStats(path string) (free int64, total int64, ok bool) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, false
	}
	return safeUint64ToInt64(stat.Bavail) * safeUint64ToInt64(uint64(stat.Bsize)),
		safeUint64ToInt64(stat.Blocks) * safeUint64ToInt64(uint64(stat.Bsize)),
		true
}

func boundedDirectorySize(root string, maxFiles int, budget time.Duration, now func() time.Time) (int64, bool) {
	if strings.TrimSpace(root) == "" || maxFiles <= 0 || budget <= 0 {
		return 0, false
	}

	deadline := now().Add(budget)
	var total int64
	var visited int
	complete := true

	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			if path == root {
				complete = false
				return filepath.SkipAll
			}
			return nil
		}
		if path != root && entry.IsDir() && shouldSkipHostMetricDir(entry.Name()) {
			return filepath.SkipDir
		}
		if entry.IsDir() {
			return nil
		}
		visited++
		if visited > maxFiles || now().After(deadline) {
			complete = false
			return filepath.SkipAll
		}
		info, statErr := entry.Info()
		if statErr != nil || info.IsDir() {
			return nil
		}
		total += info.Size()
		return nil
	})
	if err != nil {
		return 0, false
	}
	return total, complete
}

func shouldSkipHostMetricDir(name string) bool {
	return strings.HasPrefix(name, ".") || strings.HasPrefix(strings.ToLower(name), "tmp")
}

func resolveHostMetricsInterval() time.Duration {
	return envDurationSecondsOrDefault(hostMetricsIntervalEnv, hostMetricsDefaultInterval)
}

// getProcessCPUSeconds returns the total user + system CPU seconds consumed
// by this process using getrusage(2). It works on Linux and macOS.
func getProcessCPUSeconds() float64 {
	var rusage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &rusage); err != nil {
		return 0
	}
	return float64(rusage.Utime.Sec) + float64(rusage.Utime.Usec)/1e6 +
		float64(rusage.Stime.Sec) + float64(rusage.Stime.Usec)/1e6
}

func normalizeMetricEnv(env string) string {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "prod", "production":
		return "production"
	case "pre", "preprod", "preproduction", "staging":
		return "preproduction"
	default:
		return "unknown"
	}
}

func hostMetricBaseAttributes(env string) []attribute.KeyValue {
	return []attribute.KeyValue{
		attribute.String("service", hostMetricService),
		attribute.String("env", normalizeMetricEnv(env)),
	}
}

func hostMetricPathAttributes(env string, pathClass string) []attribute.KeyValue {
	return append(hostMetricBaseAttributes(env), attribute.String("path_class", normalizeHostMetricPathClass(pathClass)))
}

func normalizeHostMetricPathClass(pathClass string) string {
	switch pathClass {
	case hostMetricPathData, hostMetricPathSQLite, hostMetricPathSQLiteWAL, hostMetricPathTranscripts:
		return pathClass
	default:
		return "unknown"
	}
}

func safeUint64ToInt64(v uint64) int64 {
	const maxInt64 = uint64(^uint64(0) >> 1)
	if v > maxInt64 {
		return int64(maxInt64)
	}
	return int64(v)
}
