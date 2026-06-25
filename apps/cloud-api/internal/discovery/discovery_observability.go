package discovery

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"readio-cloud/internal/observability"
	"readio-cloud/internal/podcastindex"
)

func logDiscoveryRequest(ctx context.Context, route, upstreamKind, upstreamHost string, elapsed time.Duration, err error, cacheStatus string) {
	logDiscoveryRequestWithStatus(ctx, route, upstreamKind, upstreamHost, elapsed, err, cacheStatus, discoveryMetricStatus(err))
}

func logDiscoveryRequestWithStatus(ctx context.Context, route, upstreamKind, upstreamHost string, elapsed time.Duration, err error, cacheStatus string, httpStatus int) {
	// Extract hostname if a full URL was passed.
	if parsed, parseErr := url.Parse(upstreamHost); parseErr == nil && parsed.Host != "" {
		upstreamHost = parsed.Host
	}

	var upstreamStatus int
	var timedOut bool
	errorClass := classifyDiscoveryError(err)

	if err != nil {
		var statusErr *discoveryUpstreamStatusError
		if errors.As(err, &statusErr) {
			upstreamStatus = statusErr.status
		}
		if errors.Is(err, errDiscoveryTimeout) || isDiscoveryTransportTimeout(err) {
			timedOut = true
		}
	}

	observability.RecordHTTPMetric(ctx, route, httpStatus, errorClass, elapsed)
	if shouldRecordDiscoveryUpstreamMetric(route, upstreamKind, err, cacheStatus) {
		observability.RecordUpstreamMetric(ctx, upstreamKind, route, httpStatus, errorClass, cacheStatus, elapsed)
	}

	attrs := []any{
		slog.String("route", route),
		slog.String("upstream_kind", upstreamKind),
		slog.String("upstream_host", upstreamHost),
		slog.Int64("elapsed_ms", elapsed.Milliseconds()),
		slog.String("error_class", errorClass),
		slog.Int("upstream_status", upstreamStatus),
		slog.Bool("timed_out", timedOut),
		slog.String("cache_status", cacheStatus),
	}

	if elapsed >= discoverySlowRequestThreshold || err != nil {
		slog.WarnContext(ctx, "discovery request", attrs...)
	} else {
		slog.InfoContext(ctx, "discovery request", attrs...)
	}
}

func discoveryMetricStatus(err error) int {
	if err == nil {
		return http.StatusOK
	}

	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		return http.StatusBadRequest
	}

	var configErr *discoveryProviderConfigError
	if errors.As(err, &configErr) {
		return http.StatusServiceUnavailable
	}
	if errors.Is(err, errDiscoveryCacheSearchUnavailableError) {
		return http.StatusServiceUnavailable
	}

	if isDiscoveryRateLimitedError(err) {
		return http.StatusTooManyRequests
	}
	if errors.Is(err, errDiscoveryTimeout) || isDiscoveryTransportTimeout(err) {
		return http.StatusGatewayTimeout
	}
	if isDiscoveryMethodNotAllowedError(err) {
		return http.StatusMethodNotAllowed
	}
	if isDiscoveryBodyTooLargeError(err) {
		return http.StatusRequestEntityTooLarge
	}

	return http.StatusBadGateway
}

func shouldRecordDiscoveryUpstreamMetric(route, upstreamKind string, err error, cacheStatus string) bool {
	if strings.TrimSpace(upstreamKind) == "" {
		return false
	}
	if cacheStatus == CacheStatusFreshHit {
		return false
	}
	if isDiscoveryLocalRejection(route, err, cacheStatus) {
		return false
	}
	if route == discoverySearchPodcastsRoute || route == discoverySearchEpisodesRoute {
		return true
	}
	switch cacheStatus {
	case CacheStatusRefreshed, CacheStatusPersistenceFallback, CacheStatusStaleFallback, CacheStatusMissError:
		return true
	default:
		return false
	}
}

func isDiscoveryLocalRejection(route string, err error, cacheStatus string) bool {
	if err == nil {
		return route == discoveryPodcastsBatchRoute && cacheStatus == CacheStatusUncached
	}

	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		return true
	}
	var configErr *discoveryProviderConfigError
	if errors.As(err, &configErr) {
		return true
	}
	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		return true
	}
	var unmarshalTypeErr *json.UnmarshalTypeError
	if errors.As(err, &unmarshalTypeErr) {
		return true
	}

	return isDiscoveryRateLimitedError(err) ||
		isDiscoveryMethodNotAllowedError(err) ||
		isDiscoveryBodyTooLargeError(err)
}

func classifyDiscoveryError(err error) string {
	if err == nil {
		return "none"
	}

	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		return "param_error"
	}

	if errors.Is(err, errDiscoveryTimeout) || isDiscoveryTransportTimeout(err) {
		return "timeout"
	}

	var statusErr *discoveryUpstreamStatusError
	if errors.As(err, &statusErr) {
		return "upstream_status"
	}

	if errors.Is(err, errDiscoveryDecode) {
		return "decode"
	}

	if errors.Is(err, errDiscoveryTooLarge) || isDiscoveryBodyTooLargeError(err) {
		return "too_large"
	}
	if errors.Is(err, errDiscoveryCacheSearchUnavailableError) {
		return "service_unavailable"
	}

	if isDiscoveryRateLimitedError(err) {
		return "rate_limit"
	}

	if isDiscoveryMethodNotAllowedError(err) {
		return "invalid_method"
	}

	return "unknown"
}

func isDiscoveryMethodNotAllowedError(err error) bool {
	return errors.Is(err, errDiscoveryMethodNotAllowedError)
}

func isDiscoveryBodyTooLargeError(err error) bool {
	return err != nil && strings.EqualFold(strings.TrimSpace(err.Error()), "body too large")
}

func isDiscoveryRateLimitedError(err error) bool {
	return errors.Is(err, errDiscoveryRateLimited) ||
		errors.Is(err, podcastindex.ErrRateLimited)
}

func isDiscoveryTransportTimeout(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) && urlErr.Timeout() {
		return true
	}
	return os.IsTimeout(err)
}
