// src/lib/errorReporter.ts
// Optional error reporting infrastructure for production error tracking

import type { ErrorInfo } from 'react'

type ErrorReporter = (error: Error, info: ErrorInfo) => void

let errorReporter: ErrorReporter = () => {}

/**
 * Configure a custom error reporter for production error tracking.
 * Call this early in app initialization to set up error reporting.
 * @example
 * setErrorReporter((error, info) => {
 *   fetch('/api/errors', { method: 'POST', body: JSON.stringify({ error: error.message, stack: info.componentStack }) });
 * });
 */
export function setErrorReporter(reporter: ErrorReporter): void {
  errorReporter = reporter
}

/**
 * Report an error using the configured reporter.
 * No-op if no reporter is configured.
 */
export function reportError(error: Error, info: ErrorInfo): void {
  errorReporter(error, info)
}
