import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { GUESTS_ROOT, PRICING_ROOT, RESERVATIONS_ROOT, ROOMS_ROOT } from './queryKeys'

export function useInvalidateServerState(): () => void {
  const queryClient = useQueryClient()

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: GUESTS_ROOT })
    void queryClient.invalidateQueries({ queryKey: RESERVATIONS_ROOT })
    void queryClient.invalidateQueries({ queryKey: ROOMS_ROOT })
    void queryClient.invalidateQueries({ queryKey: PRICING_ROOT })
  }, [queryClient])
}
