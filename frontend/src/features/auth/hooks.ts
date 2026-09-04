import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { AUTH_ROOT } from '@/lib/api/queryKeys'
import { session } from '@/lib/auth/session'
import { errorLogger } from '@/lib/errors/errorLogger'
import { isServerFault } from '@/lib/errors/errors'

import { type Credentials, fetchCurrentUser, login } from './api'
import { useAuth } from './useAuth'

export const authKeys = {
  me: [...AUTH_ROOT, 'me'] as const,
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: Credentials) => login(credentials),
    onSuccess: (tokens, credentials) => {
      session.set({ ...tokens, username: credentials.username })
    },
  })
}

export function useCurrentUser() {
  const { isAuthenticated } = useAuth()

  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: fetchCurrentUser,
    enabled: isAuthenticated,
    // Papel só muda fora desta sessão; o cache some no sign-out.
    staleTime: Infinity,
    // Sem papel a tela já carregada não cai no boundary; segue visão do atendente.
    throwOnError: false,
  })

  const { error } = query

  useEffect(() => {
    if (error && isServerFault(error)) errorLogger.capture(error, { scope: 'auth-me' })
  }, [error])

  return query
}

// false enquanto carrega: controle de escrita não pisca para quem não pode usá-lo.
export function useIsAdmin(): boolean {
  return useCurrentUser().data?.role === 'ADMIN'
}
