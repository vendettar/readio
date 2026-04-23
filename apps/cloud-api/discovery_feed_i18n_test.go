package main

import (
	"strings"
	"testing"
)

func TestDecodeDiscoveryFeedI18NFixture(t *testing.T) {
	result, err := decodeDiscoveryFeedXML(
		strings.NewReader(readDiscoveryFeedFixture(t, "i18n_storyfm.xml")),
		discoveryBodyLimit,
	)
	if err != nil {
		t.Fatalf("decodeDiscoveryFeedXML error = %v", err)
	}

	if result.Title != "故事FM" {
		t.Fatalf("title = %q, want 故事FM", result.Title)
	}
	if result.Description == "" {
		t.Fatalf("description should not be empty")
	}

	episode := requireSingleParsedEpisode(t, result)
	if episode.Title != "E891.我当饭圈粉头的那些年：我们抱团取暖，也作恶多端" {
		t.Fatalf("episode title = %q", episode.Title)
	}
	if episode.EpisodeGUID != "https://hosting.wavpub.cn/storyfm/?p=4587" {
		t.Fatalf("episodeGuid = %q", episode.EpisodeGUID)
	}
	if episode.AudioURL != "https://tk.wavpub.com/WPDL_CGCFfjkPREFSvhheuDWhTSutzadJkabVNGBWnEJCwcgakWgUBSumYmkkhj-9f.mp3" {
		t.Fatalf("audioUrl = %q", episode.AudioURL)
	}
	if episode.PubDate != "Tue, 21 Apr 2026 19:15:27 +0800" {
		t.Fatalf("pubDate = %q", episode.PubDate)
	}
	if episode.Duration == nil || *episode.Duration != 2201 {
		t.Fatalf("duration = %#v, want 2201", episode.Duration)
	}
	if episode.Description == "" {
		t.Fatalf("episode description should not be empty")
	}
	if episode.DescriptionHTML == "" {
		t.Fatalf("episode descriptionHtml should not be empty")
	}
}
