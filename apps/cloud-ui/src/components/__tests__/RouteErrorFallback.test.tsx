import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RouteErrorFallback } from '../RouteErrorFallback'

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../lib/errorReporter', () => ({
  reportError: vi.fn(),
}))

describe('RouteErrorFallback', () => {
  it('does not render raw error details to the user', () => {
    render(
      <RouteErrorFallback
        error={new Error("Cannot read properties of undefined (reading 'start')")}
        reset={vi.fn()}
      />
    )

    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.queryByText("Cannot read properties of undefined (reading 'start')")).toBeNull()
    expect(screen.queryByText('Show Error')).toBeNull()
    expect(screen.queryByText('Hide Error')).toBeNull()
  })
})
