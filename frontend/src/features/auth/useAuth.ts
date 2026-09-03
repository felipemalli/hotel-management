import { useCallback, useSyncExternalStore } from 'react'

import { session } from '@/lib/session'

import { type Credentials, login } from './api'

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
