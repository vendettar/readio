// src/libs/formatters.ts
// Pure formatting utilities - fully testable without dependencies

/**
 * Format file size in bytes to human-readable string (localized units)
 */
export function formatFileSize(bytes: number, locale?: string): string {
    if (!isFinite(bytes) || bytes <= 0) return '0 B';

    const thresholds = [
        { unit: 'byte', value: 1 },
        { unit: 'kilobyte', value: 1024 },
        { unit: 'megabyte', value: 1024 * 1024 },
        { unit: 'gigabyte', value: 1024 * 1024 * 1024 },
    ] as const;

    const picked = thresholds.reduce((acc, curr) => (bytes >= curr.value ? curr : acc), thresholds[0]);
    const formatter = new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: picked.unit,
        unitDisplay: 'narrow',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
    });

    const value = bytes / picked.value;
    return formatter.format(value);
}

/**
 * Format timestamp to human-readable date string
 */
export function formatTimestamp(timestamp: number, locale?: string): string {
    if (!isFinite(timestamp) || timestamp <= 0) return '';

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}


/**
 * Format time in seconds to M:SS format (for playback time labels)
 */
export function formatTimeLabel(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number, locale?: string): string {
    if (!isFinite(num)) return '0';
    return num.toLocaleString(locale);
}

/**
 * Format bytes (alias for formatFileSize for convenience)
 */
export const formatBytes = formatFileSize;

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 1): string {
    if (!isFinite(value)) return '0%';
    return value.toFixed(decimals) + '%';
}
/**
 * Format large numbers to compact string (e.g. 1500 -> "1.5K")
 */
export function formatCompactNumber(num: number): string {
    if (!isFinite(num) || num <= 0) return '0';
    if (num < 1000) return num.toString();
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
}
