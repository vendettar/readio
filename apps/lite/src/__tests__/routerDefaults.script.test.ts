import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('router defaults', () => {
  it('installs application-owned route fallback components', () => {
    const routerSource = readFileSync(
      '/Users/Leo_Qiu/Documents/dev/readio/apps/lite/src/router.tsx',
      'utf8'
    )

    expect(routerSource).toContain('defaultErrorComponent: RouteErrorFallback')
    expect(routerSource).toContain('defaultNotFoundComponent: RouteNotFound')
    expect(routerSource).toContain('defaultPendingComponent: RoutePending')
  })
})
