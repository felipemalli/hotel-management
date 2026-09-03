import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { act } from 'react'

import { createQueryClient } from '@/lib/queryClient'
import { session } from '@/lib/session'
import { toastStore } from '@/lib/toast'

export interface RenderWithProvidersOptions {
  queryClient?: QueryClient
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const queryClient = options.queryClient ?? createQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) }
}

export function signInForTest(access = 'access-token-de-teste'): void {
  act(() => {
    session.set({ access, refresh: 'refresh-token-de-teste' })
  })
}

export function resetGlobalStores(): void {
  act(() => {
    session.clear()
    toastStore.clear()
  })
}
