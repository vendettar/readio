#!/bin/bash
set -euo pipefail

# Script to enforce atomic selectors in Zustand store usage
# It flags cases where useXStore() is called without a selector function.

echo "🔍 Checking for direct store subscriptions (missing selectors)..."

# Scan for useXStore() without arguments using ripgrep (rg)
# We exclude matches in __tests__
# Ensure any rg error (exit 2) makes the script exit non-zero via 'set -e'.
# Handle exit 1 (no matches) gracefully by checking the output.
# We pipe to grep to filter out comment-only lines.
# Since rg -n outputs 'file:line:content', we match the end of the prefix.
VIOLATIONS=$(rg -n --type-add 'web:*.{ts,tsx}' -t web -g '!**/__tests__/**' 'use(Player|Explore|Files|History|Search)Store\(\)' src | grep -vE ':[0-9]+:[[:space:]]*//' || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Error: Direct store subscription detected (missing selector)."
  echo "Always use atomic selectors to prevent unnecessary re-renders."
  echo "Found in:"
  echo "$VIOLATIONS"
  exit 1
fi

echo "✅ No direct store subscriptions found in source files (excluding tests)."
exit 0
