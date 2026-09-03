import { MutationCache, QueryClient } from '@tanstack/react-query'

import { errorMessage, isApiError } from './errors'
import { notifyError } from './toast'

export const DEFAULT_STALE_TIME_MS = 30_000

// Roteamento de erro: mutation vira toast, exceto os códigos abaixo, que alguma
// tela já apresenta no lugar certo — `VALIDATION_ERROR` e `DUPLICATE_DOCUMENT`
// no input culpado, `EARLY_CHECKIN` no alerta de confirmação. Erro de query não
// vira toast: tem `ErrorState` com retry na própria tabela.
const LOCALLY_PRESENTED_CODES = new Set(['VALIDATION_ERROR', 'DUPLICATE_DOCUMENT', 'EARLY_CHECKIN'])

export function isLocallyPresented(error: unknown): boolean {
  return isApiError(error) && LOCALLY_PRESENTED_CODES.has(error.code)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isLocallyPresented(error)) return
        notifyError(errorMessage(error))
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
