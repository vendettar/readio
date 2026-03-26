import { useCallback, useState } from 'react'
import type { Episode, Podcast } from '@/lib/discovery'
import { logError } from '@/lib/logger'
import { toast } from '@/lib/toast'

interface AddFavoritePayload {
  podcast: Podcast
  episode: Episode
  country?: string | null | undefined
}

interface UseEpisodeRowFavoriteActionArgs {
  favorited: boolean
  favoriteKey: string | null
  addFavorite: (
    podcast: Podcast,
    episode: Episode,
    signal?: AbortSignal,
    country?: string | null | undefined
  ) => Promise<unknown> | unknown
  removeFavorite: (key: string) => Promise<unknown> | unknown
  buildAddPayload: () => Promise<AddFavoritePayload>
  errorLogScope: string
}

interface UseEpisodeRowFavoriteActionResult {
  toggleFavorite: () => Promise<void>
  favorited: boolean
  isSaving: boolean
}

type FavoriteFailureType = 'network' | 'sourceNotFound' | 'generic'

function classifyFavoriteFailure(err: unknown): FavoriteFailureType {
  const maybeError = err as {
    message?: string
    code?: string
    status?: number
    name?: string
  }
  const message = (maybeError?.message ?? '').toLowerCase()
  const code = (maybeError?.code ?? '').toLowerCase()
  const status = maybeError?.status
  const name = (maybeError?.name ?? '').toLowerCase()

  if (
    status === 404 ||
    message.includes('podcast not found') ||
    message.includes('source not found')
  ) {
    return 'sourceNotFound'
  }

  if (
    code === 'network_error' ||
    code === 'err_network' ||
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500) ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('offline') ||
    message.includes('unavailable') ||
    name === 'networkerror'
  ) {
    return 'network'
  }

  return 'generic'
}

type FavoriteFailureToastKey =
  | 'toastFavoriteNetworkUnavailable'
  | 'toastFavoriteSourceNotFound'
  | 'toastAddFavoriteFailed'

function favoriteFailureToastKey(err: unknown): FavoriteFailureToastKey {
  const type = classifyFavoriteFailure(err)
  if (type === 'network') return 'toastFavoriteNetworkUnavailable'
  if (type === 'sourceNotFound') return 'toastFavoriteSourceNotFound'
  return 'toastAddFavoriteFailed'
}

type RemoveFavoriteFailureToastKey =
  | 'toastFavoriteNetworkUnavailable'
  | 'toastFavoriteSourceNotFound'
  | 'toastRemoveFavoriteFailed'

function removeFavoriteFailureToastKey(err: unknown): RemoveFavoriteFailureToastKey {
  const type = classifyFavoriteFailure(err)
  if (type === 'network') return 'toastFavoriteNetworkUnavailable'
  if (type === 'sourceNotFound') return 'toastFavoriteSourceNotFound'
  return 'toastRemoveFavoriteFailed'
}

export function useEpisodeRowFavoriteAction({
  favorited,
  favoriteKey,
  addFavorite,
  removeFavorite,
  buildAddPayload,
  errorLogScope,
}: UseEpisodeRowFavoriteActionArgs): UseEpisodeRowFavoriteActionResult {
  const [isSaving, setIsSaving] = useState(false)

  const toggleFavorite = useCallback(async () => {
    if (favorited) {
      if (!favoriteKey) return
      try {
        await removeFavorite(favoriteKey)
      } catch (err) {
        logError(`[${errorLogScope}] Failed to remove favorite:`, err)
        toast.errorKey(removeFavoriteFailureToastKey(err))
      }
      return
    }

    setIsSaving(true)
    try {
      const payload = await buildAddPayload()
      await addFavorite(payload.podcast, payload.episode, undefined, payload.country)
    } catch (err) {
      logError(`[${errorLogScope}] Failed to favorite:`, err)
      toast.errorKey(favoriteFailureToastKey(err))
    } finally {
      setIsSaving(false)
    }
  }, [addFavorite, buildAddPayload, errorLogScope, favoriteKey, favorited, removeFavorite])

  return { toggleFavorite, favorited, isSaving }
}
