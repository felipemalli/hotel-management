export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_AUTHENTICATED',
  'NOT_FOUND',
  'THROTTLED',
  'EARLY_CHECKIN',
  'INVALID_STATUS',
  'DUPLICATE_DOCUMENT',
  'PERMISSION_DENIED',
  'ROOM_UNAVAILABLE',
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

export function isServerFault(error: unknown): boolean {
  return isApiError(error) && (error.status === 0 || error.status >= 500)
}

export interface EarlyCheckinInfo {
  serverTime: string
  opensAt: string
}

// `opens_at` vem da política vigente: não gravar "14:00" no texto.
export function earlyCheckinInfo(error: unknown): EarlyCheckinInfo | null {
  if (!isApiErrorCode(error, 'EARLY_CHECKIN')) return null
  const { server_time: serverTime, opens_at: opensAt } = error.extra
  if (typeof serverTime !== 'string' || typeof opensAt !== 'string') return null
  return { serverTime, opensAt }
}

export interface RoomUnavailableInfo {
  conflictingCheckinDate: string | null
}

// Só `room_id` é garantido no extra: corrida da constraint não traz reserva conflitante.
export function roomUnavailableInfo(error: unknown): RoomUnavailableInfo | null {
  if (!isApiErrorCode(error, 'ROOM_UNAVAILABLE')) return null
  const date = error.extra.conflicting_checkin_date
  return { conflictingCheckinDate: typeof date === 'string' ? date : null }
}

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  NOT_FOUND: 'Registro não encontrado. Atualize a listagem.',
  THROTTLED: 'Muitas tentativas em pouco tempo. Aguarde um instante.',
  // DRF pode devolver o texto em inglês; mapeamos para o balcão.
  PERMISSION_DENIED: 'Ação restrita ao administrador do hotel.',
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
