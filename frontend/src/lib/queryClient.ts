import { MutationCache, QueryClient } from '@tanstack/react-query'

import { errorLogger } from './errorLogger'
import { errorMessage, isApiError, isApiErrorCode, isServerFault } from './errors'
import { notifyError } from './toast'

export const DEFAULT_STALE_TIME_MS = 30_000

// Roteamento de erro, em uma tabela:
// mutation                -> toast, exceto os códigos abaixo, que alguma tela já
//                            apresenta no lugar certo (campo culpado, alerta do 409)
// query 5xx, 1ª carga     -> boundary (não há nada na tela para preservar)
// query 5xx, com dado     -> mantém o dado; o refetch falho não apaga a tabela
// query 4xx ou rede fora  -> `ErrorState` inline com retry
const LOCALLY_PRESENTED_CODES = new Set(['VALIDATION_ERROR', 'DUPLICATE_DOCUMENT', 'EARLY_CHECKIN'])

export function isLocallyPresented(error: unknown): boolean {
  return isApiError(error) && LOCALLY_PRESENTED_CODES.has(error.code)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isServerFault(error)) errorLogger.capture(error, { scope: 'mutation' })
        if (isLocallyPresented(error)) return
        notifyError(errorMessage(error))
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        retry: false,
        refetchOnWindowFocus: false,
        // `data === undefined` é a primeira carga: só aí a tela está vazia e o
        // boundary tem o que substituir. Backend fora do ar segue inline, com
        // retry, porque recarregar a aplicação não o traz de volta.
        throwOnError: (error, query) =>
          isServerFault(error) &&
          !isApiErrorCode(error, 'NETWORK_ERROR') &&
          query.state.data === undefined,
      },
      mutations: { retry: false },
    },
  })
}
