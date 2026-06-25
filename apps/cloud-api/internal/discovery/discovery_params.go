package discovery

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func parseDiscoveryCountry(values url.Values) (string, error) {
	country := strings.ToLower(strings.TrimSpace(values.Get("country")))
	if country == "" {
		return defaultDiscoveryCountry, nil
	}
	if !discoveryCountryPattern.MatchString(country) {
		return "", &discoveryParamError{
			code:    "INVALID_COUNTRY",
			message: "country must be a 2-letter lowercase code",
		}
	}
	return country, nil
}

func parseDiscoveryTerm(values url.Values) (string, error) {
	term := strings.ToLower(strings.TrimSpace(values.Get("term")))
	if term == "" {
		return "", &discoveryParamError{
			code:    "INVALID_TERM",
			message: "term must not be empty",
		}
	}
	return term, nil
}

func parseDiscoveryLimit(values url.Values, key string, fallback, maxLimit int) (int, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > maxLimit {
		return 0, &discoveryParamError{
			code:    "INVALID_" + strings.ToUpper(key),
			message: fmt.Sprintf("%s must be between 1 and %d", key, maxLimit),
		}
	}
	return value, nil
}
