import type { ASRCue } from '../asr/types'
import { PlaybackRepository } from '../repositories/PlaybackRepository'

export async function loadSessionSubtitleCues(session: {
  subtitleId?: string | null
}): Promise<ASRCue[] | null> {
  if (!session.subtitleId) return null

  const subtitle = await PlaybackRepository.getSubtitle(session.subtitleId)
  return subtitle?.cues ?? null
}
