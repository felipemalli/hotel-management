/**
 * Envelope de erro unico da API (SPEC 4.1).
 *
 * Todo erro que atravessa o `apiClient` chega aqui e sai como `ApiError`, para
 * que a UI ramifique por `code` — nunca por mensagem de texto.
 */

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

/** Codigos sinteticos do cliente: a rede caiu antes de existir envelope. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNKNOWN_ERROR'

export interface ErrorEnvelope {
  code: string
  detail: string
  extra?: Record<string, unknown>
}

export class ApiError extends Error {
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

/**
 * `EARLY_CHECKIN` sempre traz `extra.server_time` ("HH:MM") — e o texto do
 * alerta da RN4. Guard estreito para que o fluxo F2 nao adivinhe formato.
 */
export function earlyCheckinServerTime(error: unknown): string | null {
  if (!isApiErrorCode(error, 'EARLY_CHECKIN')) return null
  const time = (error as ApiError).extra.server_time
  return typeof time === 'string' ? time : null
}

/**
 * `VALIDATION_ERROR` traz `extra` = erros por campo do DRF (`{campo: [msgs]}`).
 * Achatado em `{campo: primeira mensagem}` para plugar direto nos inputs.
 */
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

/** Mensagem para humano no balcao: `detail` da API, com fallback por codigo. */
export function errorMessage(error: unknown): string {
  if (isApiError(error) && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Erro inesperado. Tente novamente.'
}
