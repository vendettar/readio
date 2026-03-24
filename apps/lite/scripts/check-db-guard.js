#!/usr/bin/env node
/**
 * Architecture Guard: Prevent UI components from directly accessing the DB layer.
 *
 * Rule: UI components (in src/components/ or src/routeComponents/) MUST NOT
 * import ANYTHING from 'dexieDb' (including type-only imports).
 *
 * UI should import DB entity types from 'lib/db/types' instead.
 */

import { execFileSync } from 'node:child_process'

const COMPONENT_DIRS = ['src/components', 'src/routeComponents']

let hasViolations = false
let hasScanErrors = false

console.log('🔍 Checking for direct DB access from UI components...\n')

for (const dir of COMPONENT_DIRS) {
  try {
    // Use ripgrep to find ANY imports from dexieDb - search .ts and .tsx files
    const output = execFileSync('rg', ['from.*dexieDb', dir, '-g', '*.ts', '-g', '*.tsx', '-n'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (output) {
      const lines = output.trim().split('\n')

      for (const line of lines) {
        console.error(`❌ ${line}`)
        hasViolations = true
      }
    }
  } catch (error) {
    // rg returns non-zero exit code when no matches found, which is good
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) {
      continue
    }
    hasScanErrors = true
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error)
    console.error(`Error scanning ${dir}:`, message)
  }
}

if (hasScanErrors) {
  console.error('\n❌ DB guard scan failed; failing closed.')
  process.exit(1)
} else if (hasViolations) {
  console.error('\n❌ Architecture violation detected!')
  console.error('UI components must NOT import anything from dexieDb (including types).')
  console.error('Please use lib/db/types for DB entity types instead.\n')
  process.exit(1)
} else {
  console.log('✅ No direct DB access violations found!\n')
  process.exit(0)
}
