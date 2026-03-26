import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIntegrityMaintenance } from '../useIntegrityMaintenance'

const runIntegrityCheck = vi.fn()

vi.mock('../../lib/retention', () => ({
  runIntegrityCheck: () => runIntegrityCheck(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    successKey: vi.fn(),
    infoKey: vi.fn(),
    errorKey: vi.fn(),
  },
}))

import { toast } from '../../lib/toast'

describe('useIntegrityMaintenance', () => {
  beforeEach(() => {
    runIntegrityCheck.mockReset()
    vi.mocked(toast.successKey).mockReset()
    vi.mocked(toast.infoKey).mockReset()
    vi.mocked(toast.errorKey).mockReset()
  })

  it('is single-flight while running', async () => {
    let resolveRun: ((value: unknown) => void) | null = null
    runIntegrityCheck.mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve
      })
    )

    const { result } = renderHook(() => useIntegrityMaintenance())

    let p1: Promise<void> | null = null
    let p2: Promise<void> | null = null
    await act(async () => {
      p1 = result.current.runNow()
      p2 = result.current.runNow()
    })

    expect(runIntegrityCheck).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(result.current.isRunning).toBe(true)
    })

    await act(async () => {
      resolveRun?.({
        checkedAt: Date.now(),
        missingAudioBlob: 0,
        danglingFolderRef: 0,
        danglingTrackRef: 0,
        totalRepairs: 0,
      })
      if (!p1 || !p2) {
        throw new Error('Expected run promises to be set')
      }
      await p1
      await p2
    })

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false)
      expect(result.current.lastReport?.totalRepairs).toBe(0)
    })
  })

  it('shows success toast when repairs are made', async () => {
    runIntegrityCheck.mockResolvedValue({
      checkedAt: 123,
      missingAudioBlob: 1,
      danglingFolderRef: 1,
      danglingTrackRef: 0,
      totalRepairs: 2,
    })

    const { result } = renderHook(() => useIntegrityMaintenance())

    await act(async () => {
      await result.current.runNow()
    })

    expect(toast.successKey).toHaveBeenCalledWith('toastMaintenanceRepaired', { count: 2 })
    expect(toast.infoKey).not.toHaveBeenCalled()
    expect(toast.errorKey).not.toHaveBeenCalled()
  })

  it('shows informational toast when no issues are found', async () => {
    runIntegrityCheck.mockResolvedValue({
      checkedAt: 123,
      missingAudioBlob: 0,
      danglingFolderRef: 0,
      danglingTrackRef: 0,
      totalRepairs: 0,
    })

    const { result } = renderHook(() => useIntegrityMaintenance())

    await act(async () => {
      await result.current.runNow()
    })

    expect(toast.infoKey).toHaveBeenCalledWith('toastMaintenanceNoIssues')
    expect(toast.successKey).not.toHaveBeenCalled()
    expect(toast.errorKey).not.toHaveBeenCalled()
  })

  it('resets running state and shows error toast for unexpected exceptions', async () => {
    runIntegrityCheck.mockRejectedValue(new Error('unexpected'))
    const { result } = renderHook(() => useIntegrityMaintenance())

    await act(async () => {
      await result.current.runNow()
    })

    expect(result.current.isRunning).toBe(false)
    expect(toast.errorKey).toHaveBeenCalledWith('toastMaintenanceFailed')
  })
})
