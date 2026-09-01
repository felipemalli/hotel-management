/**
 * Endpoints da IA opcional (SPEC 7.1).
 *
 * Mesma instancia de `apiClient` do resto do app: o Bearer, o refresh-once e a
 * normalizacao do envelope SPEC 4.1 valem aqui tambem — `AI_DISABLED` e
 * `AI_UPSTREAM_ERROR` chegam a UI como `ApiError` com `code`.
 */

import { apiClient } from '@/lib/apiClient'

import type { AiStatus, ParsedGuestFields } from './types'

export async function fetchAiStatus(): Promise<AiStatus> {
  const response = await apiClient.get<AiStatus>('/ai/status/')
  return response.data
}

export async function parseGuestText(text: string): Promise<ParsedGuestFields> {
  const response = await apiClient.post<ParsedGuestFields>('/ai/parse-guest/', { text })
  return response.data
}
