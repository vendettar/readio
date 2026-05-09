#!/bin/bash
set -euo pipefail

# Script to enforce atomic selectors in Zustand store usage
# It flags cases where useXStore() is called without a selector function.

echo "🔍 Checking for direct store subscriptions (missing selectors)..."

# Discover active Zustand store hooks from source ownership rather than
# maintaining a stale hardcoded subset in this guard script.
STORE_HOOK_PATTERN=$(
  rg -o --no-filename 'export const (use[A-Za-z0-9]+Store) = create' src/store src/lib/downloadProgressTracking.ts \
    | sed -E 's/export const (use[A-Za-z0-9]+Store) = create/\1/' \
    | sort -u \
    | paste -sd '|' -
)

if [ -z "$STORE_HOOK_PATTERN" ]; then
  echo "❌ Error: No Zustand store hooks were discovered for selector enforcement."
  exit 1
fi

# Scan for useXStore() without arguments using ripgrep (rg).
# We exclude tests and comment-only lines.
VIOLATIONS=$(rg -n --type-add 'web:*.{ts,tsx}' -t web -g '!**/__tests__/**' "\\b(${STORE_HOOK_PATTERN})\\(\\)" src | grep -vE ':[0-9]+:[[:space:]]*//' || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Error: Direct store subscription detected (missing selector)."
  echo "Always use atomic selectors to prevent unnecessary re-renders."
  echo "Found in:"
  echo "$VIOLATIONS"
  exit 1
fi

echo "✅ No direct store subscriptions found in source files (excluding tests)."
exit 0
