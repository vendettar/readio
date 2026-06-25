package discovery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

func (s *discoveryService) fetchJSON(ctx context.Context, requestURL string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return fmt.Errorf("create discovery upstream request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", s.userAgent)

	return s.executeJSONRequest(req, dest)
}

func (s *discoveryService) executeJSONRequest(req *http.Request, dest any) error {
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json")
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", s.userAgent)
	}

	client := s.client
	if client == nil {
		client = http.DefaultClient
	}

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		if req.Context().Err() != nil || isDiscoveryTransportTimeout(err) {
			return errDiscoveryTimeout
		}
		return fmt.Errorf("perform discovery upstream request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		slog.DebugContext(req.Context(), "upstream request completed",
			slog.String("url", sanitizeURL(req.URL)),
			slog.Int("status_code", resp.StatusCode),
			slog.Int64("latency_ms", time.Since(start).Milliseconds()),
		)
		return &discoveryUpstreamStatusError{status: resp.StatusCode}
	}

	if err := decodeDiscoveryJSON(resp.Body, s.bodyLimit, dest); err != nil {
		slog.DebugContext(req.Context(), "upstream request decode failed",
			slog.String("url", sanitizeURL(req.URL)),
			slog.Int("status_code", resp.StatusCode),
			slog.Int64("content_length", resp.ContentLength),
			slog.Int64("latency_ms", time.Since(start).Milliseconds()),
			slog.Any("error", err),
		)
		return err
	}

	slog.DebugContext(req.Context(), "upstream request completed",
		slog.String("url", sanitizeURL(req.URL)),
		slog.Int("status_code", resp.StatusCode),
		slog.Int64("content_length", resp.ContentLength),
		slog.Int64("latency_ms", time.Since(start).Milliseconds()),
	)

	return nil
}

func decodeDiscoveryJSON(body io.Reader, limit int64, dest any) error {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return fmt.Errorf("read discovery upstream body: %w", err)
	}
	if int64(len(data)) > limit {
		return errDiscoveryTooLarge
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(dest); err != nil {
		return errDiscoveryDecode
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errDiscoveryDecode
	}

	return nil
}
func sanitizeURL(u *url.URL) string {
	if u == nil {
		return ""
	}
	query := ""
	if u.RawQuery != "" {
		query = "?[REDACTED]"
	}
	return u.Scheme + "://" + u.Host + u.Path + query
}
