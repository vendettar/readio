import { z } from 'zod'

// Canonical content routes are path-only. Query params on these routes are intentionally ignored.
export const libraryDetailSearchSchema = z.object({})
export const podcastShowSearchSchema = z.object({})

export type LibraryDetailSearch = z.infer<typeof libraryDetailSearchSchema>
export type PodcastShowSearch = z.infer<typeof podcastShowSearchSchema>
