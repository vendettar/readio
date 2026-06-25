package discovery

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"readio-cloud/internal/httputil"
)

func writeDiscoveryJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeDiscoveryError(r *http.Request, w http.ResponseWriter, status int, code, message string) {
	requestID := httputil.GenerateRequestID()
	writeDiscoveryJSON(w, status, map[string]string{
		"code":       code,
		"message":    message,
		"request_id": requestID,
	})
	slog.WarnContext(r.Context(), "discovery error response", "request_id", requestID, "code", code, "status", status)
}

func writeDiscoveryErrorSpec(r *http.Request, w http.ResponseWriter, status int, spec discoveryErrorSpec) {
	writeDiscoveryError(r, w, status, spec.code, spec.message)
}

func writeDiscoveryMappedError(r *http.Request, w http.ResponseWriter, err error) {
	var paramErr *discoveryParamError
	if errors.As(err, &paramErr) {
		writeDiscoveryError(r, w, http.StatusBadRequest, paramErr.code, paramErr.message)
		return
	}

	var statusErr *discoveryUpstreamStatusError
	if errors.As(err, &statusErr) {
		writeDiscoveryErrorSpec(r, w, http.StatusBadGateway, discoveryErrUpstreamInvalidResponseStatus)
		return
	}

	var piInvalidErr *podcastIndexInvalidResponseError
	if errors.As(err, &piInvalidErr) {
		writeDiscoveryErrorSpec(r, w, http.StatusBadGateway, discoveryErrUpstreamInvalidResponsePayload)
		return
	}

	switch {
	case isDiscoveryRateLimitedError(err):
		writeDiscoveryErrorSpec(r, w, http.StatusTooManyRequests, discoveryErrRateLimited)
	case errors.Is(err, errDiscoveryTimeout) || isDiscoveryTransportTimeout(err):
		writeDiscoveryErrorSpec(r, w, http.StatusGatewayTimeout, discoveryErrUpstreamTimeout)
	case errors.Is(err, errDiscoveryTooLarge):
		writeDiscoveryErrorSpec(r, w, http.StatusBadGateway, discoveryErrUpstreamTooLarge)
	case errors.Is(err, errDiscoveryDecode):
		writeDiscoveryErrorSpec(r, w, http.StatusBadGateway, discoveryErrInvalidUpstreamPayload)
	default:
		if err != nil && strings.Contains(err.Error(), "podcastindex: too many GUIDs") {
			writeDiscoveryErrorSpec(r, w, http.StatusBadRequest, discoveryErrInvalidGuidBatchTooMany)
			return
		}
		if err != nil && strings.Contains(err.Error(), "podcastindex: request body too large") {
			writeDiscoveryErrorSpec(r, w, http.StatusBadRequest, discoveryErrInvalidGuidBatchTooLarge)
			return
		}
		writeDiscoveryErrorSpec(r, w, http.StatusBadGateway, discoveryErrUpstreamRequestFailed)
	}
}
