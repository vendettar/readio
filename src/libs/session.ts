// src/libs/session.ts
// Session ID utilities - shared across hooks and handlers

import { createSessionId } from './id';

/**
 * Generate a unique session ID
 * Format: session_{timestamp}_{random}
 */
export function generateSessionId(): string {
    return createSessionId();
}
