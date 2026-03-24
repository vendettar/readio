import type { ReactNode } from 'react'

import { Button, type ButtonProps, buttonVariants } from './button.js'
import { Input, type InputProps } from './input.js'
import { cn } from './lib/utils.js'

/* Layout Components */
export type AppShellProps = {
  children: ReactNode
  className?: string
}

export type AppHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export type PagePanelProps = {
  kicker?: string
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

export function AppShell({ children, className }: AppShellProps) {
  return <div className={cn('ui-shell', className)}>{children}</div>
}

export function AppHeader({ eyebrow, title, description, actions, className }: AppHeaderProps) {
  return (
    <header className={cn('ui-shell__header', className)}>
      <div className="ui-shell__header-copy">
        {eyebrow ? <p className="ui-shell__eyebrow">{eyebrow}</p> : null}
        <h1 className="ui-shell__title">{title}</h1>
        {description ? <p className="ui-shell__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-shell__actions">{actions}</div> : null}
    </header>
  )
}

export function PagePanel({ kicker, title, description, children, className }: PagePanelProps) {
  return (
    <section className={cn('ui-page-panel', className)}>
      {kicker ? <p className="ui-page-panel__kicker">{kicker}</p> : null}
      <h2 className="ui-page-panel__title">{title}</h2>
      {description ? <p className="ui-page-panel__description">{description}</p> : null}
      {children ? <div className="ui-page-panel__body">{children}</div> : null}
    </section>
  )
}

export { Button, Input, buttonVariants, cn }
export type { ButtonProps, InputProps }
