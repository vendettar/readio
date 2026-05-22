package main

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestProxyClientNotInstrumented verifies the media/proxy fallback service's
// HTTP client is not wrapped with the project's instrumented transport.
// Media/proxy upstreams are arbitrary third-party hosts and must never
// receive trace headers or have full URLs recorded as span attributes.
func TestProxyClientNotInstrumented(t *testing.T) {
	svc := newProxyService()
	if svc.client != nil && svc.client.Transport != nil {
		// A nil Transport means default uninstrumented transport — that is
		// the required state. A non-nil Transport is acceptable only if it
		// is not the project's instrumented wrapper.
		require.NotContains(t, reflectTypeName(svc.client.Transport), "otelhttp")
	}
}

func reflectTypeName(v any) string {
	if v == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%T", v)
}
