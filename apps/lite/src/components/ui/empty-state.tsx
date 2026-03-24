import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: ElementType
  title: string
  description?: string
  action: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-20 px-8 animate-in fade-in slide-in-from-bottom-4 duration-500',
        className
      )}
    >
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-8 group transition-all duration-300 hover:scale-110">
        <Icon className="w-8 h-8 text-muted-foreground opacity-50 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      <h3 className="text-2xl font-bold text-foreground tracking-tight mb-3">{title}</h3>

      {description && (
        <p className="text-lg text-muted-foreground max-w-sm mx-auto mb-10 leading-relaxed font-medium">
          {description}
        </p>
      )}

      <div className="flex items-center justify-center">{action}</div>
    </div>
  )
}
