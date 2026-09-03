import { useCallback, useSyncExternalStore } from 'react'

import { session } from '@/lib/session'

export interface Auth {
  isAuthenticated: boolean
  username: string | null
  signOut: () => void
}

export function useAuth(): Auth {
  const accessToken = useSyncExternalStore(
    session.subscribe,
    session.getAccessToken,
    session.getAccessToken,
  )

  const username = useSyncExternalStore(session.subscribe, session.getUsername, session.getUsername)

  const signOut = useCallback(() => {
    session.clear()
  }, [])

  return { isAuthenticated: accessToken !== null, username, signOut }
}
