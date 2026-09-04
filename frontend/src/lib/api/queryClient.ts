import { MutationCache, QueryClient } from '@tanstack/react-query'

import { errorLogger } from '../errors/errorLogger'
import {
  type ErrorCode,
  errorMessage,
  isApiError,
  isApiErrorCode,
  isServerFault,
} from '../errors/errors'
import { notifyError } from '../notify/toast'

export const DEFAULT_STALE_TIME_MS = 30_000

const LOCALLY_PRESENTED_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'VALIDATION_ERROR',
  'DUPLICATE_DOCUMENT',
  'EARLY_CHECKIN',
  'ROOM_UNAVAILABLE',
  'NOT_AUTHENTICATED',
])

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
        // `throwOnError` só na 1ª carga (`data === undefined`) e não em NETWORK_ERROR.
        throwOnError: (error, query) =>
          isServerFault(error) &&
          !isApiErrorCode(error, 'NETWORK_ERROR') &&
          query.state.data === undefined,
      },
      mutations: { retry: false },
    },
  })
}
