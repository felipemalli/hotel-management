/**
 * Autenticacao (SPEC 4.2: `POST /api/auth/token/`).
 * Unico endpoint publico consumido pela app — o resto exige Bearer.
 */

import { apiClient, AUTH_PATHS } from '@/lib/apiClient'
import type { TokenPair } from '@/lib/session'

export interface Credentials {
  username: string
  password: string
}

export async function login(credentials: Credentials): Promise<TokenPair> {
  const response = await apiClient.post<TokenPair>(AUTH_PATHS.token, credentials)
  return response.data
}
