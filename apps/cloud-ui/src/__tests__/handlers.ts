import { HttpResponse, http } from 'msw'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'

export const handlers = [
  // Mock iTunes Search
  http.get('https://itunes.apple.com/search', ({ request }) => {
    const url = new URL(request.url)
    const term = url.searchParams.get('term')

    if (term === 'empty') {
      return HttpResponse.json({ resultCount: 0, results: [] })
    }

    if (term === 'error') {
      return new HttpResponse(null, { status: 500 })
    }

    // Default mock response
    return HttpResponse.json({
      resultCount: 1,
      results: [
        {
          collectionId: 123456789,
          collectionName: 'Test Podcast',
          artistName: 'Test Artist',
          artworkUrl100: 'https://example.com/art100.jpg',
          artworkUrl600: 'https://example.com/art600.jpg',
          feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
          genres: ['Technology'],
          trackCount: 10,
          kind: 'podcast',
        },
      ],
    })
  }),

  // Mock iTunes Lookup
  http.get('https://itunes.apple.com/lookup', () => {
    return HttpResponse.json({
      resultCount: 1,
      results: [
        {
          collectionId: 123456789,
          collectionName: 'Test Podcast',
          artistName: 'Test Artist',
          artworkUrl100: 'https://example.com/art100.jpg',
          artworkUrl600: 'https://example.com/art600.jpg',
          feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
          genres: ['Technology'],
          kind: 'podcast',
        },
      ],
    })
  }),

  // Mock Generic RSS Feed
  http.get('https://example.com/feed.xml', () => {
    const rssXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
          <title>Test Podcast</title>
          <description>A test podcast description</description>
          <itunes:image href="https://example.com/art.jpg"/>
          <item>
            <title>Test Episode 1</title>
            <description>Episode description</description>
            <enclosure url="https://example.com/episode1.mp3" length="123456" type="audio/mpeg"/>
            <guid>episode-1</guid>
            <pubDate>Fri, 30 Jan 2026 12:00:00 GMT</pubDate>
            <itunes:duration>1200</itunes:duration>
          </item>
        </channel>
      </rss>
    `
    return new HttpResponse(rssXml, {
      headers: { 'Content-Type': 'application/xml' },
    })
  }),
]
