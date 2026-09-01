import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { act } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { createQueryClient } from '@/lib/queryClient'
import { session } from '@/lib/session'
import { toastStore } from '@/lib/toast'

/**
 * Montagem padrao dos testes da SPEC 6.2.
 *
 * `createQueryClient()` por render (e nao um cliente de modulo) porque cache
 * compartilhado vaza dado de um caso para o outro; e o mesmo cliente traz o
 * handler global de erros, o que mantem o teste sobre a arvore real.
 *
 * `Toaster` **nao** entra aqui: quem o quer, monta `AppProviders`. Assim um
 * teste de tabela nao passa a conter uma regiao `aria-live` que ele nao pediu.
 */

export interface RenderWithProvidersOptions {
  queryClient?: QueryClient
}

/** Retorno inferido: o `RenderResult` do RTL, mais o cliente do teste. */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const queryClient = options.queryClient ?? createQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) }
}

/**
 * Sessao autenticada. Envolvida em `act` porque `session` e store externo:
 * escrever nele fora de `act` faz o React reclamar da atualizacao de fora.
 */
export function signInForTest(access = 'access-token-de-teste'): void {
  act(() => {
    session.set({ access, refresh: 'refresh-token-de-teste' })
  })
}

/** Higiene entre casos: `session` e `toastStore` sao stores de modulo. */
export function resetGlobalStores(): void {
  act(() => {
    session.clear()
    toastStore.clear()
  })
}
