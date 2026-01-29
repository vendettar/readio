# 021b - Structured File Size Formatter [COMPLETED]

## Context

Instruction 021 introduced `CountUp` animation for storage usage display in `SettingsPage.tsx`. The current implementation parses the formatted string using `split(' ')`:

```tsx
const sizeStr = formatBytes(storageInfo?.indexedDB.totalSize ?? 0)
const [value, unit] = sizeStr.split(' ')
const numericValue = parseFloat(value) || 0
```

**Problem**: `formatFileSize` uses `Intl.NumberFormat` which produces locale-dependent output:

| Locale | Output | Issue |
|--------|--------|-------|
| `en-US` | `1.5 MB` | ✅ Works |
| `zh-CN` | `1.5MB` | ❌ No space, `unit` is `undefined` |
| Some locales | `1.5 MB` (U+00A0) | ❌ Non-breaking space, split fails |

This causes the `CountUp` animation to fail silently for non-English locales.

---

## Goal

Refactor `formatFileSize` to provide a **structured return type** that separates numeric value and unit, eliminating string parsing at call sites.

---

## Task

### Step 1: Add Structured Return Type

**File**: `apps/lite/src/lib/formatters.ts`

Add new interface and function:

```typescript
/**
 * Structured file size representation
 */
export interface FormattedFileSize {
  /** Numeric value (e.g., 1.5) */
  value: number
  /** Unit string (e.g., "MB", "GB") */
  unit: string
  /** Full formatted string for display (e.g., "1.5 MB") - locale-aware */
  formatted: string
}

/**
 * Format bytes to structured file size with separated value and unit.
 * Use this when you need programmatic access to the numeric value.
 */
export function formatFileSizeStructured(bytes: number, locale?: string): FormattedFileSize {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { value: 0, unit: 'B', formatted: '0 B' }
  }

  const thresholds = [
    { unit: 'B', intlUnit: 'byte', value: 1 },
    { unit: 'KB', intlUnit: 'kilobyte', value: 1024 },
    { unit: 'MB', intlUnit: 'megabyte', value: 1024 * 1024 },
    { unit: 'GB', intlUnit: 'gigabyte', value: 1024 * 1024 * 1024 },
  ] as const

  const picked = thresholds.reduce((acc, curr) => (bytes >= curr.value ? curr : acc), thresholds[0])
  
  const numericValue = bytes / picked.value
  // Round to 1 decimal place for consistency
  const roundedValue = Math.round(numericValue * 10) / 10

  const formatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: picked.intlUnit,
    unitDisplay: 'narrow',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })

  return {
    value: roundedValue,
    unit: picked.unit,
    formatted: formatter.format(numericValue),
  }
}
```

### Step 2: Keep Original Function (Backward Compatibility)

The existing `formatFileSize` function should remain unchanged for backward compatibility. Existing call sites that only need the formatted string continue to work.

### Step 3: Update SettingsPage.tsx

**File**: `apps/lite/src/routeComponents/SettingsPage.tsx`

Replace the string parsing logic:

```tsx
// Before
const sizeStr = formatBytes(storageInfo?.indexedDB.totalSize ?? 0)
const [value, unit] = sizeStr.split(' ')
const numericValue = parseFloat(value) || 0
return (
  <CountUp to={numericValue} precision={value.includes('.') ? 1 : 0} /> {unit}
)

// After
import { formatFileSizeStructured } from '@/lib/formatters'

const { value, unit } = formatFileSizeStructured(storageInfo?.indexedDB.totalSize ?? 0)
return (
  <CountUp to={value} precision={value % 1 !== 0 ? 1 : 0} /> {unit}
)
```

### Step 4: Add Unit Test

**File**: `apps/lite/src/lib/__tests__/formatters.test.ts`

Add test cases for the new function:

```typescript
import { formatFileSizeStructured } from '../formatters'

describe('formatFileSizeStructured', () => {
  it('returns structured data for bytes', () => {
    const result = formatFileSizeStructured(500)
    expect(result.value).toBe(500)
    expect(result.unit).toBe('B')
    expect(result.formatted).toContain('500')
  })

  it('returns structured data for kilobytes', () => {
    const result = formatFileSizeStructured(1536) // 1.5 KB
    expect(result.value).toBe(1.5)
    expect(result.unit).toBe('KB')
  })

  it('returns structured data for megabytes', () => {
    const result = formatFileSizeStructured(1.5 * 1024 * 1024)
    expect(result.value).toBe(1.5)
    expect(result.unit).toBe('MB')
  })

  it('handles zero bytes', () => {
    const result = formatFileSizeStructured(0)
    expect(result.value).toBe(0)
    expect(result.unit).toBe('B')
    expect(result.formatted).toBe('0 B')
  })

  it('handles negative bytes', () => {
    const result = formatFileSizeStructured(-100)
    expect(result.value).toBe(0)
    expect(result.unit).toBe('B')
  })
})
```

---

## Constraints

- Do NOT modify the existing `formatFileSize` function signature
- Do NOT remove the `formatBytes` alias
- Use the `unit` short codes (B, KB, MB, GB) for the structured return, not Intl unit names

---

## Affected Files

| File | Change |
|------|--------|
| `apps/lite/src/lib/formatters.ts` | Add `FormattedFileSize` interface and `formatFileSizeStructured` function |
| `apps/lite/src/routeComponents/SettingsPage.tsx` | Use `formatFileSizeStructured` instead of string parsing |
| `apps/lite/src/lib/__tests__/formatters.test.ts` | Add unit tests |

---

## Verification

```bash
pnpm --filter @readio/lite typecheck
pnpm --filter @readio/lite lint
pnpm --filter @readio/lite test --run
```

---

## Metadata

- **Decision Log**: Waived (implementation detail, no architectural impact)
- **Bilingual Sync**: Not applicable (code-only change)
- **Estimated Effort**: Small (~30 min)
- **Priority**: Medium (affects i18n user experience)

---

## Completion

- **Completed by**: 
- **Date**: 
- **Reviewed by**: 
