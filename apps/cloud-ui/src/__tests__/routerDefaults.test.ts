import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { RouteErrorFallback } from '../components/RouteErrorFallback'
import { RouteNotFound } from '../components/RouteNotFound'
import { RoutePending } from '../components/RoutePending'
import { router } from '../router'
import { Route as IndexRoute } from '../routes/index'

describe('router defaults', () => {
  it('installs application-owned route fallback components', () => {
    expect(router.options.defaultErrorComponent).toBe(RouteErrorFallback)
    expect(router.options.defaultNotFoundComponent).toBe(RouteNotFound)
    expect(router.options.defaultPendingComponent).toBe(RoutePending)
  })

  it('redirects the root route to explore', () => {
    try {
      IndexRoute.options.beforeLoad?.({} as never)
      throw new Error('expected root route to redirect')
    } catch (error) {
      expect(isRedirect(error)).toBe(true)
      if (!isRedirect(error)) {
        throw error
      }
      expect(error.options.to).toBe('/explore')
      expect(error.options.replace).toBe(true)
    }
  })
})
