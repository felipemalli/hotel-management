const ACCESS_KEY = 'hotel.access'
const REFRESH_KEY = 'hotel.refresh'
const USERNAME_KEY = 'hotel.username'

export interface TokenPair {
  access: string
  refresh: string
}

export interface SessionData extends TokenPair {
  username: string
}

type Listener = () => void

const listeners = new Set<Listener>()

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
    // modo privado / cookies bloqueados: a sessão fica só em memória
  }
}

let access: string | null = read(ACCESS_KEY)
let refresh: string | null = read(REFRESH_KEY)
let username: string | null = read(USERNAME_KEY)

function emit(): void {
  for (const listener of listeners) listener()
}

const OWN_KEYS: readonly string[] = [ACCESS_KEY, REFRESH_KEY, USERNAME_KEY]

// `storage` só dispara nas outras abas — escrever aqui não cria laço.
window.addEventListener('storage', (event) => {
  if (event.key !== null && !OWN_KEYS.includes(event.key)) return
  access = read(ACCESS_KEY)
  refresh = read(REFRESH_KEY)
  username = read(USERNAME_KEY)
  emit()
})

export const session = {
  getAccessToken: (): string | null => access,

  getRefreshToken: (): string | null => refresh,

  // Do login, não de /auth/me/: precisa existir antes da primeira resposta.
  getUsername: (): string | null => username,

  set: (data: SessionData): void => {
    access = data.access
    refresh = data.refresh
    username = data.username
    write(ACCESS_KEY, access)
    write(REFRESH_KEY, refresh)
    write(USERNAME_KEY, username)
    emit()
  },

  setAccessToken: (token: string): void => {
    access = token
    write(ACCESS_KEY, token)
    emit()
  },

  clear: (): void => {
    access = null
    refresh = null
    username = null
    write(ACCESS_KEY, null)
    write(REFRESH_KEY, null)
    write(USERNAME_KEY, null)
    emit()
  },

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
