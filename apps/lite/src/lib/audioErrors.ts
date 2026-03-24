import type { TFunction } from 'i18next'

const MEDIA_ERROR_ABORTED = typeof MediaError === 'undefined' ? 1 : MediaError.MEDIA_ERR_ABORTED
const MEDIA_ERROR_NETWORK = typeof MediaError === 'undefined' ? 2 : MediaError.MEDIA_ERR_NETWORK
const MEDIA_ERROR_DECODE = typeof MediaError === 'undefined' ? 3 : MediaError.MEDIA_ERR_DECODE
const MEDIA_ERROR_SRC_NOT_SUPPORTED =
  typeof MediaError === 'undefined' ? 4 : MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED

export function mapAudioErrorMessage(
  t: TFunction,
  error: Pick<MediaError, 'code' | 'message'> | null | undefined
): string {
  if (!error) {
    return t('player.errorGeneric', { message: 'Audio element error' })
  }

  switch (error.code) {
    case MEDIA_ERROR_ABORTED:
      return t('player.errorAborted')
    case MEDIA_ERROR_NETWORK:
      return t('player.errorNetwork')
    case MEDIA_ERROR_DECODE:
      return t('player.errorDecode')
    case MEDIA_ERROR_SRC_NOT_SUPPORTED:
      return t('player.errorSrc')
    default:
      return t('player.errorGeneric', { message: error.message || 'Unknown error' })
  }
}
