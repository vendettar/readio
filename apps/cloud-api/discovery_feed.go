package main

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Feed response types.

type parsedFeedResponse struct {
	Title       string                    `json:"title"`
	Description string                    `json:"description"`
	ArtworkURL  string                    `json:"artworkUrl,omitempty"`
	Episodes    []parsedFeedEpisodeResult `json:"episodes"`
}

type parsedFeedEpisodeResult struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	DescriptionHTML string   `json:"descriptionHtml,omitempty"`
	AudioURL        string   `json:"audioUrl"`
	PubDate         string   `json:"pubDate"`
	ArtworkURL      string   `json:"artworkUrl,omitempty"`
	Duration        *float64 `json:"duration,omitempty"`
	SeasonNumber    *int     `json:"seasonNumber,omitempty"`
	EpisodeNumber   *int     `json:"episodeNumber,omitempty"`
	EpisodeType     string   `json:"episodeType,omitempty"`
	Explicit        *bool    `json:"explicit,omitempty"`
	Link            string   `json:"link,omitempty"`
	FileSize        *int64   `json:"fileSize,omitempty"`
	TranscriptURL   string   `json:"transcriptUrl,omitempty"`
	ChaptersURL     string   `json:"chaptersUrl,omitempty"`
}

// RSS XML types.

type rssDocument struct {
	Channel rssChannel `xml:"channel"`
}

type rssChannel struct {
	Title        string              `xml:"title"`
	Description  string              `xml:"description"`
	Image        rssHrefElement      `xml:"http://www.itunes.com/dtds/podcast-1.0.dtd image"`
	ChannelImage rssChannelImageInfo `xml:"image"`
	Items        []rssItem           `xml:"item"`
}

type rssItem struct {
	Title       string         `xml:"title"`
	Description string         `xml:"description"`
	Summary     string         `xml:"summary"`
	Encoded     string         `xml:"encoded"`
	GUID        string         `xml:"guid"`
	PubDate     string         `xml:"pubDate"`
	Link        string         `xml:"link"`
	Enclosure   rssEnclosure   `xml:"enclosure"`
	Image       rssHrefElement `xml:"http://www.itunes.com/dtds/podcast-1.0.dtd image"`
	Duration    string         `xml:"duration"`
	Season      string         `xml:"season"`
	Episode     string         `xml:"episode"`
	EpisodeType string         `xml:"episodeType"`
	Explicit    string         `xml:"explicit"`
	Transcript  rssHrefElement `xml:"transcript"`
	Chapters    rssHrefElement `xml:"chapters"`
}

type rssEnclosure struct {
	URL    string `xml:"url,attr"`
	Length string `xml:"length,attr"`
}

type rssHrefElement struct {
	Href string `xml:"href,attr"`
	URL  string `xml:"url,attr"`
	Text string `xml:",chardata"`
}

type rssChannelImageInfo struct {
	URL string `xml:"url"`
}

// Fetch & decode.

func (s *discoveryService) handleFeed(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	route := discoveryFeedRoute

	feedURL, err := parseDiscoveryFeedURL(r.URL.Query())
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, "feed", "", time.Since(start), err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	parsedURL, _ := url.ParseRequestURI(feedURL)
	host := ""
	if parsedURL != nil {
		host = parsedURL.Host
	}

	payload, err := s.fetchFeed(ctx, feedURL)
	if err != nil {
		writeDiscoveryMappedError(w, err)
		logDiscoveryRequest(route, "feed", host, time.Since(start), err)
		return
	}

	writeDiscoveryJSON(w, http.StatusOK, payload)
	logDiscoveryRequest(route, "feed", host, time.Since(start), nil)
}

func (s *discoveryService) fetchFeed(ctx context.Context, requestURL string) (parsedFeedResponse, error) {
	parsedURL, err := url.ParseRequestURI(requestURL)
	if err != nil {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "INVALID_URL",
			message: "url must be a valid absolute http or https URL",
		}
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "INVALID_URL",
			message: "url must be a valid absolute http or https URL",
		}
	}
	if err := validateProxyTarget(parsedURL); err != nil {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "INVALID_URL",
			message: err.Error(),
		}
	}

	proxy := &proxyService{
		timeout:     s.timeout,
		userAgent:   s.userAgent,
		bodyLimit:   s.bodyLimit,
		lookupIP:    s.lookupIP,
		dialContext: s.dialContext,
	}
	validatedAddrs, err := proxy.resolveProxyTargetAddresses(ctx, parsedURL)
	if err != nil {
		return parsedFeedResponse{}, &discoveryParamError{
			code:    "INVALID_URL",
			message: err.Error(),
		}
	}

	client := s.newValidatedFeedClient(validatedAddrs)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return parsedFeedResponse{}, fmt.Errorf("create feed upstream request: %w", err)
	}
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("User-Agent", discoveryBrowserUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return parsedFeedResponse{}, errDiscoveryTimeout
		}
		return parsedFeedResponse{}, fmt.Errorf("perform discovery feed request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return parsedFeedResponse{}, &discoveryUpstreamStatusError{status: resp.StatusCode}
	}

	return decodeDiscoveryFeed(resp.Body, s.bodyLimit)
}

func (s *discoveryService) newValidatedFeedClient(validatedAddrs []netip.Addr) *http.Client {
	proxy := &proxyService{
		timeout:     s.timeout,
		userAgent:   s.userAgent,
		bodyLimit:   s.bodyLimit,
		lookupIP:    s.lookupIP,
		dialContext: s.dialContext,
	}

	client := proxy.newProxyClient(validatedAddrs)
	if s.timeout > 0 {
		client.Timeout = s.timeout
	}

	return client
}

// XML sanitization.

var xmlEntityRe = regexp.MustCompile(`^(?:amp|lt|gt|quot|apos)$|^#\d+$|^#[xX][0-9a-fA-F]+$`)

func sanitizeXML(data []byte) []byte {
	cleaned := bytes.Map(func(r rune) rune {
		if r == 0x09 || r == 0x0A || r == 0x0D {
			return r
		}
		if r >= 0x00 && r <= 0x08 || r == 0x0B || r == 0x0C || r >= 0x0E && r <= 0x1F || r == 0x7F {
			return -1
		}
		return r
	}, data)

	var buf bytes.Buffer
	i := 0
	inCDATA := false
	for i < len(cleaned) {
		// Check for CDATA start
		if !inCDATA && i+9 <= len(cleaned) && string(cleaned[i:i+9]) == "<![CDATA[" {
			inCDATA = true
			buf.Write(cleaned[i : i+9])
			i += 9
			continue
		}
		// Check for CDATA end
		if inCDATA && i+3 <= len(cleaned) && string(cleaned[i:i+3]) == "]]>" {
			inCDATA = false
			buf.Write(cleaned[i : i+3])
			i += 3
			continue
		}

		if inCDATA {
			buf.WriteByte(cleaned[i])
			i++
			continue
		}

		if cleaned[i] != '&' {
			buf.WriteByte(cleaned[i])
			i++
			continue
		}
		if isXMLEntity(cleaned, i) {
			buf.WriteByte('&')
			i++
		} else {
			buf.WriteString("&amp;")
			i++
		}
	}
	return buf.Bytes()
}

func isXMLEntity(data []byte, pos int) bool {
	rest := data[pos+1:]
	semicolon := bytes.IndexByte(rest, ';')
	if semicolon == -1 || semicolon > 10 {
		return false
	}
	entity := rest[:semicolon]
	if len(entity) == 0 {
		return false
	}
	return xmlEntityRe.Match(entity)
}

// Feed decode & mapping.

func decodeDiscoveryFeed(body io.Reader, limit int64) (parsedFeedResponse, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return parsedFeedResponse{}, fmt.Errorf("read discovery upstream body: %w", err)
	}
	if int64(len(data)) > limit {
		return parsedFeedResponse{}, errDiscoveryTooLarge
	}

	decoder := xml.NewDecoder(bytes.NewReader(sanitizeXML(data)))
	decoder.Strict = false

	var document rssDocument
	if err := decoder.Decode(&document); err != nil {
		slog.Warn("discovery feed XML decode failed", "snippet_prefix", string(data[:min(len(data), 100)]))
		return parsedFeedResponse{}, errDiscoveryXMLDecode
	}

	payload, err := mapParsedFeed(document)
	if err != nil {
		return parsedFeedResponse{}, errDiscoveryXMLDecode
	}
	return payload, nil
}

func mapParsedFeed(document rssDocument) (parsedFeedResponse, error) {
	title := strings.TrimSpace(document.Channel.Title)
	if title == "" {
		return parsedFeedResponse{}, errDiscoveryXMLDecode
	}

	artworkURL := sanitizeOptionalAbsoluteURL(firstNonEmpty(document.Channel.Image.Href, document.Channel.ChannelImage.URL))
	channelArtworkNormalized := normalizeDiscoveryArtworkURL(artworkURL)

	episodes := make([]parsedFeedEpisodeResult, 0, len(document.Channel.Items))
	for _, item := range document.Channel.Items {
		mapped, ok := mapParsedFeedEpisode(item, channelArtworkNormalized)
		if ok {
			episodes = append(episodes, mapped)
		}
	}

	return parsedFeedResponse{
		Title:       title,
		Description: strings.TrimSpace(document.Channel.Description),
		ArtworkURL:  artworkURL,
		Episodes:    episodes,
	}, nil
}

func mapParsedFeedEpisode(item rssItem, channelArtworkNormalized string) (parsedFeedEpisodeResult, bool) {
	audioURL := sanitizeOptionalAbsoluteURL(item.Enclosure.URL)
	title := strings.TrimSpace(item.Title)
	pubDate := strings.TrimSpace(item.PubDate)
	if audioURL == "" || title == "" || pubDate == "" {
		return parsedFeedEpisodeResult{}, false
	}

	id := firstNonEmpty(strings.TrimSpace(item.GUID), audioURL)
	if id == "" {
		return parsedFeedEpisodeResult{}, false
	}

	description, descriptionHTML := deriveParsedFeedDescription(item)
	artworkURL := sanitizeOptionalAbsoluteURL(firstNonEmpty(item.Image.Href, item.Image.URL))
	if artworkURL != "" && normalizeDiscoveryArtworkURL(artworkURL) == channelArtworkNormalized {
		artworkURL = ""
	}

	return parsedFeedEpisodeResult{
		ID:              id,
		Title:           title,
		Description:     description,
		DescriptionHTML: descriptionHTML,
		AudioURL:        audioURL,
		PubDate:         pubDate,
		ArtworkURL:      artworkURL,
		Duration:        parseParsedFeedDuration(item.Duration),
		SeasonNumber:    parseParsedFeedInt(item.Season),
		EpisodeNumber:   parseParsedFeedInt(item.Episode),
		EpisodeType:     parseParsedFeedEpisodeType(item.EpisodeType),
		Explicit:        parseParsedFeedExplicit(item.Explicit),
		Link:            sanitizeOptionalAbsoluteURL(item.Link),
		FileSize:        parseParsedFeedInt64(item.Enclosure.Length),
		TranscriptURL:   sanitizeOptionalAbsoluteURL(firstNonEmpty(item.Transcript.Href, item.Transcript.URL)),
		ChaptersURL:     sanitizeOptionalAbsoluteURL(firstNonEmpty(item.Chapters.Href, item.Chapters.URL)),
	}, true
}

func deriveParsedFeedDescription(item rssItem) (string, string) {
	encoded := strings.TrimSpace(item.Encoded)
	description := strings.TrimSpace(item.Description)
	summary := strings.TrimSpace(item.Summary)

	if encoded != "" {
		return encoded, encoded
	}
	if strings.Contains(description, "<p") || strings.Contains(description, "<br") || strings.Contains(description, "<a ") {
		return description, description
	}
	if len(description) >= len(summary) {
		return description, ""
	}
	return summary, ""
}

// Feed parsing helpers.

func parseParsedFeedDuration(raw string) *float64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}

	if strings.Contains(value, ":") {
		parts := strings.Split(value, ":")
		seconds := 0
		multiplier := 1
		for index := len(parts) - 1; index >= 0; index-- {
			part, err := strconv.Atoi(strings.TrimSpace(parts[index]))
			if err != nil || part < 0 {
				return nil
			}
			seconds += part * multiplier
			multiplier *= 60
		}
		result := float64(seconds)
		return &result
	}

	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < 0 {
		return nil
	}
	result := float64(seconds)
	return &result
}

func parseParsedFeedInt(raw string) *int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return nil
	}
	return &parsed
}

func parseParsedFeedInt64(raw string) *int64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return nil
	}
	return &parsed
}

func parseParsedFeedEpisodeType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "full", "trailer", "bonus":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return ""
	}
}

func parseParsedFeedExplicit(raw string) *bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "yes", "true":
		value := true
		return &value
	case "no", "false":
		value := false
		return &value
	default:
		return nil
	}
}

func sanitizeOptionalAbsoluteURL(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || !parsed.IsAbs() {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	return parsed.String()
}

var normalizeArtworkURLRe = regexp.MustCompile(`_\d+(\.[a-z]+)$`)

func normalizeDiscoveryArtworkURL(raw string) string {
	value := sanitizeOptionalAbsoluteURL(raw)
	if value == "" {
		return ""
	}
	withoutQuery := strings.Split(value, "?")[0]
	return normalizeArtworkURLRe.ReplaceAllString(strings.ToLower(withoutQuery), "$1")
}
