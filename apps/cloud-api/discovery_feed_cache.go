package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
)

type cachedParsedFeed struct {
	payload   parsedFeedResponse
	expiresAt time.Time
	cachedAt  time.Time
	byteSize  int
	feedURL   string
}

type discoveryFeedCache struct {
	mu      sync.Mutex
	now     func() time.Time
	config  discoveryFeedCacheConfig
	entries map[string]cachedParsedFeed
}

type discoveryFeedFetchResult struct {
	payload     parsedFeedResponse
	cacheStatus string
}

func newDiscoveryFeedCache(config discoveryFeedCacheConfig, now func() time.Time) *discoveryFeedCache {
	if !config.enabled {
		return nil
	}
	if now == nil {
		now = time.Now
	}
	return &discoveryFeedCache{
		now:     now,
		config:  config,
		entries: make(map[string]cachedParsedFeed),
	}
}

func (c *discoveryFeedCache) get(key string) (parsedFeedResponse, bool) {
	if c == nil {
		return parsedFeedResponse{}, false
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[key]
	if !ok {
		return parsedFeedResponse{}, false
	}
	if !c.now().Before(entry.expiresAt) {
		delete(c.entries, key)
		return parsedFeedResponse{}, false
	}
	return cloneParsedFeedResponse(entry.payload), true
}

func (c *discoveryFeedCache) set(key string, payload parsedFeedResponse) bool {
	if c == nil {
		return false
	}

	byteSize, ok := c.admit(payload)
	if !ok {
		return false
	}

	now := c.now()
	c.mu.Lock()
	defer c.mu.Unlock()

	c.pruneExpiredLocked(now)
	for len(c.entries) >= c.config.maxEntries {
		c.evictOldestLocked()
	}

	c.entries[key] = cachedParsedFeed{
		payload:   cloneParsedFeedResponse(payload),
		expiresAt: now.Add(c.config.ttl),
		cachedAt:  now,
		byteSize:  byteSize,
		feedURL:   key,
	}
	return true
}

func (c *discoveryFeedCache) admit(payload parsedFeedResponse) (int, bool) {
	if c == nil {
		return 0, false
	}
	if len(payload.Episodes) > c.config.maxEpisodes {
		return 0, false
	}
	byteSize, err := estimateParsedFeedResponseSize(payload)
	if err != nil || byteSize > c.config.maxBytes {
		return 0, false
	}
	return byteSize, true
}

func (c *discoveryFeedCache) pruneExpiredLocked(now time.Time) {
	for key, entry := range c.entries {
		if !now.Before(entry.expiresAt) {
			delete(c.entries, key)
		}
	}
}

func (c *discoveryFeedCache) evictOldestLocked() {
	var oldestKey string
	var oldestAt time.Time
	first := true
	for key, entry := range c.entries {
		if first || entry.cachedAt.Before(oldestAt) {
			oldestKey = key
			oldestAt = entry.cachedAt
			first = false
		}
	}
	if !first {
		delete(c.entries, oldestKey)
	}
}

func estimateParsedFeedResponseSize(payload parsedFeedResponse) (int, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}
	return len(data), nil
}

func cloneParsedFeedResponse(payload parsedFeedResponse) parsedFeedResponse {
	cloned := payload
	if len(payload.Episodes) == 0 {
		cloned.Episodes = nil
		return cloned
	}
	cloned.Episodes = append([]parsedFeedEpisodeResult(nil), payload.Episodes...)
	return cloned
}

func validateAndNormalizeDiscoveryFeedURL(raw string) (*url.URL, string, error) {
	rawWithoutFragment := raw
	if index := strings.Index(rawWithoutFragment, "#"); index >= 0 {
		rawWithoutFragment = rawWithoutFragment[:index]
	}

	parsedURL, err := url.ParseRequestURI(rawWithoutFragment)
	if err != nil || parsedURL == nil || parsedURL.Host == "" {
		return nil, "", &discoveryParamError{
			code:    "INVALID_URL",
			message: "url must be a valid absolute http or https URL",
		}
	}
	parsedURL.Scheme = strings.ToLower(parsedURL.Scheme)
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, "", &discoveryParamError{
			code:    "INVALID_URL",
			message: "url must be a valid absolute http or https URL",
		}
	}
	parsedURL.Fragment = ""
	parsedURL.RawFragment = ""
	if err := validateProxyTarget(parsedURL); err != nil {
		return nil, "", &discoveryParamError{
			code:    "INVALID_URL",
			message: err.Error(),
		}
	}
	return parsedURL, normalizeDiscoveryFeedCacheKeyFromParsedURL(parsedURL), nil
}

func normalizeDiscoveryFeedCacheKey(raw string) (string, error) {
	_, key, err := validateAndNormalizeDiscoveryFeedURL(raw)
	return key, err
}

func normalizeDiscoveryFeedCacheKeyFromParsedURL(parsedURL *url.URL) string {
	scheme := strings.ToLower(parsedURL.Scheme)
	hostname := strings.ToLower(parsedURL.Hostname())
	port := parsedURL.Port()
	host := hostname
	switch {
	case port == "":
	case scheme == "http" && port == "80":
	case scheme == "https" && port == "443":
	default:
		host = net.JoinHostPort(hostname, port)
	}

	return (&url.URL{
		Scheme:     scheme,
		User:       parsedURL.User,
		Host:       host,
		Path:       parsedURL.Path,
		RawPath:    parsedURL.RawPath,
		ForceQuery: parsedURL.ForceQuery,
		RawQuery:   parsedURL.RawQuery,
	}).String()
}

func (s *discoveryService) fetchFeedCached(ctx context.Context, requestURL string) (parsedFeedResponse, string, error) {
	parsedURL, cacheKey, err := validateAndNormalizeDiscoveryFeedURL(requestURL)
	if err != nil {
		return parsedFeedResponse{}, CacheStatusUncached, err
	}
	return s.fetchFeedCachedValidated(ctx, parsedURL, cacheKey)
}

func (s *discoveryService) fetchFeedCachedValidated(
	ctx context.Context,
	parsedURL *url.URL,
	cacheKey string,
) (parsedFeedResponse, string, error) {
	if payload, ok := s.feedCache.get(cacheKey); ok {
		return payload, CacheStatusFreshHit, nil
	}
	if err := ctx.Err(); err != nil {
		if err == context.DeadlineExceeded {
			return parsedFeedResponse{}, CacheStatusUncached, errDiscoveryTimeout
		}
		return parsedFeedResponse{}, CacheStatusUncached, err
	}

	fetch := func() (any, error) {
		if payload, ok := s.feedCache.get(cacheKey); ok {
			return discoveryFeedFetchResult{payload: payload, cacheStatus: CacheStatusFreshHit}, nil
		}

		fetchCtx, cancel := s.newFeedSingleflightFetchContext()
		defer cancel()

		payload, err := s.fetchFeedFromParsedURL(fetchCtx, parsedURL)
		if err != nil {
			return nil, err
		}
		if s.feedCache.set(cacheKey, payload) {
			return discoveryFeedFetchResult{payload: payload, cacheStatus: CacheStatusRefreshed}, nil
		}
		return discoveryFeedFetchResult{payload: payload, cacheStatus: CacheStatusUncached}, nil
	}

	resultCh := s.cacheOwner.DoChan("feed:"+cacheKey, fetch)

	select {
	case <-ctx.Done():
		if ctx.Err() == context.DeadlineExceeded {
			return parsedFeedResponse{}, CacheStatusUncached, errDiscoveryTimeout
		}
		return parsedFeedResponse{}, CacheStatusUncached, ctx.Err()
	case result := <-resultCh:
		if result.Err != nil {
			return parsedFeedResponse{}, CacheStatusUncached, result.Err
		}
		typed, ok := result.Val.(discoveryFeedFetchResult)
		if !ok {
			return parsedFeedResponse{}, CacheStatusUncached, fmt.Errorf("discovery feed cache type mismatch for key %s", cacheKey)
		}
		return typed.payload, typed.cacheStatus, nil
	}
}

func (s *discoveryService) newFeedSingleflightFetchContext() (context.Context, context.CancelFunc) {
	if s.timeout > 0 {
		return context.WithTimeout(context.Background(), s.timeout)
	}
	return context.WithCancel(context.Background())
}
