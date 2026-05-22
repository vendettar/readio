package observability

import (
	"context"
	"net/http"
	"testing"
	"time"
	"github.com/stretchr/testify/require"
)

func TestRequestMetricLabelMappersUseClosedEnums(t *testing.T) {
	tests := []struct {
		name string
		got  string
		want string
	}{
		{name: "status 2xx", got: metricStatusClass(http.StatusOK), want: "2xx"},
		{name: "status 3xx", got: metricStatusClass(http.StatusTemporaryRedirect), want: "3xx"},
		{name: "status 4xx", got: metricStatusClass(http.StatusBadRequest), want: "4xx"},
		{name: "status 5xx", got: metricStatusClass(http.StatusBadGateway), want: "5xx"},
		{name: "status unknown", got: metricStatusClass(0), want: "unknown"},
		{name: "raw error class", got: metricErrorClass("dial tcp: raw secret host failed"), want: "unknown"},
		{name: "cache fresh hit", got: metricCacheStatus(cacheStatusFreshHit), want: "hit"},
		{name: "cache refreshed", got: metricCacheStatus(cacheStatusRefreshed), want: "miss"},
		{name: "cache persistence fallback", got: metricCacheStatus(cacheStatusPersistenceFallback), want: "miss"},
		{name: "cache stale fallback", got: metricCacheStatus(cacheStatusStaleFallback), want: "stale"},
		{name: "cache uncached", got: metricCacheStatus(cacheStatusUncached), want: "bypass"},
		{name: "provider apple search", got: metricProvider(upstreamKindAppleSearch), want: "apple"},
		{name: "provider raw host", got: metricProvider("https://secret.example.test?q=1"), want: "unknown"},
		{name: "asr worker mode", got: ResolveASRRelayMode("groq", ASRRelayTransportWorker), want: "worker"},
		{name: "asr direct mode", got: ResolveASRRelayMode("groq", ASRRelayTransportDirect), want: "direct"},
		{name: "asr unknown mode", got: ResolveASRRelayMode("not-a-provider", ASRRelayTransportDirect), want: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, tt.got)
		})
	}
}

func TestRecordingFunctionsDoNotPanicWithNoopInstruments(t *testing.T) {
	initNoopMetrics()

	RecordHTTPMetric(context.Background(), "proxy/media", http.StatusOK, "none", 100*time.Millisecond)
	RecordHTTPMetric(context.Background(), discoverySearchPodcastsRoute, http.StatusBadRequest, "param_error", 5*time.Millisecond)
	RecordHTTPMetric(context.Background(), "/unknown/route", http.StatusNotFound, "unknown", time.Millisecond)

	RecordUpstreamMetric(context.Background(), upstreamKindAppleSearch, discoverySearchPodcastsRoute, http.StatusOK, "none", cacheStatusFreshHit, 200*time.Millisecond)
	RecordUpstreamMetric(context.Background(), upstreamKindPodcastIndex, discoveryPodcastsBatchRoute, http.StatusBadGateway, "upstream", cacheStatusMissError, time.Second)
	RecordUpstreamMetric(context.Background(), "proxy", "proxy/media", http.StatusGatewayTimeout, "timeout", cacheStatusUncached, 10*time.Second)

	RecordASRRelayMetric(context.Background(), "groq", "direct", http.StatusOK, "none")
	RecordASRRelayMetric(context.Background(), "cloudflare", "builtin", http.StatusInternalServerError, "upstream")
	RecordASRRelayMetric(context.Background(), "unknown-provider", "unknown", http.StatusBadRequest, "client_error")
}

func TestRecordingFunctionsNormalizeLabelsThroughClosedEnums(t *testing.T) {
	initNoopMetrics()

	// These should all succeed without panic - the closed enum mappers
	// convert any unexpected input to "unknown".
	RecordHTTPMetric(context.Background(), "https://secret.example.com/api?key=secret", 999, "raw-tcp-error: connection refused to secret-host:5432", time.Millisecond)
	RecordUpstreamMetric(context.Background(), "https://secret-upstream.example.com/api", "/api/v1/secret-route", 0, "raw dial error", "unexpected-cache-state", time.Millisecond)
	RecordASRRelayMetric(context.Background(), "secret-provider-name", "secret-mode", 0, "secret-error-class")
}
