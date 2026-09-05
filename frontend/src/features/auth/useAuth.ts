import { useCallback, useSyncExternalStore } from 'react'

import { session, type SessionStatus } from '@/lib/auth/session'
import { errorLogger } from '@/lib/errors/errorLogger'

import { logout } from './api'

export interface Auth {
  status: SessionStatus
  isAuthenticated: boolean
  signOut: () => void
}

async function endSession(): Promise<void> {
  try {
    await logout()
  } catch (cause) {
    // Sem a revogação o cookie sobrevive, mas travar o Sair numa rede caída é pior.
    errorLogger.capture(cause, { scope: 'auth-logout' })
  } finally {
    session.clear()
  }
}

export function useAuth(): Auth {
  const status = useSyncExternalStore(session.subscribe, session.getStatus, session.getStatus)

  const signOut = useCallback(() => {
    void endSession()
  }, [])

  return { status, isAuthenticated: status === 'authenticated', signOut }
}
