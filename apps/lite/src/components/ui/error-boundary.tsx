import { RefreshCcw } from 'lucide-react'
import React, { type ErrorInfo, type ReactNode } from 'react'
import { translate } from '../../lib/i18nUtils'
import { logError } from '../../lib/logger'
import { cn } from '../../lib/utils'
import { Button } from './button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  className?: string
  /**
   * Optional name for the component to assist in logging
   */
  componentName?: string
  /**
   * Optional callback to report error to an external service
   */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
}

/**
 * Granular Error Boundary to isolate component-level crashes.
 * Renders a localized placeholder with a retry button.
 */
export class ComponentErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError(
      `[ErrorBoundary] ${this.props.componentName || 'Component'} crashed:`,
      error,
      errorInfo
    )
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center p-4 border border-dashed border-border rounded-lg bg-muted/30 text-center min-h-error-boundary',
            this.props.className
          )}
        >
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <span className="text-sm font-medium">{translate('errorBoundaryTitle')}</span>
          </div>
          <p className="text-xs text-muted-foreground/80 mb-3 max-w-60">
            {translate('errorBoundaryDescription')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="h-8 gap-1.5 text-xs font-medium bg-background"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            {translate('errorBoundaryRetry')}
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
