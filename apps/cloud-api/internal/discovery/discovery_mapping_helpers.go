package discovery

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func asStringID(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", typed))
	}
}

func asOptionalInt64(value any) *int64 {
	switch typed := value.(type) {
	case nil:
		return nil
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil {
			return nil
		}
		if parsed == 0 {
			return nil
		}
		return &parsed
	case float64:
		if typed == 0 {
			return nil
		}
		parsed := int64(typed)
		return &parsed
	case int64:
		if typed == 0 {
			return nil
		}
		return &typed
	case int:
		if typed == 0 {
			return nil
		}
		parsed := int64(typed)
		return &parsed
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		parsed, err := strconv.ParseInt(trimmed, 10, 64)
		if err != nil {
			return nil
		}
		if parsed == 0 {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}
