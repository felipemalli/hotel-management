import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import type { z } from 'zod'

import { csrfHeaders, csrfToken } from '../auth/csrf'
import { session } from '../auth/session'
import { errorLogger } from '../errors/errorLogger'
import { ApiError, type ErrorEnvelope, isErrorCode } from '../errors/errors'
import { notifyInfo } from '../notify/toast'

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export const AUTH_PATHS = {
  token: '/auth/token/',
  refresh: '/auth/token/refresh/',
  logout: '/auth/logout/',
  me: '/auth/me/',
} as const

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

const refreshClient = axios.create({
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = session.getAccessToken()
  if (token && !isAuthPath(config.url)) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
  }
  return config
})

function pathOf(url: string): string {
  const [beforeQuery = ''] = url.split('?')
  const withoutOrigin = beforeQuery.replace(/^https?:\/\/[^/]+/, '')
  const base = apiClient.defaults.baseURL ?? ''
  const relative =
    base !== '' && withoutOrigin.startsWith(base) ? withoutOrigin.slice(base.length) : withoutOrigin
  return relative.startsWith('/') ? relative : `/${relative}`
}

function isAuthPath(url: string | undefined): boolean {
  if (!url) return false
  const path = pathOf(url)
  return (
    path.startsWith(AUTH_PATHS.token) ||
    path.startsWith(AUTH_PATHS.refresh) ||
    path.startsWith(AUTH_PATHS.logout)
  )
}

function requestAccessToken(): Promise<string> {
  return refreshClient
    .post<{ access: string }>(
      AUTH_PATHS.refresh,
      {},
      { baseURL: apiClient.defaults.baseURL, headers: csrfHeaders() },
    )
    .then((response) => {
      session.setAccessToken(response.data.access)
      return response.data.access
    })
}

// N requisições com 401 ao mesmo tempo disparam uma renovação só. Entre abas não há
// corrida: o cookie é o mesmo para todas e a renovação não o altera.
let refreshInFlight: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= requestAccessToken().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function restoreSession(): Promise<void> {
  // O login grava os dois cookies, e este vive mais: sem ele não há sessão a restaurar.
  if (csrfToken() === null) {
    session.markAnonymous()
    return
  }

  try {
    await refreshAccessToken()
  } catch (cause) {
    const error = toApiError(cause)
    // 401 no boot é o anônimo de todo dia; o resto é falha que merece registro.
    if (error.status !== 401 && error.status !== 403) {
      errorLogger.capture(error, { scope: 'auth-restore' })
    }
    session.markAnonymous()
  }
}

function expireSession(cause: unknown): void {
  errorLogger.capture(cause, { scope: 'auth-refresh' })
  if (session.getAccessToken() === null) return
  session.clear()
  notifyInfo('Sua sessão expirou. Entre novamente.')
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw toApiError(error)

    const config: RetriableConfig | undefined = error.config
    if (error.response?.status !== 401 || !config || isAuthPath(config.url)) {
      throw toApiError(error)
    }

    if (config._retried || session.getStatus() !== 'authenticated') {
      expireSession(error)
      throw toApiError(error)
    }

    // `_retried` antes do await: um replay por requisição.
    config._retried = true
    try {
      await refreshAccessToken()
    } catch (refreshCause) {
      expireSession(refreshCause)
      throw toApiError(error)
    }

    // Sem header: o interceptor de requisição injeta o token novo.
    return apiClient.request(config)
  },
)

function isEnvelope(data: unknown): data is ErrorEnvelope {
  if (typeof data !== 'object' || data === null) return false
  const envelope = data as { code?: unknown; detail?: unknown }
  return typeof envelope.code === 'string' && typeof envelope.detail === 'string'
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0
    const data: unknown = error.response?.data

    if (isEnvelope(data)) {
      if (isErrorCode(data.code)) {
        return new ApiError({ code: data.code, detail: data.detail, status, extra: data.extra })
      }
      return new ApiError({
        code: 'UNKNOWN_ERROR',
        detail: data.detail,
        status,
        extra: { ...data.extra, raw_code: data.code },
      })
    }

    return new ApiError({
      code: status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
      detail:
        status === 0
          ? 'Não foi possível falar com o servidor.'
          : `Erro inesperado do servidor (HTTP ${status}).`,
      status,
    })
  }

  return new ApiError({
    code: 'UNKNOWN_ERROR',
    detail: error instanceof Error ? error.message : 'Erro inesperado.',
    status: 0,
  })
}

export function parseResponse<Schema extends z.ZodType>(
  schema: Schema,
  response: { status: number; data: unknown },
): z.output<Schema> {
  const result = schema.safeParse(response.data)
  if (result.success) return result.data

  errorLogger.capture(result.error, { scope: 'api-contract' })
  throw new ApiError({
    code: 'CONTRACT_ERROR',
    detail: 'Resposta inesperada do servidor.',
    status: response.status,
  })
}
