import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { session } from '@/lib/auth/session'

import { logout } from './api'
import { useAuth } from './useAuth'

vi.mock('@/features/auth/api')

describe('useAuth', () => {
  it('reflete o estado da sessao', () => {
    const { result } = renderHook(() => useAuth())

    expect(result.current.isAuthenticated).toBe(false)

    act(() => {
      session.setAccessToken('access-1')
    })

    expect(result.current.status).toBe('authenticated')
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('revoga a sessao no servidor ao sair', async () => {
    vi.mocked(logout).mockResolvedValue(undefined)
    act(() => {
      session.setAccessToken('access-1')
    })
    const { result } = renderHook(() => useAuth())

    act(() => {
      result.current.signOut()
    })

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(session.getAccessToken()).toBeNull())
  })

  it('esquece o access mesmo quando a revogacao nao chega ao servidor', async () => {
    vi.mocked(logout).mockRejectedValue(new Error('rede fora'))
    act(() => {
      session.setAccessToken('access-1')
    })
    const { result } = renderHook(() => useAuth())

    act(() => {
      result.current.signOut()
    })

    await waitFor(() => expect(session.getStatus()).toBe('anonymous'))
  })
})
