package httputil

import (
	"testing"
	"time"
)

func TestRateLimiterAllowsNilClock(t *testing.T) {
	limiter := NewRateLimiter(1, time.Minute, nil)

	if !limiter.Allow("198.51.100.10") {
		t.Fatal("first request should be allowed")
	}
}
