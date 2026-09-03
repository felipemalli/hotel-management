import { apiClient, parseResponse } from '@/lib/apiClient'

import { aiStatusSchema, parsedGuestSchema } from './schemas'
import type { AiStatus, ParsedGuestFields } from './types'

export async function fetchAiStatus(): Promise<AiStatus> {
  const response = await apiClient.get<unknown>('/ai/status/')
  return parseResponse(aiStatusSchema, response)
}

export async function parseGuestText(text: string): Promise<ParsedGuestFields> {
  const response = await apiClient.post<unknown>('/ai/parse-guest/', { text })
  return parseResponse(parsedGuestSchema, response)
}
