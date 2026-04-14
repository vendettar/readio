import type { ASRCue } from '../asr/types'
import { DB } from '../dexieDb'

export async function loadSessionSubtitleCues(session: {
  subtitleId?: string | null
}): Promise<ASRCue[] | null> {
  if (!session.subtitleId) return null

  const subtitle = await DB.getSubtitle(session.subtitleId)
  return subtitle?.cues ?? null
}
