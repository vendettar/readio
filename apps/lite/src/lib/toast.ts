// src/lib/toast.ts

import type { TranslationKey } from './translations'

type ToastType = 'error' | 'success' | 'info'

export interface ToastEvent {
  type: ToastType
  duration?: number
  message?: string
  messageKey?: TranslationKey
}

type ToastListener = (event: ToastEvent) => void

class ToastManager {
  private listeners: Set<ToastListener> = new Set()

  subscribe(listener: ToastListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  error(message: string, duration = 3000) {
    this.notify({ message, type: 'error', duration })
  }

  errorKey(messageKey: TranslationKey, duration = 3000) {
    this.notify({ messageKey, type: 'error', duration })
  }

  success(message: string, duration = 2000) {
    this.notify({ message, type: 'success', duration })
  }

  successKey(messageKey: TranslationKey, duration = 2000) {
    this.notify({ messageKey, type: 'success', duration })
  }

  info(message: string, duration = 2500) {
    this.notify({ message, type: 'info', duration })
  }

  infoKey(messageKey: TranslationKey, duration = 2500) {
    this.notify({ messageKey, type: 'info', duration })
  }

  private notify(event: ToastEvent) {
    this.listeners.forEach((listener) => {
      listener(event)
    })
  }
}

export const toast = new ToastManager()
