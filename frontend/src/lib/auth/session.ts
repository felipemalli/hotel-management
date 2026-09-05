export type SessionStatus = 'restoring' | 'anonymous' | 'authenticated'

type Listener = () => void

const CHANNEL_NAME = 'hotel.auth'
const SIGNED_OUT = 'signed-out'

// Nasce restaurando: o access não sobrevive ao F5, e o cookie decide.
let status: SessionStatus = 'restoring'
let access: string | null = null

const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

function forgetLocally(): boolean {
  if (status === 'anonymous' && access === null) return false
  access = null
  status = 'anonymous'
  emit()
  return true
}

let channel: BroadcastChannel | null = null

export function connectTabs(): () => void {
  if (typeof BroadcastChannel !== 'function') return () => undefined

  const open = new BroadcastChannel(CHANNEL_NAME)
  open.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === SIGNED_OUT) forgetLocally()
  }
  channel = open

  return () => {
    open.close()
    if (channel === open) channel = null
  }
}

export const session = {
  getStatus: (): SessionStatus => status,

  getAccessToken: (): string | null => access,

  setAccessToken: (token: string): void => {
    access = token
    status = 'authenticated'
    emit()
  },

  // Não avisa as outras: rede caída no boot não derruba quem já está dentro.
  markAnonymous: (): void => {
    forgetLocally()
  },

  clear: (): void => {
    // O remetente não recebe o próprio postMessage: a aba local se limpa aqui.
    if (forgetLocally()) channel?.postMessage(SIGNED_OUT)
  },

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
