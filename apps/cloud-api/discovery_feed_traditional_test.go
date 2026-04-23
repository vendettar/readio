package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func readDiscoveryFeedFixture(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join("testdata", "discovery", "feed", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", path, err)
	}
	return string(data)
}

func requireSingleParsedEpisode(t *testing.T, result parsedFeedResponse) parsedFeedEpisodeResult {
	t.Helper()
	if len(result.Episodes) != 1 {
		t.Fatalf("episodes length = %d, want 1", len(result.Episodes))
	}
	return result.Episodes[0]
}

func TestDecodeDiscoveryFeedTraditionalFixtures(t *testing.T) {
	t.Run("cbc maps trailer fields", func(t *testing.T) {
		result, err := decodeDiscoveryFeedXML(
			strings.NewReader(readDiscoveryFeedFixture(t, "traditional_cbc.xml")),
			discoveryBodyLimit,
		)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}

		if result.Title != "Hunting Warhead" {
			t.Fatalf("title = %q, want Hunting Warhead", result.Title)
		}

		episode := requireSingleParsedEpisode(t, result)
		if episode.EpisodeGUID != "huntingwarhead-6c8954bb-4328-4d63-af32-9148130bbe7d" {
			t.Fatalf("episodeGuid = %q", episode.EpisodeGUID)
		}
		if episode.Title != "The next season of Hunting is coming" {
			t.Fatalf("title = %q", episode.Title)
		}
		if episode.AudioURL != "https://example.com/cbc/audio.mp3?ttag=season:2" {
			t.Fatalf("audioUrl = %q", episode.AudioURL)
		}
		if episode.DescriptionHTML == "" {
			t.Fatalf("descriptionHtml should not be empty")
		}
		if episode.Duration == nil || *episode.Duration != 135 {
			t.Fatalf("duration = %#v, want 135", episode.Duration)
		}
		if episode.SeasonNumber == nil || *episode.SeasonNumber != 2 {
			t.Fatalf("seasonNumber = %#v, want 2", episode.SeasonNumber)
		}
		if episode.EpisodeType != "trailer" {
			t.Fatalf("episodeType = %q, want trailer", episode.EpisodeType)
		}
		if episode.Explicit == nil || *episode.Explicit {
			t.Fatalf("explicit = %#v, want false", episode.Explicit)
		}
	})

	t.Run("megaphone prefers encoded description and dedupes artwork", func(t *testing.T) {
		result, err := decodeDiscoveryFeedXML(
			strings.NewReader(readDiscoveryFeedFixture(t, "traditional_megaphone.xml")),
			discoveryBodyLimit,
		)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}

		episode := requireSingleParsedEpisode(t, result)
		if episode.EpisodeGUID != "6c107e30-01f4-11f1-8710-271632f3a072" {
			t.Fatalf("episodeGuid = %q", episode.EpisodeGUID)
		}
		if episode.Description != "<p>Encoded HTML description wins.</p>" {
			t.Fatalf("description = %q", episode.Description)
		}
		if episode.DescriptionHTML != "<p>Encoded HTML description wins.</p>" {
			t.Fatalf("descriptionHtml = %q", episode.DescriptionHTML)
		}
		if episode.ArtworkURL != "" {
			t.Fatalf("artworkUrl = %q, want empty after dedupe", episode.ArtworkURL)
		}
		if episode.Duration == nil || *episode.Duration != 2021 {
			t.Fatalf("duration = %#v, want 2021", episode.Duration)
		}
		if episode.EpisodeType != "bonus" {
			t.Fatalf("episodeType = %q, want bonus", episode.EpisodeType)
		}
		if episode.Explicit == nil || *episode.Explicit {
			t.Fatalf("explicit = %#v, want false", episode.Explicit)
		}
		if episode.FileSize == nil || *episode.FileSize != 0 {
			t.Fatalf("fileSize = %#v, want 0", episode.FileSize)
		}
	})

	t.Run("transistor maps numeric episode metadata", func(t *testing.T) {
		result, err := decodeDiscoveryFeedXML(
			strings.NewReader(readDiscoveryFeedFixture(t, "traditional_transistor.xml")),
			discoveryBodyLimit,
		)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}

		episode := requireSingleParsedEpisode(t, result)
		if episode.EpisodeGUID != "b34e7e5b-750f-43e1-ab2e-3cc93f7fb5fd" {
			t.Fatalf("episodeGuid = %q", episode.EpisodeGUID)
		}
		if episode.SeasonNumber != nil {
			t.Fatalf("seasonNumber = %#v, want nil", episode.SeasonNumber)
		}
		if episode.EpisodeNumber == nil || *episode.EpisodeNumber != 164 {
			t.Fatalf("episodeNumber = %#v, want 164", episode.EpisodeNumber)
		}
		if episode.Duration == nil || *episode.Duration != 3500 {
			t.Fatalf("duration = %#v, want 3500", episode.Duration)
		}
		if episode.DescriptionHTML == "" {
			t.Fatalf("descriptionHtml should not be empty")
		}
		if episode.Explicit == nil || *episode.Explicit {
			t.Fatalf("explicit = %#v, want false", episode.Explicit)
		}
	})
}
