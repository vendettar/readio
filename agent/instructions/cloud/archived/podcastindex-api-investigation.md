# Comprehensive Investigation: PodcastIndex API Capabilities for Readio

This document provides a deep-dive analysis of the PodcastIndex (PI) API based on the `podcastindex_api.json` specification. It identifies opportunities for content enrichment, UX improvements, and feature expansion beyond the current iTunes-based discovery implementation.

---

## Readio Integration Addendum (2026-04-09)

The original version of this document was a capability scan. Since then, Readio has completed a focused investigation around truncated-feed repair and supplementary episode hydration. That investigation materially changes the recommended integration strategy.

### 1. What Readio actually has today
For PodcastIndex-compatible show identities, Readio currently has:

- **Apple/iTunes podcast id**: available today
  - preferred field: `providerPodcastId`
  - fallback field in some entrypoints: route/show `id`
- **PodcastIndex feed id**: not currently stored
- **podcast GUID / `podcastguid`**: not currently stored

Practical implication:
- `episodes/byitunesid` is the only PI episode-history endpoint Readio can use immediately without an additional identity-resolution phase.

### 2. What Readio must not do
Readio must **not** use the current RSS `feedUrl` as the PodcastIndex history lookup key for truncated-feed repair.

This is not a theoretical concern. Real feeds have already shown:
- the current RSS `feedUrl` can itself be the truncated identity
- `episodes/byfeedurl` can therefore return empty or incomplete history
- PodcastIndex may still contain the complete catalog under another canonical feed record

Practical implication:
- for truncated-feed repair, `episodes/byfeedurl` is the wrong phase-1 strategy
- current RSS `feedUrl` should not be treated as the authoritative PI history key

### 3. Recommended Phase 1 decision for Readio
For the supplementary hydration path introduced by the Cloud discovery cutover work:

- keep RSS as the primary source of truth
- when RSS looks severely truncated, call PodcastIndex **`/api/1.0/episodes/byitunesid`**
- derive the lookup id from the stable Apple/iTunes podcast id already present on the show record
- keep PodcastIndex credentials server-side only

In UI consumers, the current practical rule is:
- prefer `providerPodcastId`
- fall back to route/show `id` when that route is known to already be the Apple/iTunes podcast id

### 4. Deferred Phase 2 follow-up
If `episodes/byitunesid` still proves insufficient for some catalogs, the next step is not to fall back to truncated `feedUrl`.

The correct follow-up is:
1. resolve the canonical PI podcast/feed record from a trusted stable identity
2. capture PI-owned identifiers such as:
   - `feedId`
   - `podcastguid`
3. then consider:
   - `episodes/byfeedid`
   - `episodes/bypodcastguid`

That is a separate integration phase, not part of the current phase-1 cutover.

### 5. Current Repository Drift / Status Note

This addendum records the **recommended** Readio identity strategy for PodcastIndex supplementary history lookup.

However, the current repository implementation may not yet fully match that recommendation.

Recommended investigation conclusion:
- for truncated-feed repair, phase 1 should prefer PodcastIndex `episodes/byitunesid`
- Readio should avoid using the current RSS `feedUrl` as the primary PodcastIndex history key for this repair path

Current repository reality:
- the active cutover work may still use a narrower `byfeedurl`-style hydration route in the current staged implementation
- that implementation choice should be treated as a pragmatic intermediate state, not proof that `feedUrl` is the preferred long-term PI history identity

Interpretation rule for future workers/reviewers:
- this document is an investigation and architecture recommendation record
- it is **not** by itself proof that the current codebase has already adopted `episodes/byitunesid`
- always compare the active implementation/instruction (`Instruction 025` and its staged code) against this document before assuming the recommended identity strategy is already in production

Practical implication:
- if current code uses `feedUrl` for PodcastIndex supplementary hydration, treat that as an implementation drift or interim compromise unless a newer decision record explicitly supersedes this investigation
- the stronger identity recommendation remains:
  1. prefer stable Apple/iTunes podcast identity for phase 1 lookup
  2. avoid treating the current RSS `feedUrl` as the authoritative PI history key for truncated-feed repair
  3. follow up with canonical PI identity capture (`feedId`, `podcastguid`) before deeper PI migration

---

## 1. Content Discovery & Home Page Enrichment (Explore Page)

### 🌟 High-Entropy Discovery: `/episodes/random`
*   **Capability**: Returns a random selection of episodes with highly detailed metadata.
*   **Rich Data**: Includes `description`, `image` (episode-specific), `feedTitle`, `categories`, and `enclosureUrl`.
*   **UX Opportunity**: Replace the static "Editor's Picks" or "Top Episodes" with a "Daily Discovery" or "Fresh for You" section.
*   **Why it's better than Apple**: Unlike Apple's Top Episodes (which often lack descriptions/images in the list view), this provides everything needed to render a beautiful, informative card without a secondary API call.

### 🔥 Dynamic Trending: `/podcasts/trending`
*   **Capability**: Uses a momentum-based algorithm to find shows gaining popularity.
*   **Parameters**: Supports `lang`, `cat` (category), and `since` (timeframe).
*   **UX Opportunity**: Create "Category-Specific Trending" (e.g., "Trending in Tech") or "Regional Trends" (e.g., "Trending in China").
*   **Why it's better than Apple**: Apple's charts are heavily weighted toward established giants. PI's trending logic often surfaces rising independent shows.

### 🎙️ Audio Snippets: `/recent/soundbites`
*   **Capability**: Returns short, curated audio clips (soundbites) defined in the RSS.
*   **Data**: Includes `startTime`, `duration`, and the parent episode info.
*   **UX Opportunity**: Add a "Quick Listen" slider on the home page. Users can hear a 30-second teaser of a podcast before committing to the full episode.
*   **Readio Synergy**: Perfectly matches Readio's "focused consumption" model.

---

## 2. Deep Metadata & Search Enrichment

### 👤 Person-Based Search: `/search/byperson`
*   **Capability**: Search for episodes where a specific person (host, guest, or subject) is mentioned.
*   **UX Opportunity**: Add a "Guests & Hosts" search mode. If a user likes a specific guest (e.g., "Sam Altman"), they can find all interviews across different podcasts.
*   **Why Apple can't do this**: Apple's search is limited to title/author/description text matches. PI uses explicit `<podcast:person>` tags.

### 🏷️ Category-Aware Lists: `/podcasts/bytag`
*   **Capability**: Specifically finds feeds supporting modern Podcasting 2.0 tags like `podcast:value`.
*   **Utility**: Could be used to create a "Support Creators" section for podcasts that allow Lightning/V4V payments.

### 📻 Native Music Podcasts: `/search/music/byterm`
*   **Capability**: Filtered search specifically for `medium="music"`.
*   **Utility**: If Readio wants to expand into music podcasts/DJ sets, this is a dedicated high-quality feed.

---

## 3. Operations & Maintenance (Backend Utility)

### 🔄 Change Detection: `/hub/pubnotify`
*   **Capability**: WebSub-like notification to tell the index a feed has changed.
*   **Utility**: If Readio ever hosts its own feeds or wants to help creators update their listings faster, this is the tool.

### 📉 Dead Feed Detection: `/podcasts/dead`
*   **Capability**: List of feeds marked as inactive/removed.
*   **Utility**: Background cleanup task for the `cloud-api` to prune broken links or inactive shows from the "Explore" caches.

### 📊 Index Health: `/stats/current`
*   **Capability**: Real-time stats on the number of feeds, episodes, and apps using the index.
*   **Utility**: Could be used in an "About" or "Transparency" page to show the scale of the open ecosystem Readio supports.

---

## 4. Apple Replacement APIs (Capability Note, Not Current Readio Plan)

### 🍏 Apple Replacement APIs: `/search` & `/lookup`
*   **Capability**: PodcastIndex provides a drop-in replacement for Apple's `itunes.apple.com/search` and `itunes.apple.com/lookup`.
*   **Major Advantage**: **NO API KEY needed** for these two endpoints! They format the PodcastIndex database results in the exact same JSON structure as Apple's API.
*   **Readio Note**: This remains an interesting future migration path, but it is **not** the current phase-1 solution for truncated-feed supplementary hydration. The active Readio phase-1 strategy is `episodes/byitunesid`, not a blanket Apple replacement cutover.

---

## 5. Advanced / Future-Proof Features

### 🔴 Livestream Support: `/episodes/live`
*   **Capability**: Returns episodes where the feed has a `<podcast:liveItem>` tag indicating an actively running or upcoming live broadcast.
*   **UX Opportunity**: Add a "Live Now" banner for users to jump into live episodes/streams directly from the Explore page.

### 📦 Batch Operations: `/podcasts/batch/byguid` & `/episodes/batch/byguid`
*   **Capability**: Fetch multiple podcasts or episodes in a single network request using arrays of IDs/GUIDs.
*   **Utility**: Highly efficient for loading the user's "Favorites/Subscriptions" list globally or updating history metadata in one go, rather than individual lookups.

---

## 6. Why Some APIs are Deprioritized (Rationale)

| API Path | Reason for Non-Use in Readio | Potential Future Case |
| :--- | :--- | :--- |
| `/add/byfeedurl` | Requires write-permissions and API keys. We are a consumer, not a directory manager. | If we allow users to "Submit a Missing Podcast". |
| `/recent/newfeeds` | Returns *every* new feed added. Too much noise for an end-user UI. | Backend tool for discovering new shows to feature. |
| `/value/*` | Deals with Lightning/Sats payment configuration. | Only useful if we implement a "Tipping" or "Wallet" feature. |
| `/recent/data` | Bulk data export format. | Large-scale data migration or global search index rebuilding. |

---

## 7. Summary: The "Readio Master Plan" for Explore

1.  **Current Readio Phase 1 (Implemented/Actionable)**: Use PodcastIndex `episodes/byitunesid` for supplementary truncated-feed repair while keeping RSS primary and keeping PI credentials server-side.
2.  **Phase 2 (Identity Resolution)**: Resolve and persist canonical PI identities (`feedId`, `podcastguid`) before considering `episodes/byfeedid` or `episodes/bypodcastguid`.
3.  **Phase 3 (Deep PI Integration)**: Replace `Apple Top Episodes` and `Top Shows` with PI's `/episodes/random` and `/podcasts/trending` for richer metadata and bias-free discovery.
4.  **Phase 4 (Innovative UX)**: Introduce a `Soundbite Slider` for quick listening (`/recent/soundbites`) and a `Live Now` banner (`/episodes/live`).
5.  **Phase 5 (Advanced Search)**: Enhance Search with a `Guest/Person` filter utilizing `<podcast:person>` tags via `/search/byperson`.
6.  **Phase 6 (Performance Optimization)**: Utilize batch fetching (`/podcasts/batch/byguid`) for syncing Subscriptions and History instead of single loops.
