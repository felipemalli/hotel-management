import { apiClient, parseResponse } from '@/lib/api/apiClient'

import { aiStatusSchema, copilotReplySchema } from './schemas'
import type { AiStatus, CopilotReply } from './types'

export async function fetchAiStatus(): Promise<AiStatus> {
  const response = await apiClient.get<unknown>('/ai/status/')
  return parseResponse(aiStatusSchema, response)
}

export async function askCopilot(message: string): Promise<CopilotReply> {
  const response = await apiClient.post<unknown>('/ai/copilot/', { message })
  return parseResponse(copilotReplySchema, response)
}
