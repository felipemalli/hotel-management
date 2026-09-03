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
