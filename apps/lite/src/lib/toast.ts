// src/lib/toast.ts

import { toast as sonnerToast } from 'sonner'
import { translate } from './i18nUtils'
import type { TranslationKey } from './translations'

type SonnerOptions = Parameters<typeof sonnerToast.success>[1]

export const toast = {
  success: (message: string, options?: SonnerOptions) => sonnerToast.success(message, options),
  successKey: (
    key: TranslationKey,
    variables?: Record<string, string | number>,
    options?: SonnerOptions
  ) => sonnerToast.success(translate(key, variables), options),

  error: (message: string, options?: SonnerOptions) => sonnerToast.error(message, options),
  errorKey: (
    key: TranslationKey,
    variables?: Record<string, string | number>,
    options?: SonnerOptions
  ) => sonnerToast.error(translate(key, variables), options),

  info: (message: string, options?: SonnerOptions) => sonnerToast.info(message, options),
  infoKey: (
    key: TranslationKey,
    variables?: Record<string, string | number>,
    options?: SonnerOptions
  ) => sonnerToast.info(translate(key, variables), options),

  warning: (message: string, options?: SonnerOptions) => sonnerToast.warning(message, options),
  warningKey: (
    key: TranslationKey,
    variables?: Record<string, string | number>,
    options?: SonnerOptions
  ) => sonnerToast.warning(translate(key, variables), options),

  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
  custom: sonnerToast.custom,
  loading: sonnerToast.loading,
}
