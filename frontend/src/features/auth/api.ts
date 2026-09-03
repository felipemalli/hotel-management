import { apiClient, AUTH_PATHS, parseResponse } from '@/lib/apiClient'
import type { TokenPair } from '@/lib/session'

import { tokenPairSchema } from './schemas'

export interface Credentials {
  username: string
  password: string
}

export async function login(credentials: Credentials): Promise<TokenPair> {
  const response = await apiClient.post<unknown>(AUTH_PATHS.token, credentials)
  return parseResponse(tokenPairSchema, response)
}
