import { useMutation, useQuery } from '@tanstack/react-query'

import { fetchAiStatus, parseGuestText } from './api'
import type { ParsedGuestFields } from './types'

export const aiKeys = {
  status: ['ai', 'status'] as const,
}

export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: fetchAiStatus,
    staleTime: Infinity,
  })
}

export function useParseGuestText(options?: { onSuccess?: (fields: ParsedGuestFields) => void }) {
  return useMutation({
    mutationFn: (text: string) => parseGuestText(text),
    onSuccess: options?.onSuccess,
  })
}
