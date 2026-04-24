#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const srcRoot = path.resolve(process.cwd(), 'src')

const allowlistPatterns = [/\.test\./, /__tests__/, /routeTree\.gen\.ts$/]
const forbiddenPatterns = [
  /['"]\/podcast\/\$id(?:[/'"]|$)/,
  /createFileRoute\(['"]\/podcast\/(?!\$country\b)/,
]

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

const files = walk(srcRoot).filter(
  (file) => !allowlistPatterns.some((pattern) => pattern.test(file))
)

const violations = []
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      violations.push({ file, pattern: pattern.toString() })
    }
  }
}

if (violations.length > 0) {
  console.error('[legacy-route-ban] Forbidden legacy route literal found:')
  for (const violation of violations) {
    console.error(`- ${path.relative(process.cwd(), violation.file)} -> ${violation.pattern}`)
  }
  process.exit(1)
}

console.log('[legacy-route-ban] PASS')
