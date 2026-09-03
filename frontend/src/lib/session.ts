// Trade-off assumido: os tokens vivem em `localStorage`, logo um XSS os lê. O
// access dura 60 min, o refresh 12 h e a página não carrega script de terceiro.
// A alternativa (cookie HttpOnly + CSRF) exigiria endpoint que a API não expõe.
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

// `localStorage` lança em modo privado ou com cookies bloqueados: a sessão
// então vive só em memória, e a app nunca cai por causa disso.
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
    // sessão apenas em memória neste ambiente
  }
}

let access: string | null = read(ACCESS_KEY)
let refresh: string | null = read(REFRESH_KEY)
let username: string | null = read(USERNAME_KEY)

function emit(): void {
  for (const listener of listeners) listener()
}

export const session = {
  getAccessToken: (): string | null => access,

  getRefreshToken: (): string | null => refresh,

  getSnapshot: (): string | null => access,

  // O nome do atendente vem do que ele digitou no login: a API nao expoe um
  // endpoint de perfil, e o token e opaco para o cliente.
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
