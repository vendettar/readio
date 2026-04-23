package main

import (
	"strings"
	"testing"
)

func TestDecodeDiscoveryFeedExtendedFixtures(t *testing.T) {
	t.Run("omny prefers enclosure and selects vtt transcript for cues", func(t *testing.T) {
		result, err := decodeDiscoveryFeedXML(
			strings.NewReader(readDiscoveryFeedFixture(t, "extended_omny.xml")),
			discoveryBodyLimit,
		)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}

		episode := requireSingleParsedEpisode(t, result)
		if episode.AudioURL != "https://example.com/omny/audio-enclosure.mp3" {
			t.Fatalf("audioUrl = %q, want enclosure URL", episode.AudioURL)
		}
		if episode.TranscriptURL != "https://example.com/omny/transcript.vtt" {
			t.Fatalf("transcriptUrl = %q, want vtt transcript URL", episode.TranscriptURL)
		}
		if episode.Link != "https://example.com/omny/episode-page" {
			t.Fatalf("link = %q", episode.Link)
		}
		if episode.FileSize == nil || *episode.FileSize != 36819377 {
			t.Fatalf("fileSize = %#v, want 36819377", episode.FileSize)
		}
		if episode.EpisodeType != "full" {
			t.Fatalf("episodeType = %q, want full", episode.EpisodeType)
		}
		if episode.ArtworkURL != "" {
			t.Fatalf("artworkUrl = %q, want empty after dedupe", episode.ArtworkURL)
		}
	})

	t.Run("no agenda ignores unsupported extensions without breaking parsing", func(t *testing.T) {
		result, err := decodeDiscoveryFeedXML(
			strings.NewReader(readDiscoveryFeedFixture(t, "extended_noagenda.xml")),
			discoveryBodyLimit,
		)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}

		episode := requireSingleParsedEpisode(t, result)
		if episode.AudioURL != "https://op3.dev/e/mp3s.nashownotes.com/NA-1861-2026-04-19-Final.mp3" {
			t.Fatalf("audioUrl = %q", episode.AudioURL)
		}
		if episode.Title != `1861 - "Cone of Uncertainty"` {
			t.Fatalf("title = %q", episode.Title)
		}
		if episode.EpisodeGUID != "http://1861.noagendanotes.com" {
			t.Fatalf("episodeGuid = %q", episode.EpisodeGUID)
		}
		if episode.TranscriptURL != "https://mp3s.nashownotes.com/NA-1861-Captions.srt" {
			t.Fatalf("transcriptUrl = %q", episode.TranscriptURL)
		}
	})

	t.Run("podnews ignores alternate enclosures but keeps transcript", func(t *testing.T) {
		result, err := decodeDiscoveryFeedXML(
			strings.NewReader(readDiscoveryFeedFixture(t, "extended_podnews.xml")),
			discoveryBodyLimit,
		)
		if err != nil {
			t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
		}

		episode := requireSingleParsedEpisode(t, result)
		if episode.AudioURL != "https://op3.dev/e,pg=9b024349-ccf0-5f69-a609-6b82873eab3c/podnews.net/audio/podnews260422.mp3" {
			t.Fatalf("audioUrl = %q", episode.AudioURL)
		}
		if episode.EpisodeGUID != "https://podnews.net/update/youtube-sirius-audio-sell-ads" {
			t.Fatalf("episodeGuid = %q", episode.EpisodeGUID)
		}
		if episode.TranscriptURL != "https://podnews.net/audio/podnews260422.mp3.vtt" {
			t.Fatalf("transcriptUrl = %q", episode.TranscriptURL)
		}
		if episode.FileSize == nil || *episode.FileSize != 5939047 {
			t.Fatalf("fileSize = %#v, want 5939047", episode.FileSize)
		}
	})
}
