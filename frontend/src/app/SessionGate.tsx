import { type ReactNode, useEffect } from 'react'

import { useAuth } from '@/features/auth/useAuth'
import { restoreSession } from '@/lib/api/apiClient'
import { connectTabs, session } from '@/lib/auth/session'

import { PageFallback } from './layout/PageFallback'

export function SessionGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  useEffect(() => {
    if (session.getStatus() === 'restoring') void restoreSession()
    return connectTabs()
  }, [])

  if (status === 'restoring') return <PageFallback />

  return <>{children}</>
}
