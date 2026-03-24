// src/lib/logger.ts
// Structured logging utility with context support
// - debug/info/log/warn: Only log in development mode
// - error: Always log (including production) for incident tracking

const IS_DEV = import.meta.env.DEV

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  stack?: string
}

const MAX_LOGS = 100
const logBuffer: LogEntry[] = []

/**
 * Redacts potential PII using common patterns (paths, emails, etc.)
 */
function redact(str: string): string {
  if (!str) return str
  return (
    str
      // Redact Windows paths: C:\Users\name\... -> [RED-PATH]
      .replace(/[a-zA-Z]:\\Users\\[^\s\\]+/gi, '[RED-PATH]')
      // Redact Unix paths: /Users/name/... or /home/name/... -> [RED-PATH]
      .replace(/\/(Users|home)\/[^\s/]+/gi, '[RED-PATH]')
      // Redact potential emails
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[RED-EMAIL]')
      // Redact what looks like filenames with extensions if they are inside a path context
      .replace(/\/[^\s/]+\.(mp3|srt|vtt|wav|m4a|png|jpg|jpeg)/gi, '/[RED-FILE]')
  )
}

function addToBuffer(level: LogEntry['level'], args: unknown[]) {
  const message = args
    .map((arg) => {
      if (arg instanceof Error) return arg.message
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join(' ')

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: redact(message),
  }

  // Extract stack trace if an Error object is present
  const errorObj = args.find((arg) => arg instanceof Error) as Error | undefined
  if (errorObj?.stack) {
    entry.stack = redact(errorObj.stack)
  }

  logBuffer.push(entry)
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift()
  }
}

/** Structured log context for debugging */
export interface LogContext {
  /** Component or module name */
  component?: string
  /** User action that triggered the log */
  action?: string
  /** Additional data for debugging */
  [key: string]: unknown
}

export const logger = {
  /** Debug level - development only, for detailed tracing */
  debug: (...args: unknown[]) => {
    addToBuffer('debug', args)
    if (IS_DEV) console.debug(...args)
  },

  /** Info level - development only, for general information */
  info: (...args: unknown[]) => {
    addToBuffer('info', args)
    if (IS_DEV) console.info(...args)
  },

  /** Log level - development only, general purpose */
  log: (...args: unknown[]) => {
    addToBuffer('info', args) // Map 'log' to 'info' in buffer
    if (IS_DEV) console.log(...args)
  },

  /** Warn level - development only, for potential issues */
  warn: (...args: unknown[]) => {
    addToBuffer('warn', args)
    if (IS_DEV) console.warn(...args)
  },

  /** Error level - ALWAYS logs (even in production) for incident tracking */
  error: (...args: unknown[]) => {
    addToBuffer('error', args)
    console.error(...args)
  },
}

/** Returns a copy of the current log buffer */
export const getLogs = () => [...logBuffer]

// Named exports for convenience
export const { log, warn, error, debug, info } = logger
export const logError = error // Alias for consistency
