import {
  buildDownloadJobOptionsFromEpisodeProps,
  downloadEpisode,
  type EpisodeDownloadProps,
} from './downloadService'

interface ExecuteEpisodeDownloadInput {
  episode: EpisodeDownloadProps
  downloadStatus: 'idle' | 'downloading' | 'downloaded' | 'failed'
  refresh: () => void
}

export function executeEpisodeDownload({
  episode,
  downloadStatus,
  refresh,
}: ExecuteEpisodeDownloadInput): void {
  if (downloadStatus === 'downloading' || downloadStatus === 'downloaded') return

  const downloadOptions = buildDownloadJobOptionsFromEpisodeProps(episode)
  if (!downloadOptions) return

  void downloadEpisode(downloadOptions).then(() => {
    refresh()
  })
}
