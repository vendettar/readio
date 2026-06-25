package discovery

func (s *discoveryService) allowSearchRequest(remoteAddr string) bool {
	if s == nil || s.searchLimiter == nil {
		return true
	}

	return s.searchLimiter.Allow(remoteAddr)
}

func (s *discoveryService) allowTopRequest(remoteAddr string) bool {
	if s == nil || s.topLimiter == nil {
		return true
	}

	return s.topLimiter.Allow(remoteAddr)
}

func (s *discoveryService) allowPodcastIndexRequest(remoteAddr string) bool {
	if s == nil || s.podcastIndexLimiter == nil {
		return true
	}

	return s.podcastIndexLimiter.Allow(remoteAddr)
}

func (s *discoveryService) allowPodcastIndexLocalReadRequest(remoteAddr string) bool {
	if s == nil || s.podcastIndexLocalReadLimiter == nil {
		return true
	}

	return s.podcastIndexLocalReadLimiter.Allow(remoteAddr)
}
