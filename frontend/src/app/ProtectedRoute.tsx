import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/useAuth'

/**
 * Portao de sessao (RF8): sem access token nao existe app.
 *
 * `state.from` guarda a rota tentada para que o login possa devolver o
 * atendente ao lugar certo, e `replace` evita que o botao voltar recaia na
 * rota protegida.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
