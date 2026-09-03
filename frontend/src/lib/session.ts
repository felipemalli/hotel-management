/**
 * Guarda dos tokens JWT (SPEC 5.1).
 *
 * Trade-off assumido e documentado: os tokens vivem em `localStorage`, logo um
 * XSS os le. A mitigacao e a CSP estrita da SPEC 2.4 (`default-src 'self'`,
 * sem inline script na app) — nao ha terceiro carregando codigo nesta pagina.
 * A alternativa (cookie HttpOnly + CSRF) exigiria endpoint de sessao que a
 * SPEC 4.2 nao expoe: o contrato devolve `{access, refresh}` no corpo.
 *
 * Store observavel de proposito: o interceptor de 401 (apiClient) pode
 * derrubar a sessao de fora do React, e a arvore precisa reagir a isso.
 */

const ACCESS_KEY = 'hotel.access'
const REFRESH_KEY = 'hotel.refresh'

export interface TokenPair {
  access: string
  refresh: string
}

type Listener = () => void

const listeners = new Set<Listener>()

/** localStorage pode lancar (modo privado, cookies bloqueados). Nunca derruba a app. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* sessao apenas em memoria neste ambiente */
  }
}

let access: string | null = read(ACCESS_KEY)
let refresh: string | null = read(REFRESH_KEY)

function emit(): void {
  for (const listener of listeners) listener()
}

export const session = {
  getAccessToken: (): string | null => access,

  getRefreshToken: (): string | null => refresh,

  /** Snapshot estavel para `useSyncExternalStore`: string ou null, nunca objeto novo. */
  getSnapshot: (): string | null => access,

  set: (tokens: TokenPair): void => {
    access = tokens.access
    refresh = tokens.refresh
    write(ACCESS_KEY, access)
    write(REFRESH_KEY, refresh)
    emit()
  },

  /** Renovacao: o refresh sobrevive, so o access troca (SPEC 2.3, sem rotacao). */
  setAccessToken: (token: string): void => {
    access = token
    write(ACCESS_KEY, token)
    emit()
  },

  clear: (): void => {
    access = null
    refresh = null
    write(ACCESS_KEY, null)
    write(REFRESH_KEY, null)
    emit()
  },

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
