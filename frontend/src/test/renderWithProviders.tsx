import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { createQueryClient } from '@/lib/queryClient'
import { session } from '@/lib/session'
import { toastStore } from '@/lib/toast'

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true }

export interface RenderWithProvidersOptions {
  queryClient?: QueryClient
  route?: string
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const queryClient = options.queryClient ?? createQueryClient()
  const route = options.route

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {route === undefined ? (
          children
        ) : (
          <MemoryRouter initialEntries={[route]} future={ROUTER_FUTURE}>
            {children}
          </MemoryRouter>
        )}
      </QueryClientProvider>
    )
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) }
}

export function signInForTest(username = 'recepcao'): void {
  act(() => {
    session.set({
      access: 'access-token-de-teste',
      refresh: 'refresh-token-de-teste',
      username,
    })
  })
}

export function resetGlobalStores(): void {
  act(() => {
    session.clear()
    toastStore.clear()
  })
}
