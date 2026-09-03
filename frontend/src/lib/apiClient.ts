import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'

import { errorLogger } from './errorLogger'
import { ApiError, type ErrorEnvelope, isErrorCode } from './errors'
import { session } from './session'
import { notifyInfo } from './toast'

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export const AUTH_PATHS = {
  token: '/auth/token/',
  refresh: '/auth/token/refresh/',
} as const

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Instância sem interceptors: o refresh passando pelo interceptor de 401
// recursaria. A `baseURL` é lida de `apiClient` na chamada, fonte única.
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

// Comparação por prefixo do caminho: `includes` casaria com qualquer URL que
// contivesse o texto (`/api/logs?next=/auth/token/`) e isentaria do Bearer uma
// rota que precisa dele.
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
  return path.startsWith(AUTH_PATHS.token) || path.startsWith(AUTH_PATHS.refresh)
}

// Uma renovação por vez: as demais requisições aguardam a mesma promise.
let refreshInFlight: Promise<string> | null = null

function refreshAccessToken(refresh: string): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = refreshClient
    .post<{ access: string }>(
      AUTH_PATHS.refresh,
      { refresh },
      { baseURL: apiClient.defaults.baseURL },
    )
    .then((response) => {
      session.setAccessToken(response.data.access)
      return response.data.access
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

// Nenhuma tela pediu esta requisição, então o aviso sai daqui. A guarda evita
// N avisos quando N requisições concorrentes descobrem a expiração juntas.
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

    const refresh = session.getRefreshToken()
    if (config._retried || refresh === null) {
      expireSession(error)
      throw toApiError(error)
    }

    // Marcado antes do await: um replay por requisição, mesmo que várias
    // esperem a mesma renovação.
    config._retried = true
    try {
      await refreshAccessToken(refresh)
    } catch (refreshCause) {
      expireSession(refreshCause)
      throw toApiError(error)
    }

    // Sem header à mão: o interceptor de requisição injeta o token novo, e uma
    // falha do replay é falha do replay — não motivo para encerrar a sessão.
    return apiClient.request(config)
  },
)

function isEnvelope(data: unknown): data is ErrorEnvelope {
  if (typeof data !== 'object' || data === null) return false
  const envelope = data as { code?: unknown; detail?: unknown }
  return typeof envelope.code === 'string' && typeof envelope.detail === 'string'
}

// Erro de rede ou timeout não tem envelope: vira código sintético, status 0.
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0
    const data: unknown = error.response?.data

    if (isEnvelope(data)) {
      if (isErrorCode(data.code)) {
        return new ApiError({ code: data.code, detail: data.detail, status, extra: data.extra })
      }
      // Código que a união não conhece: a UI trata como inesperado e o
      // original fica no `extra` para o log e para o próximo contrato.
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
