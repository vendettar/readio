// src/components/Toast/ToastContainer.tsx
// Radix UI Toast implementation

import * as Toast from '@radix-ui/react-toast'
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { createToastId } from '../../libs/id'
import { toast } from '../../libs/toast'
import type { TranslationKey } from '../../libs/translations'

interface ToastItem {
  id: string
  message?: string
  messageKey?: TranslationKey
  type: 'error' | 'success' | 'info'
  duration: number
}

export function ToastContainer() {
  const { t: translate } = useI18n()
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    return toast.subscribe(({ message, messageKey, type, duration = 3000 }) => {
      const id = createToastId()
      setToasts((prev) => [...prev, { id, message, messageKey, type, duration }])
    })
  }, [])

  // Get background color class based on toast type
  const getTypeStyles = (type: ToastItem['type']) => {
    switch (type) {
      case 'error':
        return 'bg-destructive text-destructive-foreground border-destructive/20'
      case 'success':
        return 'bg-primary text-primary-foreground border-primary/20'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((toastItem) => (
        <Toast.Root
          key={toastItem.id}
          duration={toastItem.duration}
          onOpenChange={(open) => {
            if (!open) removeToast(toastItem.id)
          }}
          className={`
rounded-lg border px-4 py-3 shadow-lg
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[swipe=end]:animate-out data-[state=closed]:fade-out-80
data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full
data-[state=closed]:slide-out-to-right-full
                        ${getTypeStyles(toastItem.type)}
`}
        >
          <Toast.Description className="text-sm font-medium">
            {toastItem.messageKey ? translate(toastItem.messageKey) : toastItem.message || ''}
          </Toast.Description>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-4 sm:right-4 sm:top-auto sm:flex-col md:max-w-md" />
    </Toast.Provider>
  )
}
