import { Check, X } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'

interface RenameInputProps {
  value: string
  setValue: (nextValue: string) => void
  errorKind: 'conflict' | 'empty' | null
  conflictMessage: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onConfirm: () => void
  onCancel: () => void
  onBlurConfirm: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  inputClassName?: string
  inputWrapperClassName?: string
  containerClassName?: string
  actionsClassName?: string
  confirmButtonClassName?: string
  cancelButtonClassName?: string
}

export function RenameInput({
  value,
  setValue,
  errorKind,
  conflictMessage,
  inputRef,
  onConfirm,
  onCancel,
  onBlurConfirm,
  onKeyDown,
  inputClassName,
  inputWrapperClassName,
  containerClassName,
  actionsClassName,
  confirmButtonClassName,
  cancelButtonClassName,
}: RenameInputProps) {
  const skipBlurConfirmRef = useRef(false)

  return (
    <div className={cn('flex items-center gap-2', containerClassName)}>
      <div className={cn('relative flex-1', inputWrapperClassName)}>
        <Popover open={errorKind === 'conflict'}>
          <PopoverAnchor asChild>
            <Input
              ref={inputRef}
              type="text"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => {
                if (skipBlurConfirmRef.current) {
                  skipBlurConfirmRef.current = false
                  return
                }
                onBlurConfirm()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'h-8 text-base font-bold',
                errorKind && 'border-destructive focus-visible:ring-destructive',
                inputClassName
              )}
            />
          </PopoverAnchor>
          <PopoverContent
            side="top"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="p-0 border-none bg-transparent shadow-none w-auto"
          >
            <div className="relative bg-destructive text-destructive-foreground text-xs px-2 py-1.5 rounded-md shadow-lg whitespace-nowrap flex items-center gap-1.5 font-bold">
              <X size={10} strokeWidth={3} />
              <span>{conflictMessage}</span>
              <div className="absolute -bottom-1 start-1/2 -translate-x-1/2 w-2 h-2 bg-destructive rotate-45" />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className={cn('flex items-center gap-2', actionsClassName)}>
        <Button
          size="icon"
          onMouseDown={(e) => {
            e.preventDefault()
            skipBlurConfirmRef.current = true
          }}
          onClick={(e) => {
            e.stopPropagation()
            onConfirm()
          }}
          className={cn('h-8 w-8', confirmButtonClassName)}
        >
          <Check size={14} />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onMouseDown={(e) => {
            e.preventDefault()
            skipBlurConfirmRef.current = true
          }}
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          className={cn('h-8 w-8', cancelButtonClassName)}
        >
          <X size={14} />
        </Button>
      </div>
    </div>
  )
}
