import { apiClient, AUTH_PATHS, parseResponse } from '@/lib/api/apiClient'
import { csrfHeaders } from '@/lib/auth/csrf'

import { currentUserSchema, sessionTokenSchema } from './schemas'
import type { CurrentUser } from './types'

export interface Credentials {
  username: string
  password: string
}

export interface SessionToken {
  access: string
}

export async function login(credentials: Credentials): Promise<SessionToken> {
  const response = await apiClient.post<unknown>(AUTH_PATHS.token, credentials)
  return parseResponse(sessionTokenSchema, response)
}

export async function logout(): Promise<void> {
  await apiClient.post(AUTH_PATHS.logout, {}, { headers: csrfHeaders() })
}

// Papel não viaja no token: a claim é opaca e não expiraria com mudança fora da sessão.
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<unknown>(AUTH_PATHS.me)
  return parseResponse(currentUserSchema, response)
}
