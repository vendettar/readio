type Listener = () => void

const listeners = new Set<Listener>()

export function subscribeToDownloads(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitDownloadChange(): void {
  for (const listener of listeners) {
    listener()
  }
}
