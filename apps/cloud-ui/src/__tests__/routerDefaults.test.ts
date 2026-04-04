import { describe, expect, it } from 'vitest'
import { RouteErrorFallback } from '../components/RouteErrorFallback'
import { RouteNotFound } from '../components/RouteNotFound'
import { RoutePending } from '../components/RoutePending'
import { router } from '../router'

describe('router defaults', () => {
  it('installs application-owned route fallback components', () => {
    expect(router.options.defaultErrorComponent).toBe(RouteErrorFallback)
    expect(router.options.defaultNotFoundComponent).toBe(RouteNotFound)
    expect(router.options.defaultPendingComponent).toBe(RoutePending)
  })
})
