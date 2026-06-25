package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (p *Service) parseProxyRequest(r *http.Request) (*requestSpec, error) {
	switch r.Method {
	case http.MethodGet:
		rawTarget := r.URL.Query().Get("url")
		if rawTarget == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_MISSING_URL", "missing url")
		}
		parsedURL, err := parseTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}
		if err := validateTarget(parsedURL); err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", err.Error())
		}
		headers, err := filterForwardHeaders(r.Header)
		if err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}
		return &requestSpec{targetURL: parsedURL, method: http.MethodGet, headers: headers}, nil

	case http.MethodPost:
		if ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))); ct != "" && !strings.HasPrefix(ct, "application/json") {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_CONTENT_TYPE", "content-type must be application/json")
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, p.bodyLimit+1))
		if err != nil {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		if int64(len(body)) > p.bodyLimit {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()

		var payload RequestPayload
		if err := decoder.Decode(&payload); err != nil {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}
		var trailing json.RawMessage
		if err := decoder.Decode(&trailing); err != io.EOF {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_PAYLOAD", "invalid proxy request payload")
		}

		rawTarget := strings.TrimSpace(payload.URL)
		if rawTarget == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_MISSING_URL", "missing url")
		}
		parsedURL, err := parseTargetURL(rawTarget)
		if err != nil {
			return nil, err
		}
		if err := validateTarget(parsedURL); err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", err.Error())
		}

		method := strings.ToUpper(strings.TrimSpace(payload.Method))
		if method == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_MISSING_METHOD", "missing method")
		}
		if method != http.MethodGet && method != http.MethodHead {
			return nil, NewError(http.StatusBadRequest, "PROXY_UNSUPPORTED_METHOD", "unsupported proxy method")
		}
		headers, err := ValidateForwardHeaders(payloadHeaders(payload.Headers))
		if err != nil {
			var proxyErr *Error
			if errors.As(err, &proxyErr) {
				return nil, proxyErr
			}
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}
		return &requestSpec{targetURL: parsedURL, method: method, headers: headers}, nil
	default:
		return nil, NewError(http.StatusMethodNotAllowed, "PROXY_METHOD_NOT_ALLOWED", "only GET and POST are allowed")
	}
}

func (p *Service) respondProxyError(ctx context.Context, w http.ResponseWriter, err error, allowedOrigin string) {
	var proxyErr *Error
	if errors.As(err, &proxyErr) {
		if proxyErr.Status == http.StatusMethodNotAllowed {
			w.Header().Set("Allow", "GET, POST")
		}
		WriteError(ctx, w, proxyErr.Status, proxyErr.Code, proxyErr.Message, allowedOrigin)
		return
	}
	WriteError(ctx, w, http.StatusBadGateway, "PROXY_UPSTREAM_FAILED", err.Error(), allowedOrigin)
}

func classifyParseError(err *Error) string {
	if err.Status == http.StatusMethodNotAllowed {
		return "invalid_method"
	}
	return "invalid_request"
}

func parseTargetURL(raw string) (*url.URL, error) {
	parsedURL, err := url.ParseRequestURI(raw)
	if err != nil {
		return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "invalid url")
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_URL", "only http and https urls are allowed")
	}
	if parsedURL.User != nil {
		return nil, NewError(http.StatusBadRequest, "PROXY_USERINFO_NOT_ALLOWED", "userinfo is not allowed")
	}
	return parsedURL, nil
}

func payloadHeaders(headers map[string]string) http.Header {
	payloadHeaders := make(http.Header, len(headers))
	for key, value := range headers {
		payloadHeaders.Set(key, value)
	}
	return payloadHeaders
}

func ValidateForwardHeaders(headers http.Header) (http.Header, error) {
	forwarded := make(http.Header)
	rangeValueCount := 0
	for rawName, values := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		if name == "" {
			return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
		}
		if _, ok := allowedRequestHeaders[strings.ToLower(name)]; !ok {
			return nil, NewError(http.StatusBadRequest, "PROXY_UNSUPPORTED_HEADER", "unsupported proxy header")
		}
		for _, rawValue := range values {
			value := strings.TrimSpace(rawValue)
			if value == "" {
				return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_HEADERS", "invalid proxy headers")
			}
			if name == "Range" {
				rangeValueCount++
				if rangeValueCount > 1 || !rangePattern.MatchString(value) {
					return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_RANGE", "invalid range header")
				}
			}
			forwarded.Add(name, value)
		}
	}
	return forwarded, nil
}

func filterForwardHeaders(headers http.Header) (http.Header, error) {
	forwarded := make(http.Header)
	rangeValueCount := 0
	for rawName, values := range headers {
		name := http.CanonicalHeaderKey(strings.TrimSpace(rawName))
		if name == "" {
			continue
		}
		if _, ok := allowedRequestHeaders[strings.ToLower(name)]; !ok {
			continue
		}
		for _, rawValue := range values {
			value := strings.TrimSpace(rawValue)
			if value == "" {
				continue
			}
			if name == "Range" {
				rangeValueCount++
				if rangeValueCount > 1 || !rangePattern.MatchString(value) {
					return nil, NewError(http.StatusBadRequest, "PROXY_INVALID_RANGE", "invalid range header")
				}
			}
			forwarded.Add(name, value)
		}
	}
	return forwarded, nil
}
