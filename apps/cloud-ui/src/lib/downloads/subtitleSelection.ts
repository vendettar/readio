export function selectPlaybackSubtitle<T extends { fileSub: { id: string } }>(
  readySubs: T[],
  overrideSubtitleId?: string
): T | undefined {
  if (readySubs.length === 0) return undefined
  if (!overrideSubtitleId) return readySubs[0]
  return readySubs.find((s) => s.fileSub.id === overrideSubtitleId) ?? readySubs[0]
}
