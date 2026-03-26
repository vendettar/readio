import { useCallback, useRef, useState } from 'react'

type RenameErrorKind = 'conflict' | 'empty' | null

interface UseInlineRenameParams {
  originalName: string
  existingNames: string[]
  entityKind: 'track' | 'folder'
  onCommit: (nextName: string) => void
}

interface UseInlineRenameResult {
  isRenaming: boolean
  value: string
  errorKind: RenameErrorKind
  isConflictOpen: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  startRename: () => void
  confirmRename: (isBlur?: boolean) => void
  cancelRename: () => void
  setValue: (nextValue: string) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
}

export function useInlineRename({
  originalName,
  existingNames,
  entityKind: _entityKind,
  onCommit,
}: UseInlineRenameParams): UseInlineRenameResult {
  const [isRenaming, setIsRenaming] = useState(false)
  const [value, setValueState] = useState(originalName)
  const [errorKind, setErrorKind] = useState<RenameErrorKind>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const setValue = useCallback((nextValue: string) => {
    setValueState(nextValue)
    setErrorKind(null)
  }, [])

  const startRename = useCallback(() => {
    setValueState(originalName)
    setErrorKind(null)
    setIsRenaming(true)
  }, [originalName])

  const cancelRename = useCallback(() => {
    setIsRenaming(false)
    setValueState(originalName)
    setErrorKind(null)
  }, [originalName])

  const confirmRename = useCallback(
    (isBlur = false) => {
      const trimmed = value.trim()

      if (!trimmed) {
        if (isBlur) {
          cancelRename()
        } else {
          setErrorKind('empty')
          inputRef.current?.focus()
        }
        return
      }

      if (trimmed === originalName.trim()) {
        setIsRenaming(false)
        setErrorKind(null)
        return
      }

      const trimmedLower = trimmed.toLowerCase()
      const originalLower = originalName.trim().toLowerCase()
      const isConflict = existingNames.some((name) => {
        const candidateLower = name.trim().toLowerCase()
        return candidateLower === trimmedLower && candidateLower !== originalLower
      })

      if (isConflict) {
        setErrorKind('conflict')
        inputRef.current?.focus()
        return
      }

      onCommit(trimmed)
      setIsRenaming(false)
      setErrorKind(null)
    },
    [cancelRename, existingNames, onCommit, originalName, value]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmRename()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelRename()
      }
    },
    [cancelRename, confirmRename]
  )

  return {
    isRenaming,
    value,
    errorKind,
    isConflictOpen: errorKind === 'conflict',
    inputRef,
    startRename,
    confirmRename,
    cancelRename,
    setValue,
    handleKeyDown,
  }
}
