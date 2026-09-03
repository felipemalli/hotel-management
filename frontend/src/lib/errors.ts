export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_AUTHENTICATED',
  'NOT_FOUND',
  'EARLY_CHECKIN',
  'INVALID_STATUS',
  'DUPLICATE_DOCUMENT',
  'AI_DISABLED',
  'AI_UPSTREAM_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export type ClientErrorCode = 'NETWORK_ERROR' | 'UNKNOWN_ERROR'

export interface ErrorEnvelope {
  code: string
  detail: string
  extra?: Record<string, unknown>
}

export class ApiError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- uniao aberta
  readonly code: ApiErrorCode | ClientErrorCode | string
  readonly status: number
  readonly extra: Record<string, unknown>

  constructor(params: {
    code: string
    detail: string
    status: number
    extra?: Record<string, unknown>
  }) {
    super(params.detail)
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.extra = params.extra ?? {}
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isApiErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return isApiError(error) && error.code === code
}

// `EARLY_CHECKIN` traz `extra.server_time` no formato "HH:MM" — é o texto do
// alerta, e o acessor existe para que o fluxo não adivinhe o formato.
export function earlyCheckinServerTime(error: unknown): string | null {
  if (!isApiErrorCode(error, 'EARLY_CHECKIN')) return null
  const time = (error as ApiError).extra.server_time
  return typeof time === 'string' ? time : null
}

// Erro por campo do DRF chega como lista (`{campo: [msgs]}`). Achatado na
// primeira mensagem para plugar direto no input.
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiErrorCode(error, 'VALIDATION_ERROR')) return {}
  const result: Record<string, string> = {}
  for (const [field, messages] of Object.entries((error as ApiError).extra)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') {
      result[field] = messages[0]
    } else if (typeof messages === 'string') {
      result[field] = messages
    }
  }
  return result
}

export function errorMessage(error: unknown): string {
  if (isApiError(error) && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Erro inesperado. Tente novamente.'
}
