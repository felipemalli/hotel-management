import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { fetchCurrentUser } from '@/features/auth/api'
import { errorLogger } from '@/lib/errorLogger'
import { ApiError } from '@/lib/errors'
import { createQueryClient } from '@/lib/queryClient'
import { signInForTest } from '@/test/renderWithProviders'

import { ADMIN, ATTENDANT } from './__fixtures__/users'
import { useCurrentUser, useIsAdmin } from './hooks'

vi.mock('@/features/auth/api')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCurrentUser', () => {
  it('nao pergunta quem e o usuario sem sessao', () => {
    renderHook(() => useCurrentUser(), { wrapper })

    expect(fetchCurrentUser).not.toHaveBeenCalled()
  })

  it('registra a falha do servidor sem derrubar a tela', async () => {
    const captured: unknown[] = []
    const restore = errorLogger.use({ capture: (error) => captured.push(error) })
    vi.mocked(fetchCurrentUser).mockRejectedValue(
      new ApiError({ code: 'UNKNOWN_ERROR', detail: 'boom', status: 500 }),
    )
    signInForTest()

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(captured).toHaveLength(1)
    restore()
  })

  // 4xx nao e falha do servidor: e resposta legitima, e o logger nao a registra.
  it('nao registra o 4xx', async () => {
    const captured: unknown[] = []
    const restore = errorLogger.use({ capture: (error) => captured.push(error) })
    vi.mocked(fetchCurrentUser).mockRejectedValue(
      new ApiError({ code: 'NOT_FOUND', detail: 'sem rota', status: 404 }),
    )
    signInForTest()

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(captured).toHaveLength(0)
    restore()
  })
})

describe('useIsAdmin', () => {
  it('e falso enquanto o papel nao chegou e verdadeiro depois do ADMIN', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ADMIN)
    signInForTest('admin')

    const { result } = renderHook(() => useIsAdmin(), { wrapper })

    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('e falso para o atendente', async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(ATTENDANT)
    signInForTest()

    const { result } = renderHook(() => useIsAdmin(), { wrapper })

    await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })
})
