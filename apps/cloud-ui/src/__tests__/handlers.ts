import { HttpResponse, http } from 'msw'

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
          genres: ['Technology'],
          kind: 'podcast',
        },
      ],
    })
  }),
]
