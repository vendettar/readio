package discovery

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

var discoveryCacheTTLTopPodcasts = 24 * time.Hour
var discoveryCacheTTLTopEpisodes = 24 * time.Hour

type discoveryCacheEntry struct {
	data      any
	expiresAt time.Time
}

type discoveryCache struct {
	mu      sync.RWMutex
	entries map[string]discoveryCacheEntry
	maxKeys int
}

func newDiscoveryCache(maxKeys int) *discoveryCache {
	return &discoveryCache{
		entries: make(map[string]discoveryCacheEntry),
		maxKeys: maxKeys,
	}
}

func discoveryCacheGetWithStatus[T any](c *discoveryCache, key string) (T, string, bool) {
	var zero T
	c.mu.RLock()
	entry, ok := c.entries[key]
	c.mu.RUnlock()
	if !ok {
		return zero, "miss", false
	}
	data, ok := entry.data.(T)
	if !ok {
		return zero, "miss", false
	}
	if time.Now().Before(entry.expiresAt) {
		return data, "fresh", true
	}
	return data, "stale", true
}

func discoveryCacheSet[T any](c *discoveryCache, key string, data T, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.maxKeys {
		now := time.Now()
		evicted := false
		for k, v := range c.entries {
			if now.After(v.expiresAt) {
				delete(c.entries, k)
				evicted = true
				break
			}
		}
		if !evicted {
			var nearestKey string
			var nearestExpiry time.Time
			first := true
			for k, v := range c.entries {
				if first || v.expiresAt.Before(nearestExpiry) {
					nearestKey = k
					nearestExpiry = v.expiresAt
					first = false
				}
			}
			delete(c.entries, nearestKey)
		}
	}
	c.entries[key] = discoveryCacheEntry{
		data:      data,
		expiresAt: time.Now().Add(ttl),
	}
}

// getWithGracefulDegradation provides cache-ahead with stale-fallback semantics.
func getWithGracefulDegradation[T any](
	s *discoveryService,
	ctx context.Context,
	cacheKey string,
	ttl time.Duration,
	fetch func(context.Context) (T, error),
) (T, string, error) {
	return getWithGracefulDegradationWithCachePolicy(s, ctx, cacheKey, ttl, fetch, nil)
}

func getWithGracefulDegradationWithCachePolicy[T any](
	s *discoveryService,
	ctx context.Context,
	cacheKey string,
	ttl time.Duration,
	fetch func(context.Context) (T, error),
	shouldCache func(T) bool,
) (T, string, error) {
	var zero T
	data, status, ok := discoveryCacheGetWithStatus[T](s.cache, cacheKey)
	if ok && status == "fresh" {
		return data, CacheStatusFreshHit, nil
	}

	resultAny, err, _ := s.cacheOwner.Do(cacheKey, func() (any, error) {
		return fetch(ctx)
	})
	if err != nil {
		if ok && isGracefulDegradationUpstreamError(err) {
			return data, CacheStatusStaleFallback, nil
		}
		return zero, CacheStatusMissError, err
	}

	result, ok := resultAny.(T)
	if !ok {
		return zero, CacheStatusMissError, fmt.Errorf("discovery cache type mismatch for key %s", cacheKey)
	}

	if shouldCache == nil || shouldCache(result) {
		discoveryCacheSet(s.cache, cacheKey, result, ttl)
	}
	return result, CacheStatusRefreshed, nil
}

func isGracefulDegradationUpstreamError(err error) bool {
	var configErr *discoveryProviderConfigError
	if errors.As(err, &configErr) {
		return false
	}

	if errors.Is(err, errDiscoveryUpstreamError) ||
		errors.Is(err, errDiscoveryTimeout) ||
		errors.Is(err, errDiscoveryTooLarge) ||
		errors.Is(err, errDiscoveryChartInvalidPayload) ||
		errors.Is(err, errDiscoveryHostUnresolvable) ||
		errors.Is(err, &discoveryUpstreamStatusError{}) {
		return true
	}
	var piInvalidErr *podcastIndexInvalidResponseError
	if errors.As(err, &piInvalidErr) {
		return true
	}
	if err != nil {
		errStr := err.Error()
		return strings.Contains(errStr, "upstream returned status") ||
			strings.Contains(errStr, "discovery chart payload invalid")
	}
	return false
}
