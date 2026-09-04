import { apiClient, AUTH_PATHS, parseResponse } from '@/lib/api/apiClient'
import type { TokenPair } from '@/lib/auth/session'

import { currentUserSchema, tokenPairSchema } from './schemas'
import type { CurrentUser } from './types'

export interface Credentials {
  username: string
  password: string
}

export async function login(credentials: Credentials): Promise<TokenPair> {
  const response = await apiClient.post<unknown>(AUTH_PATHS.token, credentials)
  return parseResponse(tokenPairSchema, response)
}

// O papel não viaja no token: a claim é opaca para o cliente e não expiraria
// junto com uma mudança de papel feita fora desta sessão. O servidor é quem
// diz, e é isto que decide se o painel administrativo existe na tela.
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<unknown>(AUTH_PATHS.me)
  return parseResponse(currentUserSchema, response)
}
