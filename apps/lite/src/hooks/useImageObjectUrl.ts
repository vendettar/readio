import { useEffect, useState } from 'react'

/**
 * Hook to manage temporary image object URLs for Blobs (e.g. cover art).
 * Automatically revokes the URL when the blob changes or component unmounts.
 */
export function useImageObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }

    const newUrl = URL.createObjectURL(blob)
    setUrl(newUrl)

    return () => {
      URL.revokeObjectURL(newUrl)
    }
  }, [blob])

  return url
}
