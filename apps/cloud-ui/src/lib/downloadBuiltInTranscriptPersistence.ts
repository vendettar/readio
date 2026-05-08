import { warn } from './logger'
import { getValidTranscriptUrl, loadRemoteTranscriptWithCache } from './remoteTranscript'
import { DownloadsRepository } from './repositories/DownloadsRepository'

export async function persistBuiltInTranscriptForTrack(
  trackId: string,
  options: { transcriptUrl?: string; episodeTitle: string }
): Promise<void> {
  const transcriptUrl = getValidTranscriptUrl(options.transcriptUrl)
  if (!transcriptUrl) return

  try {
    const loaded = await loadRemoteTranscriptWithCache(transcriptUrl)
    if (!loaded.ok || loaded.cues.length === 0) return

    const { subtitleFilename, subtitleName } = deriveBuiltInTranscriptMetadata(
      transcriptUrl,
      options.episodeTitle
    )

    await DownloadsRepository.upsertBuiltInSubtitleVersion({
      trackId,
      cues: loaded.cues,
      subtitleName,
      subtitleFilename,
      transcriptUrl,
      setActive: true,
    })
  } catch (err) {
    warn('[download] Failed to persist built-in transcript for download', {
      trackId,
      transcriptUrl,
      err,
    })
  }
}

function deriveBuiltInTranscriptMetadata(
  transcriptUrl: string,
  episodeTitle: string
): { subtitleFilename: string; subtitleName: string } {
  const baseTitle = episodeTitle.trim() || 'episode'
  const safeTitle = baseTitle.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim() || 'episode'
  const extension = transcriptUrl.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt'

  return {
    subtitleName: `${baseTitle} transcript`,
    subtitleFilename: `${safeTitle.slice(0, 100)}.transcript.${extension}`,
  }
}
