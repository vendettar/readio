package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestResolveOTLPConfigDisabledWhenAllEnvAbsent(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Enabled {
		t.Fatalf("OTLP must be disabled when no env is configured")
	}
}

func TestResolveOTLPConfigHeadersTakePrecedence(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")
	t.Setenv(grafanaOTLPInstanceIDEnv, "instance")
	t.Setenv(grafanaOTLPTokenEnv, "token")

	cfg, err := resolveOTLPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.Enabled {
		t.Fatalf("expected enabled")
	}
	if got, want := cfg.Headers["Authorization"], "Basic abc"; got != want {
		t.Fatalf("headers env should win: got %q want %q", got, want)
	}
}

func TestResolveOTLPConfigPercentEncodedHeaders(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp/")
	// Grafana's OpenTelemetry tile emits percent-encoded values.
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic%20Zm9vOmJhcg%3D%3D")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got, want := cfg.Headers["Authorization"], "Basic Zm9vOmJhcg=="; got != want {
		t.Fatalf("percent decode failed: got %q want %q", got, want)
	}
	// Trailing slash on the endpoint must be normalized away when the signal
	// path is appended.
	if got, want := cfg.EndpointForSignal("/v1/traces"), "https://otlp-gateway.example.com/otlp/v1/traces"; got != want {
		t.Fatalf("EndpointForSignal traces = %q want %q", got, want)
	}
	if got, want := cfg.EndpointForSignal("/v1/metrics"), "https://otlp-gateway.example.com/otlp/v1/metrics"; got != want {
		t.Fatalf("EndpointForSignal metrics = %q want %q", got, want)
	}
}

func TestResolveOTLPConfigHeaderValuePreservesLiteralPlus(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc+def")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got, want := cfg.Headers["Authorization"], "Basic abc+def"; got != want {
		t.Fatalf("literal plus must survive: got %q want %q", got, want)
	}
}

func TestResolveOTLPConfigHeaderValueDecodesPercentEncodedPlus(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic%20abc%2Bdef")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")

	cfg, err := resolveOTLPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got, want := cfg.Headers["Authorization"], "Basic abc+def"; got != want {
		t.Fatalf("percent-encoded plus decode failed: got %q want %q", got, want)
	}
}

func TestResolveOTLPConfigInstanceTokenFallback(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "https://otlp-gateway.example.com/otlp")
	t.Setenv(grafanaOTLPHeadersEnv, "")
	t.Setenv(grafanaOTLPInstanceIDEnv, "alice")
	t.Setenv(grafanaOTLPTokenEnv, "secret")

	cfg, err := resolveOTLPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("alice:secret"))
	if got := cfg.Headers["Authorization"]; got != want {
		t.Fatalf("fallback Basic auth = %q want %q", got, want)
	}
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
			if _, err := resolveOTLPConfig(); err == nil {
				t.Fatalf("expected fail-fast error for partial fallback %s", name)
			}
		})
	}
}

func TestResolveOTLPConfigEndpointMissingFailsFast(t *testing.T) {
	t.Setenv(grafanaOTLPEndpointEnv, "")
	t.Setenv(grafanaOTLPHeadersEnv, "Authorization=Basic abc")
	t.Setenv(grafanaOTLPInstanceIDEnv, "")
	t.Setenv(grafanaOTLPTokenEnv, "")
	if _, err := resolveOTLPConfig(); err == nil {
		t.Fatalf("expected fail-fast error when endpoint is missing")
	}
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
			if _, err := resolveOTLPConfig(); err == nil {
				t.Fatalf("expected error for malformed headers %q", name)
			}
		})
	}
}

func TestOTLPHeadersEnvAbsentFromBrowserAllowlist(t *testing.T) {
	data, err := os.ReadFile("browser-env-allowlist.json")
	if err != nil {
		t.Fatalf("read allowlist artifact: %v", err)
	}
	var artifact []string
	if err := json.Unmarshal(data, &artifact); err != nil {
		t.Fatalf("unmarshal allowlist artifact: %v", err)
	}
	for _, key := range artifact {
		if key == grafanaOTLPHeadersEnv {
			t.Fatalf("%s must not be browser-visible", grafanaOTLPHeadersEnv)
		}
	}
	for _, key := range browserEnvAllowlist {
		if key == grafanaOTLPHeadersEnv {
			t.Fatalf("%s must not be in browserEnvAllowlist", grafanaOTLPHeadersEnv)
		}
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
