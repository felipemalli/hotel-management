import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { GUESTS_ROOT, RESERVATIONS_ROOT } from './queryKeys'

// Invalidação cruzada: toda mutation invalida as duas raízes, porque check-in e
// checkout movem o hóspede de aba e criar hóspede muda o universo de reservas.
export function useInvalidateServerState(): () => void {
  const queryClient = useQueryClient()

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: GUESTS_ROOT })
    void queryClient.invalidateQueries({ queryKey: RESERVATIONS_ROOT })
  }, [queryClient])
}
