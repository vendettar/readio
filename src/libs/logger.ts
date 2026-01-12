// src/libs/logger.ts
// Structured logging utility with context support
// - debug/info/log/warn: Only log in development mode
// - error: Always log (including production) for incident tracking

const IS_DEV = import.meta.env.DEV;

/** Structured log context for debugging */
export interface LogContext {
    /** Component or module name */
    component?: string;
    /** User action that triggered the log */
    action?: string;
    /** Additional data for debugging */
    [key: string]: unknown;
}

export const logger = {
    /** Debug level - development only, for detailed tracing */
    debug: (...args: unknown[]) => {
        if (IS_DEV) console.debug(...args);
    },

    /** Info level - development only, for general information */
    info: (...args: unknown[]) => {
        if (IS_DEV) console.info(...args);
    },

    /** Log level - development only, general purpose */
    log: (...args: unknown[]) => {
        if (IS_DEV) console.log(...args);
    },

    /** Warn level - development only, for potential issues */
    warn: (...args: unknown[]) => {
        if (IS_DEV) console.warn(...args);
    },

    /** Error level - ALWAYS logs (even in production) for incident tracking */
    error: (...args: unknown[]) => {
        console.error(...args);
    },
};

// Named exports for convenience
export const { log, warn, error, debug, info } = logger;
export const logError = error; // Alias for consistency
