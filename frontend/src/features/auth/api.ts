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

// Papel não viaja no token: a claim é opaca e não expiraria com mudança fora da sessão.
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<unknown>(AUTH_PATHS.me)
  return parseResponse(currentUserSchema, response)
}
