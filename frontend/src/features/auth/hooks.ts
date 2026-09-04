import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { errorLogger } from '@/lib/errorLogger'
import { isServerFault } from '@/lib/errors'
import { AUTH_ROOT } from '@/lib/queryKeys'
import { session } from '@/lib/session'

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
    // O papel só muda por ação administrativa fora desta sessão, e o cache
    // inteiro é descartado no sign-out: um refetch a cada 30 s seria ruído.
    staleTime: Infinity,
    // Nunca ao boundary: não saber o papel não pode derrubar uma tela que já
    // carregou. Sem resposta, a aplicação segue na visão do atendente.
    throwOnError: false,
  })

  const { error } = query

  useEffect(() => {
    if (error && isServerFault(error)) errorLogger.capture(error, { scope: 'auth-me' })
  }, [error])

  return query
}

// `false` enquanto carrega: um controle de escrita não pode piscar na tela de
// quem não pode usá-lo.
export function useIsAdmin(): boolean {
  return useCurrentUser().data?.role === 'ADMIN'
}
