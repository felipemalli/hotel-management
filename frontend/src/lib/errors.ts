export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_AUTHENTICATED',
  'NOT_FOUND',
  'THROTTLED',
  'EARLY_CHECKIN',
  'INVALID_STATUS',
  'DUPLICATE_DOCUMENT',
  'AI_DISABLED',
  'AI_UPSTREAM_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export type ClientErrorCode = 'NETWORK_ERROR' | 'CONTRACT_ERROR' | 'UNKNOWN_ERROR'

export type ErrorCode = ApiErrorCode | ClientErrorCode

const CLIENT_ERROR_CODES: readonly ClientErrorCode[] = [
  'NETWORK_ERROR',
  'CONTRACT_ERROR',
  'UNKNOWN_ERROR',
]

const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  ...API_ERROR_CODES,
  ...CLIENT_ERROR_CODES,
])

export interface ErrorEnvelope {
  code: string
  detail: string
  extra?: Record<string, unknown>
}

// A união é fechada: um código novo no servidor entra como `UNKNOWN_ERROR` e a
// UI segue ramificando por valores que o compilador conhece.
export function isErrorCode(value: string): value is ErrorCode {
  return KNOWN_CODES.has(value)
}

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly extra: Record<string, unknown>

  constructor(params: {
    code: ErrorCode
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

export function isApiErrorCode(error: unknown, code: ErrorCode): error is ApiError {
  return isApiError(error) && error.code === code
}

// Falha do servidor, e não do pedido: 5xx e a rede fora do ar (status 0). É o
// que vale um registro no logger; 4xx é resposta legítima a um pedido inválido.
export function isServerFault(error: unknown): boolean {
  return isApiError(error) && (error.status === 0 || error.status >= 500)
}

// `EARLY_CHECKIN` traz `extra.server_time` no formato "HH:MM" — é o texto do
// alerta, e o acessor existe para que o fluxo não adivinhe o formato.
export function earlyCheckinServerTime(error: unknown): string | null {
  if (!isApiErrorCode(error, 'EARLY_CHECKIN')) return null
  const time = error.extra.server_time
  return typeof time === 'string' ? time : null
}

// Transporte e autenticação falam a língua do balcão; código de domínio usa o
// `detail` do servidor, que já vem em português e é mais específico.
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  NOT_FOUND: 'Registro não encontrado. Atualize a listagem.',
  THROTTLED: 'Muitas tentativas em pouco tempo. Aguarde um instante.',
  NETWORK_ERROR: 'Não foi possível falar com o servidor.',
  CONTRACT_ERROR: 'Resposta inesperada do servidor.',
  UNKNOWN_ERROR: 'Erro inesperado. Tente novamente.',
}

export function errorMessage(
  error: unknown,
  overrides: Partial<Record<ErrorCode, string>> = {},
): string {
  if (isApiError(error)) return overrides[error.code] ?? MESSAGES[error.code] ?? error.message
  if (error instanceof Error && error.message) return error.message
  return 'Erro inesperado. Tente novamente.'
}
