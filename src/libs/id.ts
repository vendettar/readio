/**
 * Generate a unique ID using crypto.randomUUID() with fallback
 * @returns A unique identifier string
 */
export function createId(): string {
    // Use crypto.randomUUID() if available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // Fallback: use secure random bytes if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${Date.now()}-${hex}`;
    }

    // Last resort: monotonic counter (no Math.random)
    return `${Date.now()}-${nextCounterValue()}`;
}

/**
 * Generate a short ID (7 characters) for UI elements like toasts
 * @returns A short unique identifier string
 */
export function createShortId(): string {
    // Use a portion of UUID for short IDs
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().slice(0, 8);
    }

    // Fallback: secure random bytes if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(6);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return hex.slice(0, 8);
    }

    // Last resort: monotonic counter (no Math.random)
    return nextCounterValue().toString(36).slice(0, 8).padStart(8, '0');
}

/**
 * Generate a session ID with timestamp prefix
 * @returns A session identifier string
 */
export function createSessionId(): string {
    return `session_${Date.now()}_${createShortId()}`;
}

/**
 * Generate a toast ID (alias for createShortId)
 * @returns A short unique identifier for toast notifications
 */
export const createToastId = createShortId;

let idCounter = 0;
function nextCounterValue(): number {
    idCounter = (idCounter + 1) % 1_000_000_000;
    return idCounter;
}
