import { useQueryClient } from '@tanstack/react-query'

// Invalidação cruzada: toda mutation invalida as duas raízes, porque check-in e
// checkout movem o hóspede de aba e criar hóspede muda o universo de reservas.
// As raízes moram aqui, e não nas features, para guests e reservations não se
// importarem em ciclo.
export const GUESTS_ROOT = ['guests'] as const
export const RESERVATIONS_ROOT = ['reservations'] as const

export function useInvalidateServerState(): () => void {
  const queryClient = useQueryClient()

  return () => {
    void queryClient.invalidateQueries({ queryKey: GUESTS_ROOT })
    void queryClient.invalidateQueries({ queryKey: RESERVATIONS_ROOT })
  }
}
