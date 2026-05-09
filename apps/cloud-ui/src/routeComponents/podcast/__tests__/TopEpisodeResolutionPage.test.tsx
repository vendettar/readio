import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TopEpisodeResolutionPage from '../TopEpisodeResolutionPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('TopEpisodeResolutionPage', () => {
  it('renders a loading skeleton', () => {
    render(<TopEpisodeResolutionPage />)

    expect(screen.queryByText('loading')).not.toBeNull()
    expect(screen.queryByText('loadingEpisodes')).not.toBeNull()
  })
})
