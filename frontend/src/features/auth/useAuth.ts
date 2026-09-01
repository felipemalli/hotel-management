import { useCallback, useSyncExternalStore } from 'react'

import { session } from '@/lib/session'

import { login, type Credentials } from './api'

/**
 * Sessao do atendente (SPEC 5.1).
 *
 * Sem Context e sem Redux: a fonte da verdade e o store observavel de
 * `lib/session`, lido por `useSyncExternalStore`. Isso importa porque a sessao
 * tambem cai de fora do React — o interceptor de 401 do `apiClient` limpa o
 * store quando o refresh falha, e toda a arvore precisa reagir a isso na hora.
 */
export interface Auth {
  accessToken: string | null
  isAuthenticated: boolean
  signIn: (credentials: Credentials) => Promise<void>
  signOut: () => void
}

export function useAuth(): Auth {
  const accessToken = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )

  const signIn = useCallback(async (credentials: Credentials) => {
    session.set(await login(credentials))
  }, [])

  const signOut = useCallback(() => {
    session.clear()
  }, [])

  return { accessToken, isAuthenticated: accessToken !== null, signIn, signOut }
}
