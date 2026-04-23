import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface RouteGuardScriptModule {
  findRouteGuardViolations: () => Array<{ file: string; pattern: string }>
  ROUTE_GUARD_ALLOWLIST_PATTERNS: RegExp[]
  ROUTE_GUARD_FORBIDDEN_PATTERNS: RegExp[]
}

// @ts-expect-error guard script is JS-only and intentionally loaded in tests for runtime behavior assertions
const routeGuardScriptImport = await import('../../scripts/check-route-country-guards.js')
const { findRouteGuardViolations, ROUTE_GUARD_ALLOWLIST_PATTERNS, ROUTE_GUARD_FORBIDDEN_PATTERNS } =
  routeGuardScriptImport as RouteGuardScriptModule

describe('route guard script patterns', () => {
  it('flags production-source query-hint regressions by regex behavior', () => {
    const badSearchSource = "const route = { search: { source: 'search' } }"
    const badSessionHint = "const route = { search: { sessionId: '42' } }"
    const badTransitionHint = "const route = { search: { fromLayoutPrefix: 'top' } }"
    const badLocationStateCountry = 'const country = location.state.country'
    const badLocationStateFeed = 'const feed = location.state.feedUrl'
    const badLocationStateOptionalCountry = 'const country = location.state?.country'
    const badLocationStateOptionalFeed = 'const feed = location.state?.feedUrl'
    const badNormalizeInHotPath = 'const key = normalizeFeedUrl(feedUrl)'
    const badNewUrlInHotPath = 'const normalized = new URL(feedUrl).toString()'

    expect(ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badSearchSource))).toBe(
      true
    )
    expect(ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badSessionHint))).toBe(
      true
    )
    expect(ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badTransitionHint))).toBe(
      true
    )
    expect(
      ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badLocationStateCountry))
    ).toBe(true)
    expect(
      ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badLocationStateFeed))
    ).toBe(true)
    expect(
      ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) =>
        pattern.test(badLocationStateOptionalCountry)
      )
    ).toBe(true)
    expect(
      ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badLocationStateOptionalFeed))
    ).toBe(true)
    expect(
      ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badNormalizeInHotPath))
    ).toBe(true)
    expect(ROUTE_GUARD_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(badNewUrlInHotPath))).toBe(
      true
    )
  })

  it('keeps tests/generated files in allowlist by regex behavior', () => {
    expect(
      ROUTE_GUARD_ALLOWLIST_PATTERNS.some((pattern) => pattern.test('src/foo/__tests__/a.tsx'))
    ).toBe(true)
    expect(ROUTE_GUARD_ALLOWLIST_PATTERNS.some((pattern) => pattern.test('src/a.test.tsx'))).toBe(
      true
    )
    expect(
      ROUTE_GUARD_ALLOWLIST_PATTERNS.some((pattern) => pattern.test('src/routeTree.gen.ts'))
    ).toBe(true)
  })

  it('findRouteGuardViolations returns structured violations list', () => {
    const violations = findRouteGuardViolations()
    for (const violation of violations) {
      expect(typeof violation.file).toBe('string')
      expect(typeof violation.pattern).toBe('string')
    }
  })

  it('findRouteGuardViolations detects real forbidden usage in scanned targets', () => {
    const tempFile = path.resolve(
      process.cwd(),
      `src/components/GlobalSearch/__routeGuard.semantic.fixture.${process.pid}.${Date.now()}.ts`
    )
    fs.writeFileSync(
      tempFile,
      [
        'export const leaked = location.state?.country ?? location.state.feedUrl',
        'const { country } = location.state ?? {}',
        'const { fromLayoutPrefix: { country: nestedCountry, feedUrl: nestedFeed } = {} } = location.state ?? {}',
        'const state = location.state',
        'const fromAlias = state.country',
      ].join('\n'),
      'utf8'
    )

    try {
      const violations = findRouteGuardViolations()
      const fixtureViolations = violations.filter((violation) => violation.file === tempFile)
      expect(
        fixtureViolations.some((violation) => /location\\.state(\\?|\\.)/.test(violation.pattern))
      ).toBe(true)
      expect(
        fixtureViolations.some((violation) =>
          violation.pattern.includes('location.state.destructure.country')
        )
      ).toBe(true)
      expect(
        fixtureViolations.some((violation) =>
          violation.pattern.includes('location.state.alias.country')
        )
      ).toBe(true)
      expect(
        fixtureViolations.some((violation) =>
          violation.pattern.includes('location.state.destructure.fromLayoutPrefix.country')
        )
      ).toBe(true)
      expect(
        fixtureViolations.some((violation) =>
          violation.pattern.includes('location.state.destructure.fromLayoutPrefix.feedUrl')
        )
      ).toBe(true)
    } finally {
      fs.rmSync(tempFile, { force: true })
    }
  })
})
