import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { GUESTS_ROOT, PRICING_ROOT, RESERVATIONS_ROOT, ROOMS_ROOT } from './queryKeys'

// Invalidação cruzada: toda mutation marca como velho o estado derivado do
// servidor. Check-in e checkout movem o hóspede de aba, criar hóspede muda o
// universo de reservas e criar reserva muda a disponibilidade de quartos.
// `invalidateQueries` só refaz o que está montado — o resto vira `stale` de
// graça, e por isso a lista é a raiz de dados inteira em vez de um recorte.
export function useInvalidateServerState(): () => void {
  const queryClient = useQueryClient()

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: GUESTS_ROOT })
    void queryClient.invalidateQueries({ queryKey: RESERVATIONS_ROOT })
    void queryClient.invalidateQueries({ queryKey: ROOMS_ROOT })
    void queryClient.invalidateQueries({ queryKey: PRICING_ROOT })
  }, [queryClient])
}
