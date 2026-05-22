package observability

import (
	"encoding/base64"
	"strings"
	"testing"
	"github.com/stretchr/testify/require"
)

func TestResolveOTLPConfigDisabledWhenAllEnvAbsent(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	require.NoError(t, err)
	require.False(t, cfg.Enabled)
}

func TestResolveOTLPConfigHeadersTakePrecedence(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")
	t.Setenv(grafanaOTLPInstanceIDEnv, "instance")
	t.Setenv(grafanaOTLPTokenEnv, "token")

	cfg, err := resolveOTLPConfig()
	require.NoError(t, err)
	require.True(t, cfg.Enabled)
	got, want := cfg.Headers["Authorization"], "Basic abc"
	require.Equal(t, want, got)
}

func TestResolveOTLPConfigPercentEncodedHeaders(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp/")
	// Grafana's OpenTelemetry tile emits percent-encoded values.
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic%20Zm9vOmJhcg%3D%3D")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	require.NoError(t, err)
	got, want := cfg.Headers["Authorization"], "Basic Zm9vOmJhcg=="
	require.Equal(t, want, got)
	// Trailing slash on the endpoint must be normalized away when the signal
	// path is appended.
	require.Equal(t, "https://otlp-gateway.example.com/otlp/v1/traces", cfg.EndpointForSignal("/v1/traces"))
	require.Equal(t, "https://otlp-gateway.example.com/otlp/v1/metrics", cfg.EndpointForSignal("/v1/metrics"))
}

func TestResolveOTLPConfigHeaderValuePreservesLiteralPlus(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc+def")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	require.NoError(t, err)
	got, want := cfg.Headers["Authorization"], "Basic abc+def"
	require.Equal(t, want, got)
}

func TestResolveOTLPConfigHeaderValueDecodesPercentEncodedPlus(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic%20abc%2Bdef")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	require.NoError(t, err)
	got, want := cfg.Headers["Authorization"], "Basic abc+def"
	require.Equal(t, want, got)
}

func TestResolveOTLPConfigInstanceTokenFallback(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "alice")
	t.Setenv(grafanaOTLPTokenEnv, "secret")

	cfg, err := resolveOTLPConfig()
	require.NoError(t, err)
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("alice:secret"))
	got := cfg.Headers["Authorization"]
	require.Equal(t, want, got)
}

func TestResolveOTLPConfigPartialFallbackFailsFast(t *testing.T) {
	cases := map[string]struct{ instance, token string }{
		"instance only": {"alice", ""},
		"token only":    {"", "secret"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
			t.Setenv(grafanaOTLPHeadersEnv, "")
			t.Setenv(grafanaOTLPInstanceIDEnv, tc.instance)
			t.Setenv(grafanaOTLPTokenEnv, tc.token)
			_, err := resolveOTLPConfig()
			require.Error(t, err)
		})
	}
}

func TestResolveOTLPConfigEndpointMissingFailsFast(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")
	_, err := resolveOTLPConfig()
	require.Error(t, err)
}

func TestResolveOTLPConfigMalformedHeaders(t *testing.T) {
	cases := map[string]string{
		"empty key":           "=value",
		"unknown header":      "X-Scope-OrgID=tenant",
		"empty Authorization": "Authorization=",
		"missing equal":       "Authorization",
		"duplicate keys":      "Authorization=Basic a,Authorization=Basic b",
		"no Authorization":    "X-Foo=bar",
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
			t.Setenv(grafanaOTLPHeadersEnv, raw)
			t.Setenv(grafanaOTLPInstanceIDEnv, "")
			t.Setenv(grafanaOTLPTokenEnv, "")
			_, err := resolveOTLPConfig()
			require.Error(t, err)
		})
	}
}

// Compile-time guard: the only signal paths the resolver should ever see are
// /v1/metrics and /v1/traces. Endpoint env values must not silently carry
// either suffix.
func TestEndpointForSignalRejectsEmbeddedSignalPath(t *testing.T) {
	cfg := otlpConfig{Endpoint: "https://otlp-gateway.example.com/otlp"}
	for _, signal := range []string{"/v1/metrics", "/v1/traces"} {
		got := cfg.EndpointForSignal(signal)
		if !strings.HasSuffix(got, signal) {
			t.Fatalf("EndpointForSignal(%q) = %q; missing suffix", signal, got)
		}
	}
}
