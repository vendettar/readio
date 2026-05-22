package httputil

import (
	"sync"
	"time"
)

type RateLimiter struct {
	mu     sync.Mutex
	now    func() time.Time
	Window time.Duration
	Limit  int
	swept  time.Time
	hits   map[string]rateBucket
}

type rateBucket struct {
	started time.Time
	count   int
}

func NewRateLimiter(limit int, window time.Duration, now func() time.Time) *RateLimiter {
	if now == nil {
		now = time.Now
	}
	return &RateLimiter{
		now:    now,
		Window: window,
		Limit:  limit,
		hits:   make(map[string]rateBucket),
	}
}

func (r *RateLimiter) Allow(key string) bool {
	if r == nil || r.Limit <= 0 {
		return true
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now()

	if r.swept.IsZero() || now.Sub(r.swept) >= r.Window {
		for hitKey, bucket := range r.hits {
			if bucket.started.IsZero() || now.Sub(bucket.started) >= r.Window {
				delete(r.hits, hitKey)
			}
		}
		r.swept = now
	}

	bucket := r.hits[key]
	if bucket.started.IsZero() || now.Sub(bucket.started) >= r.Window {
		bucket = rateBucket{started: now}
	}

	bucket.count++
	r.hits[key] = bucket

	return bucket.count <= r.Limit
}

// HasKey reports whether the given key currently has a bucket in the limiter.
// Intended for testing sweep behaviour; not for production use.
func (r *RateLimiter) HasKey(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.hits[key]
	return ok
}
