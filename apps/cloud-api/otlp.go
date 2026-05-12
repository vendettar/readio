package main

import (
	"encoding/base64"
	"fmt"
	"net/textproto"
	"net/url"
	"os"
	"strings"
)

// Shared OTLP env contract used by both metrics and tracing exporters.
//
// Precedence for authentication:
//  1. READIO_GRAFANA_OTLP_HEADERS (preferred; copied verbatim from Grafana's
//     OpenTelemetry tile, OTEL_EXPORTER_OTLP_HEADERS format).
//  2. READIO_GRAFANA_OTLP_INSTANCE_ID + READIO_GRAFANA_OTLP_TOKEN Basic auth
//     fallback.
//
// The endpoint env value must be the OTLP gateway base URL without a signal
// path; callers append /v1/metrics or /v1/traces via EndpointForSignal.
const (
	grafanaOTLPHeadersEnv = "READIO_GRAFANA_OTLP_HEADERS"
	unifiedEnvAttr        = "env"
)

// otlpAllowedAuthHeaders limits the header names READIO_GRAFANA_OTLP_HEADERS
// may forward to the OTLP gateway. Unknown keys cause a configuration error
// when the affected signal is enabled rather than silently widening the
// outbound header surface.
var otlpAllowedAuthHeaders = map[string]struct{}{
	"Authorization": {},
}

// otlpConfig is the resolved OTLP transport identity shared by metrics and
// traces. Enabled=false with a nil error means no OTLP env is configured;
// instruments stay noop and exporters are not created. A non-nil error means
// configuration was partially supplied; callers must fail fast rather than
// silently sending invalid credentials.
type otlpConfig struct {
	Enabled  bool
	Endpoint string
	Headers  map[string]string
}

// resolveOTLPConfig reads the OTLP env contract and produces the shared OTLP
// transport identity. It does not log header or token values.
func resolveOTLPConfig() (otlpConfig, error) {
	endpoint := strings.TrimSpace(os.Getenv(grafanaOTLPEndpointEnv))
	rawHeaders := strings.TrimSpace(os.Getenv(grafanaOTLPHeadersEnv))
	instanceID := strings.TrimSpace(os.Getenv(grafanaOTLPInstanceIDEnv))
	token := strings.TrimSpace(os.Getenv(grafanaOTLPTokenEnv))

	hasHeaders := rawHeaders != ""
	hasInstanceAuth := instanceID != "" || token != ""

	if endpoint == "" && !hasHeaders && !hasInstanceAuth {
		return otlpConfig{}, nil
	}

	if endpoint == "" {
		return otlpConfig{}, fmt.Errorf(
			"%s is required when any OTLP auth env is configured",
			grafanaOTLPEndpointEnv,
		)
	}

	if hasHeaders {
		headers, err := parseOTLPHeaders(rawHeaders)
		if err != nil {
			return otlpConfig{}, fmt.Errorf("%s: %w", grafanaOTLPHeadersEnv, err)
		}
		return otlpConfig{Enabled: true, Endpoint: endpoint, Headers: headers}, nil
	}

	if instanceID == "" || token == "" {
		return otlpConfig{}, fmt.Errorf(
			"%s and %s must both be set when %s is not configured",
			grafanaOTLPInstanceIDEnv,
			grafanaOTLPTokenEnv,
			grafanaOTLPHeadersEnv,
		)
	}

	return otlpConfig{
		Enabled:  true,
		Endpoint: endpoint,
		Headers: map[string]string{
			"Authorization": "Basic " + base64.StdEncoding.EncodeToString(
				[]byte(instanceID+":"+token),
			),
		},
	}, nil
}

// EndpointForSignal returns the full OTLP endpoint URL for a specific signal
// path (e.g. "/v1/metrics", "/v1/traces"). It trims any trailing slash on the
// base endpoint and ensures the signal path is prefixed with "/".
func (c otlpConfig) EndpointForSignal(signalPath string) string {
	if !strings.HasPrefix(signalPath, "/") {
		signalPath = "/" + signalPath
	}
	return strings.TrimRight(c.Endpoint, "/") + signalPath
}

// HeadersCopy returns a defensive copy of the resolved headers so callers
// cannot mutate the shared map.
func (c otlpConfig) HeadersCopy() map[string]string {
	out := make(map[string]string, len(c.Headers))
	for k, v := range c.Headers {
		out[k] = v
	}
	return out
}

// parseOTLPHeaders parses an OpenTelemetry-style header env value:
//
//	key1=value1,key2=value2
//
// Values may be percent-encoded (Grafana's OpenTelemetry tile emits
// "Authorization=Basic%20XYZ"); decoded values are returned. Only allowlisted
// header names are accepted; empty keys, empty Authorization values,
// duplicate keys, and unknown keys are rejected. Authorization is required.
func parseOTLPHeaders(raw string) (map[string]string, error) {
	out := make(map[string]string)
	for _, part := range strings.Split(raw, ",") {
		entry := strings.TrimSpace(part)
		if entry == "" {
			continue
		}
		eq := strings.IndexByte(entry, '=')
		if eq <= 0 {
			return nil, fmt.Errorf("malformed entry %q", entry)
		}
		key := strings.TrimSpace(entry[:eq])
		if key == "" {
			return nil, fmt.Errorf("empty header key")
		}
		canonical := textproto.CanonicalMIMEHeaderKey(key)
		if _, ok := otlpAllowedAuthHeaders[canonical]; !ok {
			return nil, fmt.Errorf("header %q not allowed", key)
		}
		rawValue := strings.TrimSpace(entry[eq+1:])
		decoded, err := decodeOTLPHeaderValue(rawValue)
		if err != nil {
			return nil, fmt.Errorf("header %q: %w", key, err)
		}
		decoded = strings.TrimSpace(decoded)
		if canonical == "Authorization" && decoded == "" {
			return nil, fmt.Errorf("empty Authorization value")
		}
		if _, dup := out[canonical]; dup {
			return nil, fmt.Errorf("duplicate header %q", key)
		}
		out[canonical] = decoded
	}
	if _, ok := out["Authorization"]; !ok {
		return nil, fmt.Errorf("authorization header required")
	}
	return out, nil
}

// decodeOTLPHeaderValue performs percent-decoding without treating raw '+'
// as a space. OTLP header values are not form-encoded query strings, so a
// literal '+' must survive unchanged when operators paste Authorization
// values directly from dashboards or secret stores.
func decodeOTLPHeaderValue(raw string) (string, error) {
	return url.PathUnescape(raw)
}
