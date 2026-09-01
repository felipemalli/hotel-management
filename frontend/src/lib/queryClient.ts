import { MutationCache, QueryClient } from '@tanstack/react-query'

import { errorMessage, isApiError } from './errors'
import { notifyError } from './toast'

/**
 * Politica de cache da SPEC 5.2 e handler global de erros da SPEC 8.2/E, em um
 * lugar so.
 *
 * Fabrica (e nao instancia modulo) porque cada teste precisa de um cache
 * limpo: cache compartilhado entre testes vaza dado de um caso para o outro.
 */

export const DEFAULT_STALE_TIME_MS = 30_000

/**
 * Codigos que **alguma tela** ja apresenta no lugar certo. Reexibi-los em
 * toast faria o atendente ler a mesma falha duas vezes:
 *
 * - `VALIDATION_ERROR` -> `fieldErrors` pluga a mensagem no input do campo.
 * - `DUPLICATE_DOCUMENT` -> mensagem no campo Documento do `GuestForm` (D12).
 * - `EARLY_CHECKIN` -> nao e falha: e o ramo de protocolo D4 que abre o alerta
 *   do fluxo F2 (SPEC 5.3). Cair em toast aqui contradiria a RN4.
 */
const LOCALLY_PRESENTED_CODES = new Set([
  'VALIDATION_ERROR',
  'DUPLICATE_DOCUMENT',
  'EARLY_CHECKIN',
])

export function isLocallyPresented(error: unknown): boolean {
  return isApiError(error) && LOCALLY_PRESENTED_CODES.has(error.code)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    /**
     * Erro de **mutation** vira toast; erro de **query** nao. Leitura que
     * falha tem lugar proprio na tela (`ErrorState` com retry, SPEC 5.3/F1) e
     * um toast por cima disso seria redundante. Escrita que falha nao tem
     * lugar proprio: o gesto do atendente ficaria sem resposta.
     */
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isLocallyPresented(error)) return
        notifyError(errorMessage(error))
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        // Sem retry automatico: erro de leitura vira estado de erro com botao
        // de retry explicito (SPEC 5.3/F1), e nao espera silenciosa.
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
