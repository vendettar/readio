# Instruction 023: Podcast Episodes List Hybrid Hydration

## 1. Objective
Resolve the issue where some high-profile podcast RSS feeds (e.g., The New York Times' "Modern Love") return only a very small number of recent episodes (e.g., 3 items), preventing users from accessing historical content.

## 2. Problem Analysis
- **RSS Truncation**: Large publishers often truncate their public RSS feeds to save bandwidth or force users into proprietary apps.
- **Data Discrepancy**: The Apple Podcasts Directory often maintains a much larger historical cache of episode metadata than the raw RSS feed.
- **UI Degradation**: Users see a "See All" count of 500+ items (from Apple metadata) but can only actually scroll through 3 items (from the RSS feed).

## 3. Implementation Plan

### Phase 1: Frontend "Hybrid Hydration" (Fast Fix)
Instead of relying solely on the RSS feed, the `PodcastShowPage` will intelligently detect truncation and fetch missing history.

#### 1.1 Detection Logic in `PodcastShowPage.tsx`
- Trigger hydration ONLY if:
    1. `rssCount < 10` (Absolute scarcity)
    2. **AND** `rssCount / appleTotal < 0.8` (Significant truncation ratio)
- Where `rssCount` is `feed.episodes.length` and `appleTotal` is `podcast.trackCount`.

#### 1.2 Supplementary Fetch & Merge
- Call the `lookup/podcast-episodes` endpoint using the `providerPodcastId`.
- **Merging Strategy (RSS First)**:
    1. Keep all episodes from the RSS feed (better metadata/HTML).
    2. Add missing episodes from the Apple API by checking for existing `audioUrl`.
    3. Re-sort the final combined list by `pubDate` descending.
- **No UI Changes**: The process must be silent and automatic without adding "Load More" buttons.

### Phase 2: Backend Enhancement (Robust Fix)
Enhance the `cloud-api` to handle this logic server-side, reducing client-side complexity and data usage.

#### 2.1 "Smart Feed" Logic in `discovery_feed.go`
- Modify `handleFeed` to optionally accept a `providerId`.
- Internal logic:
    1. Fetch and parse the raw RSS XML.
    2. If parsed episodes count is suspiciously low:
        - Call the internal `apple-lookup` logic for episodes.
        - Merge and deduplicate the data.
    3. Return the enriched JSON payload.

### Phase 3: UI Polish
- Ensure the "See All" button correctly navigates to a dedicated episodes list page that supports full infinite scrolling or pagination through the Apple API.

## 4. Acceptance Criteria
- [ ] For "Modern Love" (NYT), the episodes list shows more than just the latest 3 items.
- [ ] No duplicate episodes appear in the list.
- [ ] The "Latest Episode" button still correctly plays the most recent item from either source.
- [ ] Performance: The hybrid merge does not cause noticeable lag on the page load.
