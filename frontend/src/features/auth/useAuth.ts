import { useCallback, useSyncExternalStore } from 'react'

import { session } from '@/lib/session'

import { type Credentials, login } from './api'

export interface Auth {
  accessToken: string | null
  isAuthenticated: boolean
  username: string | null
  signIn: (credentials: Credentials) => Promise<void>
  signOut: () => void
}

export function useAuth(): Auth {
  const accessToken = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )

  const username = useSyncExternalStore(session.subscribe, session.getUsername, session.getUsername)

  const signIn = useCallback(async (credentials: Credentials) => {
    const tokens = await login(credentials)
    session.set({ ...tokens, username: credentials.username })
  }, [])

  const signOut = useCallback(() => {
    session.clear()
  }, [])

  return { accessToken, isAuthenticated: accessToken !== null, username, signIn, signOut }
}
