/**
 * Cliente HTTP unico (SPEC 5.1).
 *
 * - `baseURL: '/api'` — mesma origem no browser via proxy do Vite, por isso
 *   nao existe CORS neste projeto (SPEC 2.4).
 * - Interceptor de request injeta `Authorization: Bearer <access>` (SPEC 2.3).
 * - Interceptor de response faz **refresh-once** em 401: uma unica chamada a
 *   `/auth/token/refresh/` compartilhada por todas as requisicoes que falharem
 *   na mesma janela, e um unico replay por requisicao. Falhou o refresh ->
 *   sessao limpa e a arvore cai para /login.
 * - Todo erro sai normalizado como `ApiError` a partir do envelope SPEC 4.1.
 */

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'

import { ApiError, type ErrorEnvelope } from './errors'
import { session } from './session'

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

/** Instancia crua: o refresh nao pode passar pelos interceptors (recursao). */
const refreshClient = axios.create({
  baseURL: '/api',
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

function isAuthPath(url: string | undefined): boolean {
  if (!url) return false
  return url.includes(AUTH_PATHS.token) || url.includes(AUTH_PATHS.refresh)
}

/** Uma renovacao por vez: as demais requisicoes aguardam a mesma promise. */
let refreshInFlight: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  const refresh = session.getRefreshToken()
  if (!refresh) return Promise.reject(new Error('Sessao sem refresh token.'))

  refreshInFlight = refreshClient
    .post<{ access: string }>(AUTH_PATHS.refresh, { refresh })
    .then((response) => {
      session.setAccessToken(response.data.access)
      return response.data.access
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw toApiError(error)

    const config = error.config as RetriableConfig | undefined
    const canRetry =
      error.response?.status === 401 &&
      config !== undefined &&
      !config._retried &&
      !isAuthPath(config.url) &&
      session.getRefreshToken() !== null

    if (canRetry && config) {
      try {
        const access = await refreshAccessToken()
        config._retried = true
        const headers = AxiosHeaders.from(config.headers)
        headers.set('Authorization', `Bearer ${access}`)
        config.headers = headers
        return await apiClient.request(config)
      } catch {
        session.clear()
        throw toApiError(error)
      }
    }

    if (error.response?.status === 401 && !isAuthPath(config?.url)) session.clear()
    throw toApiError(error)
  },
)

function isEnvelope(data: unknown): data is ErrorEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { code?: unknown }).code === 'string'
  )
}

/** Erro de rede/timeout nao tem envelope: viramos codigo sintetico, status 0. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError
    const status = axiosError.response?.status ?? 0
    const data = axiosError.response?.data

    if (isEnvelope(data)) {
      return new ApiError({
        code: data.code,
        detail: data.detail ?? 'Erro inesperado.',
        status,
        extra: data.extra,
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
