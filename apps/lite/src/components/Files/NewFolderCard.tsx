import { Check, Plus, X } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface NewFolderCardProps {
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function NewFolderCard({
  value,
  onChange,
  onConfirm,
  onCancel,
  inputRef,
  containerRef,
}: NewFolderCardProps) {
  const { t } = useTranslation()

  return (
    <div
      ref={containerRef}
      className="group flex flex-col items-center justify-center p-6 rounded-xl border border-primary bg-primary/5 shadow-sm transition-all duration-200 relative"
    >
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 bg-primary/20 text-primary">
        <Plus size={24} />
      </div>
      <Input
        ref={inputRef}
        type="text"
        placeholder={t('filesFolderName')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm()
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={onConfirm}
        className="text-center"
      />
      <div className="flex items-center gap-2 mt-3">
        <Button
          size="icon"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onConfirm}
          className="h-8 w-8"
        >
          <Check size={14} />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          className="h-8 w-8"
        >
          <X size={14} />
        </Button>
      </div>
    </div>
  )
}
