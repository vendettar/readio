import { normalizePodcastAudioUrl } from '../networking/urlUtils'
import { generateSlug } from '../slugUtils'
import { getStableEpisodeIdentifier } from './editorPicks'
import type { DiscoveryPodcast, Episode } from './providers/types'

function getComparableUrlStem(value: string | undefined): string {
  if (!value) return ''

  try {
    const normalized = normalizePodcastAudioUrl(value) || value
    const url = new URL(normalized)
    return `${url.origin}${url.pathname}`.toLowerCase()
  } catch {
    return value.split('?')[0]?.toLowerCase() ?? ''
  }
}

export function matchTopEpisodeToPodcastIndexEpisode(
  episode: Pick<DiscoveryPodcast, 'title' | 'audioUrl' | 'episodeGuid'>,
  candidates: Episode[]
): Episode | undefined {
  const targetEpisodeGuid = episode.episodeGuid?.trim()
  if (targetEpisodeGuid) {
    const exactGuidMatch = candidates.find((candidate) => {
      const stableIdentifier = getStableEpisodeIdentifier(candidate)
      return (
        stableIdentifier === targetEpisodeGuid ||
        candidate.id === targetEpisodeGuid ||
        candidate.episodeGuid === targetEpisodeGuid
      )
    })

    if (exactGuidMatch) {
      return exactGuidMatch
    }
  }

  const normalizedTitle = generateSlug(episode.title)
  const sourceUrlStem = getComparableUrlStem(episode.audioUrl)

  let audioMatch: Episode | undefined

  for (const candidate of candidates) {
    if (generateSlug(candidate.title) === normalizedTitle) {
      return candidate
    }

    if (!audioMatch) {
      const candidateAudioStem = getComparableUrlStem(candidate.audioUrl)
      if (sourceUrlStem && candidateAudioStem && sourceUrlStem === candidateAudioStem) {
        audioMatch = candidate
      }
    }
  }

  return audioMatch
}
