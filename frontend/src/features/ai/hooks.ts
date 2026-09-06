import { useMutation, useQuery } from '@tanstack/react-query'

import { askCopilot, fetchAiStatus } from './api'

export const aiKeys = {
  status: ['ai', 'status'] as const,
}

export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: fetchAiStatus,
    staleTime: Infinity,
    // A Íris é opcional: o portão indisponível não derruba a página com ela.
    throwOnError: false,
  })
}

export function useCopilot() {
  // O wrapper de um argumento existe porque o v5 passa um contexto no segundo.
  return useMutation({ mutationFn: (message: string) => askCopilot(message) })
}
