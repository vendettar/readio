package discovery

import (
	"path"
	"strings"
)

func discoveryPodcastByItunesIDFromPath(requestPath string) (string, bool) {
	cleanedPath := path.Clean(requestPath)
	prefix := discoveryPodcastsRoute + "/"
	if !strings.HasPrefix(cleanedPath, prefix) || cleanedPath == discoveryPodcastsBatchRoute {
		return "", false
	}

	rawID := strings.TrimPrefix(cleanedPath, prefix)
	if rawID == "" || strings.Contains(rawID, "/") {
		return "", false
	}

	return rawID, true
}

func discoveryPodcastEpisodesByItunesIDFromPath(requestPath string) (string, bool) {
	cleanedPath := path.Clean(requestPath)
	prefix := discoveryPodcastsRoute + "/"
	if !strings.HasPrefix(cleanedPath, prefix) || cleanedPath == discoveryPodcastsBatchRoute {
		return "", false
	}

	suffix := strings.TrimPrefix(cleanedPath, prefix)
	parts := strings.Split(suffix, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "episodes" {
		return "", false
	}

	return parts[0], true
}
