import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLogsPage from '@/routeComponents/AdminLogsPage'

const { fetchAdminLogsMock, fetchAdminHealthMock } = vi.hoisted(() => ({
  fetchAdminLogsMock: vi.fn(),
  fetchAdminHealthMock: vi.fn(),
}))

vi.mock('@/lib/adminApi', () => ({
  fetchAdminLogs: fetchAdminLogsMock,
  fetchAdminHealth: fetchAdminHealthMock,
}))

vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react')
  const React = ReactModule.default
  type MockSelectElementProps = {
    value?: string
    children?: React.ReactNode
  }

  const MockSelectTrigger = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  MockSelectTrigger.displayName = 'MockSelectTrigger'

  const MockSelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  )
  MockSelectItem.displayName = 'MockSelectItem'

  const MockSelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>
  const MockSelectValue = () => null

  const MockSelect = ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => {
    const options: React.ReactNode[] = []

    const walk = (nodes: React.ReactNode) => {
      React.Children.forEach(nodes, (node) => {
        if (!React.isValidElement(node)) return
        const element = node as React.ReactElement<MockSelectElementProps>
        const componentName = (element.type as { displayName?: string }).displayName
        if (componentName === 'MockSelectItem') {
          options.push(element)
        }
        if (element.props.children) {
          walk(element.props.children)
        }
      })
    }

    walk(children)

    return (
      <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
        {options}
      </select>
    )
  }

  return {
    Select: MockSelect,
    SelectContent: MockSelectContent,
    SelectItem: MockSelectItem,
    SelectTrigger: MockSelectTrigger,
    SelectValue: MockSelectValue,
  }
})

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

const SESSION_KEY = 'readio_admin_token'

function makeHealth() {
  return {
    uptime_seconds: 60,
    buffer_size: 1,
    buffer_capacity: 100,
    go_version: 'go1.24',
    goroutines: 5,
    memory_alloc_mb: 10,
    memory_sys_mb: 20,
  }
}

function makeLogs() {
  return {
    entries: [],
    total: 0,
    buffer_capacity: 100,
  }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AdminLogsPage token UX', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
    fetchAdminLogsMock.mockResolvedValue(makeLogs())
    fetchAdminHealthMock.mockResolvedValue(makeHealth())
  })

  it('shows the token input and primary action when no token is present', () => {
    render(<AdminLogsPage />)

    expect(screen.getByPlaceholderText('Bearer token')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Use token' })).not.toBeNull()
    expect(fetchAdminLogsMock).not.toHaveBeenCalled()
    expect(fetchAdminHealthMock).not.toHaveBeenCalled()
  })

  it('hides the input and shows loaded state when a token exists in sessionStorage', async () => {
    sessionStorage.setItem(SESSION_KEY, 'stored-token')

    render(<AdminLogsPage />)

    expect(screen.queryByPlaceholderText('Bearer token')).toBeNull()
    expect(screen.getByText('Token loaded')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Change' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Clear' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Use token' })).toBeNull()

    await waitFor(() => {
      expect(fetchAdminLogsMock).toHaveBeenCalledWith('stored-token', {
        level: undefined,
        route: undefined,
      })
    })
  })

  it('reveals the input when Change is clicked', async () => {
    sessionStorage.setItem(SESSION_KEY, 'stored-token')

    render(<AdminLogsPage />)

    await screen.findByText('Token loaded')
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))

    expect(screen.getByPlaceholderText('Bearer token')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Use token' })).not.toBeNull()
  })

  it('clears the token and returns to the empty state', async () => {
    sessionStorage.setItem(SESSION_KEY, 'stored-token')

    render(<AdminLogsPage />)

    await screen.findByText('Token loaded')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(screen.getByPlaceholderText('Bearer token')).not.toBeNull()
    expect(screen.queryByText('Token loaded')).toBeNull()
  })

  it('moves to invalid/editing state when the backend rejects the current token', async () => {
    sessionStorage.setItem(SESSION_KEY, 'bad-token')
    fetchAdminLogsMock.mockRejectedValueOnce(new Error('UNAUTHORIZED'))

    render(<AdminLogsPage />)

    expect(await screen.findByText('Unauthorized — check your token')).not.toBeNull()
    expect(screen.getByPlaceholderText('Bearer token')).not.toBeNull()
    expect(screen.queryByText('Admin token loaded')).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('stops auto-refresh after the token is cleared', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem(SESSION_KEY, 'stored-token')

    render(<AdminLogsPage />)
    await flushAsyncWork()

    expect(fetchAdminLogsMock).toHaveBeenCalledTimes(1)
    expect(fetchAdminHealthMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Auto-refresh (10s)'))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
    })

    expect(fetchAdminLogsMock).toHaveBeenCalledTimes(2)
    expect(fetchAdminHealthMock).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await act(async () => {
      vi.advanceTimersByTime(20000)
      await Promise.resolve()
    })

    expect(fetchAdminLogsMock).toHaveBeenCalledTimes(2)
    expect(fetchAdminHealthMock).toHaveBeenCalledTimes(2)
  })

  it('stops auto-refresh after a scheduled refresh gets unauthorized', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem(SESSION_KEY, 'stored-token')
    fetchAdminLogsMock
      .mockResolvedValueOnce(makeLogs())
      .mockRejectedValueOnce(new Error('UNAUTHORIZED'))

    render(<AdminLogsPage />)
    await flushAsyncWork()

    expect(fetchAdminLogsMock).toHaveBeenCalledTimes(1)
    expect(fetchAdminHealthMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Auto-refresh (10s)'))

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await Promise.resolve()
    })

    expect(screen.getByText('Unauthorized — check your token')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(20000)
      await Promise.resolve()
    })

    expect(fetchAdminLogsMock).toHaveBeenCalledTimes(2)
    expect(fetchAdminHealthMock).toHaveBeenCalledTimes(2)
  })

  it('formats log timestamps as yyyy-MM-dd HH:mm:ss in UTC+8', async () => {
    sessionStorage.setItem(SESSION_KEY, 'stored-token')
    fetchAdminLogsMock.mockResolvedValueOnce({
      entries: [
        {
          ts: '2026-04-04T00:05:06Z',
          level: 'INFO',
          msg: 'hello',
        },
      ],
      total: 1,
      buffer_capacity: 100,
    })

    render(<AdminLogsPage />)

    expect(await screen.findByText('2026-04-04 08:05:06 GMT+8')).not.toBeNull()
  })

  it('renders canonical upstream fields and explicit none error class', async () => {
    sessionStorage.setItem(SESSION_KEY, 'stored-token')
    fetchAdminLogsMock.mockResolvedValueOnce({
      entries: [
        {
          ts: '2026-04-04T00:05:06Z',
          level: 'INFO',
          msg: 'proxy request',
          route: 'proxy/media',
          upstream_kind: 'media',
          upstream_host: 'cdn.example.com',
          elapsed_ms: 42,
          error_class: 'none',
        },
      ],
      total: 1,
      buffer_capacity: 100,
    })

    render(<AdminLogsPage />)

    expect(await screen.findByText('media · cdn.example.com')).not.toBeNull()
    expect(screen.getByText('none')).not.toBeNull()
    expect(screen.getByText('42ms')).not.toBeNull()
  })
})
