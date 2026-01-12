# iTunes & Apple Podcasts API Documentation

This document provides a reference for the iTunes and Apple Podcasts APIs used in the Readio project. Each section includes a description, the API URL, and a `curl` command for testing, followed by the **complete** JSON response.

## 1. Top Charts (Apple Podcasts RSS API)

These APIs are used to fetch the most popular content across different regions.

### 🔝 Top Podcasts
Fetches the current top podcasts in a specific country.
- **URL**: `https://rss.marketingtools.apple.com/api/v2/{country}/podcasts/top/{limit}/podcasts.json`
- **Example**: Top 1 podcasts in the US.
```bash
curl "https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/1/podcasts.json"
```
**Full Response**:
```json
{
  "feed": {
    "title": "Top Shows",
    "id": "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/1/podcasts.json",
    "author": {
      "name": "Apple",
      "url": "https://www.apple.com/"
    },
    "links": [
      {
        "self": "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/1/podcasts.json"
      }
    ],
    "copyright": "Copyright © 2026 Apple Inc. All rights reserved.",
    "country": "us",
    "icon": "https://www.apple.com/favicon.ico",
    "updated": "Fri, 9 Jan 2026 05:49:52 +0000",
    "results": [
      {
        "artistName": "The New York Times",
        "id": "1200361736",
        "name": "The Daily",
        "kind": "podcasts",
        "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/100x100bb.png",
        "genres": [
          {
            "genreId": "1489",
            "name": "News",
            "url": "https://itunes.apple.com/us/genre/id1489"
          }
        ],
        "url": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736"
      }
    ]
  }
}
```

### 🎧 Top Episodes
Fetches the current top trending podcast episodes.
- **URL**: `https://rss.marketingtools.apple.com/api/v2/{country}/podcasts/top/{limit}/podcast-episodes.json`
- **Example**: Top 1 episodes in the US.
```bash
curl "https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/1/podcast-episodes.json"
```
**Full Response**:
```json
{
  "feed": {
    "title": "Top Episodes",
    "id": "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/1/podcast-episodes.json",
    "author": {
      "name": "Apple",
      "url": "https://www.apple.com/"
    },
    "links": [
      {
        "self": "https://rss.applemarketingtools.com/api/v2/us/podcasts/top/1/podcast-episodes.json"
      }
    ],
    "copyright": "Copyright © 2026 Apple Inc. All rights reserved.",
    "country": "us",
    "icon": "https://www.apple.com/favicon.ico",
    "updated": "Fri, 9 Jan 2026 05:49:54 +0000",
    "results": [
      {
        "artistName": "The New York Times",
        "id": "1000744275511",
        "name": "The R.F.K. Jr. Era of Childhood Vaccines",
        "kind": "podcast-episodes",
        "contentAdvisoryRating": "Explict",
        "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/100x100bb.png",
        "genres": [
          {
            "name": "Daily News"
          }
        ],
        "url": "https://podcasts.apple.com/us/podcast/the-r-f-k-jr-era-of-childhood-vaccines/id1200361736?i=1000744275511"
      }
    ]
  }
}
```

### 💎 Top Subscriber Podcasts
Fetches podcasts with high subscriber growth/count.
- **URL**: `https://rss.marketingtools.apple.com/api/v2/{country}/podcasts/top-subscriber/{limit}/podcasts.json`
- **Example**: Top 1 subscriber podcasts in the US.
```bash
curl "https://rss.marketingtools.apple.com/api/v2/us/podcasts/top-subscriber/1/podcasts.json"
```
**Full Response**:
```json
{
  "feed": {
    "title": "Top Subscriber Shows",
    "id": "https://rss.applemarketingtools.com/api/v2/us/podcasts/top-subscriber/1/podcasts.json",
    "author": {
      "name": "Apple",
      "url": "https://www.apple.com/"
    },
    "links": [
      {
        "self": "https://rss.applemarketingtools.com/api/v2/us/podcasts/top-subscriber/1/podcasts.json"
      }
    ],
    "copyright": "Copyright © 2026 Apple Inc. All rights reserved.",
    "country": "us",
    "icon": "https://www.apple.com/favicon.ico",
    "updated": "Fri, 9 Jan 2026 05:49:55 +0000",
    "results": [
      {
        "artistName": "The New York Times",
        "id": "1200361736",
        "name": "The Daily",
        "kind": "podcasts",
        "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/100x100bb.png",
        "genres": [
          {
            "genreId": "1489",
            "name": "News",
            "url": "https://itunes.apple.com/us/genre/id1489"
          }
        ],
        "url": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736"
      }
    ]
  }
}
```

---

## 2. Search & discovery (iTunes Search API)

Used for keyword-based searching.

### 🔍 Search Podcasts
Search for podcast shows by name or author.
- **URL Prefix**: `https://itunes.apple.com/search`
- **Params**: `term`, `country`, `media=podcast`, `limit`
```bash
curl "https://itunes.apple.com/search?term=daily&country=us&media=podcast&limit=1"
```
**Full Response**:
```json
{
  "resultCount": 1,
  "results": [
    {
      "wrapperType": "track",
      "kind": "podcast",
      "artistId": 121664449,
      "collectionId": 1200361736,
      "trackId": 1200361736,
      "artistName": "The New York Times",
      "collectionName": "The Daily",
      "trackName": "The Daily",
      "collectionCensoredName": "The Daily",
      "trackCensoredName": "The Daily",
      "artistViewUrl": "https://podcasts.apple.com/us/artist/the-new-york-times/121664449?uo=4",
      "collectionViewUrl": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?uo=4",
      "feedUrl": "https://feeds.simplecast.com/Sl5CSM3S",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?uo=4",
      "artworkUrl30": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/30x30bb.jpg",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/60x60bb.jpg",
      "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/100x100bb.jpg",
      "collectionPrice": 0.00,
      "trackPrice": 0.00,
      "collectionHdPrice": 0,
      "releaseDate": "2026-01-08T10:45:00Z",
      "collectionExplicitness": "notExplicit",
      "trackExplicitness": "cleaned",
      "trackCount": 2475,
      "trackTimeMillis": 1573,
      "country": "USA",
      "currency": "USD",
      "primaryGenreName": "Daily News",
      "contentAdvisoryRating": "Clean",
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/600x600bb.jpg",
      "genreIds": [
        "1526",
        "26",
        "1489"
      ],
      "genres": [
        "Daily News",
        "Podcasts",
        "News"
      ]
    }
  ]
}
```

### 📜 Search Episodes
Search for individual episodes by title.
- **URL Prefix**: `https://itunes.apple.com/search`
- **Params**: `term`, `country`, `media=podcast`, `entity=podcastEpisode`, `limit`
```bash
curl "https://itunes.apple.com/search?term=The+Daily&country=us&media=podcast&entity=podcastEpisode&limit=1"
```
**Full Response**:
```json
{
  "resultCount": 1,
  "results": [
    {
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/600x600bb.jpg",
      "artworkUrl160": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/160x160bb.jpg",
      "episodeFileExtension": "mp3",
      "episodeContentType": "audio",
      "shortDescription": "Warning: This episode contains strong language.\nThe Centers for Disease Control and Prevention on Monday released new guidelines that dramaticaly cut down the number of childhood vaccines recommended by the federal government.\nApoorva Mandavilli and Ben",
      "genres": [
        {
          "name": "Daily News",
          "id": "1526"
        }
      ],
      "episodeGuid": "4daddbc2-abb0-46d8-882b-966556ce7334",
      "releaseDate": "2026-01-08T10:45:00Z",
      "trackId": 1000744275511,
      "trackName": "The R.F.K. Jr. Era of Childhood Vaccines",
      "feedUrl": "https://feeds.simplecast.com/Sl5CSM3S",
      "closedCaptioning": "none",
      "collectionId": 1200361736,
      "collectionName": "The Daily",
      "artistIds": [
        121664449
      ],
      "kind": "podcast-episode",
      "wrapperType": "podcastEpisode",
      "description": "Warning: This episode contains strong language.\nThe Centers for Disease Control and Prevention on Monday released new guidelines that dramaticaly cut down the number of childhood vaccines recommended by the federal government.\nApoorva Mandavilli and Benjamin Mueller, who cover health, explain what is being cut and how it fits into Health Secretary Robert F. Kennedy Jr.’s broader agenda.\nGuest:\nApoorva Mandavilli, a science and global health reporter at The New York Times.Benjamin Mueller, a reporter covering health and medicine for The New York Times.Background reading: \nMr. Kennedy on Monday scaled back the number of vaccines recommended for children.Here’s what to know about the new childhood vaccine schedule.Photo: Annie Rice/EPA, via Shutterstock\nFor more information on today’s episode, visit nytimes.com/thedaily. Transcripts of each episode will be made available by the next workday. \n\nSubscribe today at nytimes.com/podcasts or on Apple Podcasts and Spotify. You can also subscribe via your favorite podcast app here https://www.nytimes.com/activate-access/audio?source=podcatcher. For more podcasts and narrated articles, download The New York Times app at nytimes.com/app.",
      "country": "USA",
      "artistViewUrl": "https://itunes.apple.com/us/artist/the-new-york-times/121664449?mt=2&uo=4",
      "collectionViewUrl": "https://itunes.apple.com/us/podcast/the-daily/id1200361736?mt=2&uo=4",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/the-r-f-k-jr-era-of-childhood-vaccines/id1200361736?i=1000744275511&uo=4",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/60x60bb.jpg",
      "trackTimeMillis": 1573000,
      "contentAdvisoryRating": "Explicit",
      "episodeUrl": "https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/6qj4J/pscrb.fm/rss/p/nyt.simplecastaudio.com/03d8b493-87fc-4bd1-931f-8a8e9b945d8a/episodes/08f924d6-da29-4a36-8de6-4acdfd64becd/audio/128/default.mp3?aid=rss_feed&awCollectionId=03d8b493-87fc-4bd1-931f-8a8e9b945d8a&awEpisodeId=08f924d6-da29-4a36-8de6-4acdfd64becd&feed=Sl5CSM3S",
      "previewUrl": "https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/6qj4J/pscrb.fm/rss/p/nyt.simplecastaudio.com/03d8b493-87fc-4bd1-931f-8a8e9b945d8a/episodes/08f924d6-da29-4a36-8de6-4acdfd64becd/audio/128/default.mp3?aid=rss_feed&awCollectionId=03d8b493-87fc-4bd1-931f-8a8e9b945d8a&awEpisodeId=08f924d6-da29-4a36-8de6-4acdfd64becd&feed=Sl5CSM3S"
    }
  ]
}
```

---

## 3. Metadata Lookup (iTunes Lookup API)

Used for retrieving reliable data using a specific ID (Track ID or Collection ID).

### 📖 Lookup Podcast Full
Retrieve full metadata for a podcast by its collectionId.
- **URL Prefix**: `https://itunes.apple.com/lookup`
- **Params**: `id`, `country`, `entity=podcast`
```bash
# Example: Lookup 'Serial' (917918570)
curl "https://itunes.apple.com/lookup?id=917918570&country=us&entity=podcast"
```
**Full Response**:
```json
{
  "resultCount": 1,
  "results": [
    {
      "wrapperType": "track",
      "kind": "podcast",
      "artistId": 364380278,
      "collectionId": 917918570,
      "trackId": 917918570,
      "artistName": "Serial Productions & The New York Times",
      "collectionName": "Serial",
      "trackName": "Serial",
      "collectionCensoredName": "Serial",
      "trackCensoredName": "Serial",
      "artistViewUrl": "https://podcasts.apple.com/us/artist/wbez/364380278?uo=4",
      "collectionViewUrl": "https://podcasts.apple.com/us/podcast/serial/id917918570?uo=4",
      "feedUrl": "https://feeds.simplecast.com/PpzWFGhg",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/serial/id917918570?uo=4",
      "artworkUrl30": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/30x30bb.jpg",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/60x60bb.jpg",
      "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/100x100bb.jpg",
      "collectionPrice": 0.00,
      "trackPrice": 0.00,
      "collectionHdPrice": 0,
      "releaseDate": "2025-10-30T09:50:00Z",
      "collectionExplicitness": "notExplicit",
      "trackExplicitness": "cleaned",
      "trackCount": 112,
      "trackTimeMillis": 2423,
      "country": "USA",
      "currency": "USD",
      "primaryGenreName": "News",
      "contentAdvisoryRating": "Clean",
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/600x600bb.jpg",
      "genreIds": [
        "1489",
        "26",
        "1488"
      ],
      "genres": [
        "News",
        "Podcasts",
        "True Crime"
      ]
    }
  ]
}
```

### 🎯 Lookup Episode (The "Podcast + Episode" Approach)
**Note**: The iTunes Lookup API often fails to retrieve a specific episode by its single `trackId` directly. The most reliable method is to lookup the **Podcast ID** and include episodes.

> ⚠️ **Critical Limitation (Tested 2026-01-09)**: The `limit` parameter is **ineffective** for most podcasts. Even with `limit=300`, the API only returns ~25 episodes (matching what the podcast provider puts in their RSS feed). For example, "The Daily" has `trackCount: 2475` but the API only returns 23 episodes. **You cannot retrieve a podcast's full episode archive via this API.**

- **URL Prefix**: `https://itunes.apple.com/lookup`
- **Params**: `id={PODCAST_ID}`, `entity=podcastEpisode`, `limit=1`
```bash
# Example: Lookup 'The Daily' (1200361736) and its most recent episode
curl "https://itunes.apple.com/lookup?id=1200361736&country=us&entity=podcastEpisode&limit=1"
```
**Full Response**:
```json
{
  "resultCount": 2,
  "results": [
    {
      "wrapperType": "track",
      "kind": "podcast",
      "artistId": 121664449,
      "collectionId": 1200361736,
      "trackId": 1200361736,
      "artistName": "The New York Times",
      "collectionName": "The Daily",
      "trackName": "The Daily",
      "collectionCensoredName": "The Daily",
      "trackCensoredName": "The Daily",
      "artistViewUrl": "https://podcasts.apple.com/us/artist/the-new-york-times/121664449?uo=4",
      "collectionViewUrl": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?uo=4",
      "feedUrl": "https://feeds.simplecast.com/Sl5CSM3S",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?uo=4",
      "artworkUrl30": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/30x30bb.jpg",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/60x60bb.jpg",
      "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/100x100bb.jpg",
      "collectionPrice": 0.00,
      "trackPrice": 0.00,
      "collectionHdPrice": 0,
      "releaseDate": "2026-01-08T10:45:00Z",
      "collectionExplicitness": "notExplicit",
      "trackExplicitness": "cleaned",
      "trackCount": 2475,
      "trackTimeMillis": 1573,
      "country": "USA",
      "currency": "USD",
      "primaryGenreName": "Daily News",
      "contentAdvisoryRating": "Clean",
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/600x600bb.jpg",
      "genreIds": [
        "1526",
        "26",
        "1489"
      ],
      "genres": [
        "Daily News",
        "Podcasts",
        "News"
      ]
    },
    {
      "artworkUrl160": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/160x160bb.jpg",
      "artistViewUrl": "https://itunes.apple.com/us/artist/the-new-york-times/121664449?mt=2&uo=4",
      "collectionViewUrl": "https://itunes.apple.com/us/podcast/the-daily/id1200361736?mt=2&uo=4",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/the-r-f-k-jr-era-of-childhood-vaccines/id1200361736?i=1000744275511&uo=4",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/60x60bb.jpg",
      "trackTimeMillis": 1573000,
      "contentAdvisoryRating": "Explicit",
      "episodeUrl": "https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/6qj4J/pscrb.fm/rss/p/nyt.simplecastaudio.com/03d8b493-87fc-4bd1-931f-8a8e9b945d8a/episodes/08f924d6-da29-4a36-8de6-4acdfd64becd/audio/128/default.mp3?aid=rss_feed&awCollectionId=03d8b493-87fc-4bd1-931f-8a8e9b945d8a&awEpisodeId=08f924d6-da29-4a36-8de6-4acdfd64becd&feed=Sl5CSM3S",
      "episodeFileExtension": "mp3",
      "episodeContentType": "audio",
      "artistIds": [
        121664449
      ],
      "genres": [
        {
          "name": "Daily News",
          "id": "1526"
        }
      ],
      "episodeGuid": "4daddbc2-abb0-46d8-882b-966556ce7334",
      "trackId": 1000744275511,
      "trackName": "The R.F.K. Jr. Era of Childhood Vaccines",
      "releaseDate": "2026-01-08T10:45:00Z",
      "feedUrl": "https://feeds.simplecast.com/Sl5CSM3S",
      "shortDescription": "Warning: This episode contains strong language.\nThe Centers for Disease Control and Prevention on Monday released new guidelines that dramaticaly cut down the number of childhood vaccines recommended by the federal government.",
      "closedCaptioning": "none",
      "collectionId": 1200361736,
      "collectionName": "The Daily",
      "kind": "podcast-episode",
      "wrapperType": "podcastEpisode",
      "description": "Warning: This episode contains strong language.\nThe Centers for Disease Control and Prevention on Monday released new guidelines that dramaticaly cut down the number of childhood vaccines recommended by the federal government.\nApoorva Mandavilli and Benjamin Mueller, who cover health, explain what is being cut and how it fits into Health Secretary Robert F. Kennedy Jr.’s broader agenda.\nGuest:\nApoorva Mandavilli, a science and global health reporter at The New York Times.Benjamin Mueller, a reporter covering health and medicine for The New York Times.Background reading: \nMr. Kennedy on Monday scaled back the number of vaccines recommended for children.Here’s what to know about the new childhood vaccine schedule.Photo: Annie Rice/EPA, via Shutterstock\nFor more information on today’s episode, visit nytimes.com/thedaily. Transcripts of each episode will be made available by the next workday. \n\nSubscribe today at nytimes.com/podcasts or on Apple Podcasts and Spotify. You can also subscribe via your favorite podcast app here https://www.nytimes.com/activate-access/audio?source=podcatcher. For more podcasts and narrated articles, download The New York Times app at nytimes.com/app.",
      "country": "USA",
      "previewUrl": "https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/6qj4J/pscrb.fm/rss/p/nyt.simplecastaudio.com/03d8b493-87fc-4bd1-931f-8a8e9b945d8a/episodes/08f924d6-da29-4a36-8de6-4acdfd64becd/audio/128/default.mp3?aid=rss_feed&awCollectionId=03d8b493-87fc-4bd1-931f-8a8e9b945d8a&awEpisodeId=08f924d6-da29-4a36-8de6-4acdfd64becd&feed=Sl5CSM3S",
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/31/27/8c/31278cb7-f14b-8f6c-3c8a-17b902389d84/mza_14455475810862166418.jpg/600x600bb.jpg"
    }
  ]
}
```

### 📦 Bulk Lookup Podcasts
Lookup multiple podcasts at once using a comma-separated list of IDs.
- **URL Prefix**: `https://itunes.apple.com/lookup`
- **Params**: `id` (comma-separated), `country`, `entity=podcast`
```bash
# Example: Lookup 'The Daily' and 'Serial'
curl "https://itunes.apple.com/lookup?id=1200361736,917918570&country=us&entity=podcast"
```
**Full Response**:
```json
{
  "resultCount": 2,
  "results": [
    {
      "wrapperType": "track",
      "kind": "podcast",
      "artistId": 121664449,
      "collectionId": 1200361736,
      "trackId": 1200361736,
      "artistName": "The New York Times",
      "collectionName": "The Daily",
      "trackName": "The Daily",
      "collectionCensoredName": "The Daily",
      "trackCensoredName": "The Daily",
      "artistViewUrl": "https://podcasts.apple.com/us/artist/the-new-york-times/121664449?uo=4",
      "collectionViewUrl": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?uo=4",
      "feedUrl": "https://feeds.simplecast.com/Sl5CSM3S",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?uo=4",
      "artworkUrl30": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/30x30bb.jpg",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/60x60bb.jpg",
      "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/100x100bb.jpg",
      "collectionPrice": 0.00,
      "trackPrice": 0.00,
      "collectionHdPrice": 0,
      "releaseDate": "2026-01-08T10:45:00Z",
      "collectionExplicitness": "notExplicit",
      "trackExplicitness": "cleaned",
      "trackCount": 2475,
      "trackTimeMillis": 1573,
      "country": "USA",
      "currency": "USD",
      "primaryGenreName": "Daily News",
      "contentAdvisoryRating": "Clean",
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/ab/64/66/ab6466a9-9a7d-e20e-7a3d-bc5be37d29ce/mza_15084852813176276273.jpg/600x600bb.jpg",
      "genreIds": [
        "1526",
        "26",
        "1489"
      ],
      "genres": [
        "Daily News",
        "Podcasts",
        "News"
      ]
    },
    {
      "wrapperType": "track",
      "kind": "podcast",
      "artistId": 364380278,
      "collectionId": 917918570,
      "trackId": 917918570,
      "artistName": "Serial Productions & The New York Times",
      "collectionName": "Serial",
      "trackName": "Serial",
      "collectionCensoredName": "Serial",
      "trackCensoredName": "Serial",
      "artistViewUrl": "https://podcasts.apple.com/us/artist/wbez/364380278?uo=4",
      "collectionViewUrl": "https://podcasts.apple.com/us/podcast/serial/id917918570?uo=4",
      "feedUrl": "https://feeds.simplecast.com/PpzWFGhg",
      "trackViewUrl": "https://podcasts.apple.com/us/podcast/serial/id917918570?uo=4",
      "artworkUrl30": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/30x30bb.jpg",
      "artworkUrl60": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/60x60bb.jpg",
      "artworkUrl100": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/100x100bb.jpg",
      "collectionPrice": 0.00,
      "trackPrice": 0.00,
      "collectionHdPrice": 0,
      "releaseDate": "2025-10-30T09:50:00Z",
      "collectionExplicitness": "notExplicit",
      "trackExplicitness": "cleaned",
      "trackCount": 112,
      "trackTimeMillis": 2423,
      "country": "USA",
      "currency": "USD",
      "primaryGenreName": "News",
      "contentAdvisoryRating": "Clean",
      "artworkUrl600": "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/9a/fb/87/9afb8760-0e05-2b3e-24a2-7e14cce74570/mza_14816055607064169808.jpg/600x600bb.jpg",
      "genreIds": [
        "1489",
        "26",
        "1488"
      ],
      "genres": [
        "News",
        "Podcasts",
        "True Crime"
      ]
    }
  ]
}
```

---

## Parameters Summary

| Parameter | Description | Common Values |
| :--- | :--- | :--- |
| `country` | Two-letter ISO country code | `us`, `cn`, `jp`, `kr`, `gb` |
| `limit` | Number of results to return | `10`, `30`, `50` |
| `term` | URL-encoded search string | `search+query` |
| `media` | Type of media to search | `podcast` |
| `entity` | Specific object type | `podcast`, `podcastEpisode` |
| `id` | iTunes ID (Numeric) | e.g. `1200361736` |

---

## 4. Additional APIs (Not Currently Used)

The following APIs are available but not currently used in Readio. Documented here for future reference.

### 🎤 Artist/Publisher Lookup
Retrieve all podcasts from a specific publisher/artist.
- **URL Prefix**: `https://itunes.apple.com/lookup`
- **Params**: `id={ARTIST_ID}`, `entity=podcast`
- **Use Case**: "More from The New York Times" - show all podcasts from the same publisher
```bash
# Example: All podcasts from The New York Times (artistId: 121664449)
curl "https://itunes.apple.com/lookup?id=121664449&country=us&entity=podcast"
```
**Notes**:
- `artistId` can be found in podcast metadata response (e.g., `artistId: 121664449`)
- Returns all podcasts published by that artist/company
- Useful for "Related Shows" or "From the Same Publisher" sections

### 🏷️ Search with Genre Filter
Search podcasts within a specific genre.
- **URL Prefix**: `https://itunes.apple.com/search`
- **Params**: `term`, `media=podcast`, `genreId={GENRE_ID}`
```bash
# Example: Search "news" within the News genre (1489)
curl "https://itunes.apple.com/search?term=news&country=us&media=podcast&genreId=1489&limit=10"
```
**Available Genre IDs**:
| genreId | Name |
|---------|------|
| 1301 | Arts |
| 1303 | Comedy |
| 1304 | Education |
| 1305 | Kids & Family |
| 1310 | Music |
| 1314 | Religion & Spirituality |
| 1318 | Technology |
| 1321 | Business |
| 1324 | Society & Culture |
| 1483 | Fiction |
| 1487 | History |
| 1488 | True Crime |
| 1489 | News |
| 1502 | Leisure |
| 1511 | Government |
| 1512 | Health & Fitness |
| 1533 | Science |
| 1544 | TV & Film |
| 1545 | Sports |

**Notes**:
- Useful for genre-based browsing/filtering
- Can be combined with `term` for filtered search

### 📊 Top Charts by Genre
Fetch top podcasts within a specific genre.
- **URL**: `https://rss.marketingtools.apple.com/api/v2/{country}/podcasts/top/{limit}/podcasts.json?genre={GENRE_ID}`
```bash
# Example: Top 10 News podcasts in US
curl "https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/10/podcasts.json?genre=1489"
```
**Notes**:
- Same response format as regular Top Charts
- Useful for genre-specific recommendations

---

## 5. Unavailable / Internal Apple APIs

The following capabilities are **NOT available** through public APIs:

| Feature | Status | Notes |
|---------|--------|-------|
| **Full Episode Archive** | ❌ Unavailable | Even with `limit=300`, API returns ~25 episodes. Cannot access complete podcast history. |
| **Play Count / Statistics** | ❌ Unavailable | Apple does not expose listening statistics |
| **User Reviews** | ❌ Unavailable | Podcast reviews are not accessible via API |
| **Subscriber Count** | ❌ Unavailable | Only "Top Subscriber" ranking is public, not actual numbers |
| **Apple Podcasts Connect** | 🔐 Requires Auth | For podcast publishers only, requires Apple Developer account |
| **Private RSS Feeds** | 🔐 Requires Auth | Paid/private podcasts require authentication |

**Workarounds**:
- For full episode history: Some podcasts provide complete archives in their RSS feed, or via their own website
- For reviews: Third-party services like Chartable or Podtrac may provide some analytics

