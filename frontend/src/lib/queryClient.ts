import { QueryClient } from '@tanstack/react-query'

/**
 * Politica de cache da SPEC 5.2, em um lugar so.
 *
 * Fabrica (e nao instancia modulo) porque cada teste precisa de um cache
 * limpo: cache compartilhado entre testes vaza dado de um caso para o outro.
 */

export const DEFAULT_STALE_TIME_MS = 30_000

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
