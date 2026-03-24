import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

interface SettingsSectionCardProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  children: ReactNode
  contentClassName?: string
}

export function SettingsSectionCard({
  title,
  description,
  icon,
  children,
  contentClassName,
}: SettingsSectionCardProps) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/95 shadow-sm transition-all duration-300 hover:border-border">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/50 via-transparent to-transparent" />
      <CardHeader className="pb-4">
        <div className={cn('flex items-start gap-2.5', icon ? 'items-center' : undefined)}>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          <CardTitle className="text-base sm:text-lg tracking-tight">{title}</CardTitle>
        </div>
        {description ? (
          <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className={cn('space-y-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
