import { useMutation } from '@tanstack/react-query'

import { session } from '@/lib/session'

import { type Credentials, login } from './api'

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: Credentials) => login(credentials),
    onSuccess: (tokens, credentials) => {
      session.set({ ...tokens, username: credentials.username })
    },
  })
}
