import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useMemo, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseEpisodeRow } from '../BaseEpisodeRow'
import { EpisodeListItem } from '../EpisodeListItem'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@/hooks/useEpisodeStatus', () => ({
  useEpisodeStatus: () => ({ playable: true, downloadStatus: 'idle', refresh: vi.fn() }),
}))

vi.mock('../../interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: ({ onPlay }: { onPlay: () => void }) => (
    <button type="button" aria-label="artwork-play" onClick={onPlay}>
      artwork
    </button>
  ),
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({ title, onClick }: { title: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

vi.mock('../BaseEpisodeRow', () => ({
  BaseEpisodeRow: vi.fn(() => <div data-testid="base-row" />),
}))

describe('EpisodeListItem memo behavior', () => {
  beforeEach(() => {
    vi.mocked(BaseEpisodeRow).mockClear()
  })

  it('does not re-render unchanged rows on unrelated parent updates', () => {
    function Harness() {
      const [tick, setTick] = useState(0)
      const onPlay = useCallback(() => {}, [])

      const rows = useMemo(
        () => [
          {
            key: 'rowA',
            model: { title: 'Row A', route: null, playAriaLabel: 'playA' },
          },
          {
            key: 'rowB',
            model: { title: 'Row B', route: null, playAriaLabel: 'playB' },
          },
        ],
        []
      )

      return (
        <div>
          <button type="button" onClick={() => setTick((v) => v + 1)}>
            tick
          </button>
          <span>{tick}</span>
          {rows.map((row) => (
            <EpisodeListItem key={row.key} model={row.model} onPlay={onPlay} />
          ))}
        </div>
      )
    }

    render(<Harness />)

    expect(BaseEpisodeRow).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'tick' }))

    expect(BaseEpisodeRow).toHaveBeenCalledTimes(2)
  })
})
