import { useQueryClient } from '@tanstack/react-query'

/**
 * Raizes das query keys da SPEC 5.2, em um modulo neutro.
 *
 * Vivem aqui, e nao dentro de cada feature, porque a politica de invalidacao
 * da SPEC 5.2 e cruzada: **toda** mutation invalida `["guests"]` e
 * `["reservations"]`. Se cada feature importasse a chave da outra, guests e
 * reservations se importariam em ciclo.
 *
 * Motivo da invalidacao cruzada: check-in e checkout movem o hospede de aba
 * (pendente -> no hotel -> fora), logo mexer numa reserva muda as tres
 * listagens de hospedes, e criar hospede muda o universo de reservas possiveis.
 */

export const GUESTS_ROOT = ['guests'] as const
export const RESERVATIONS_ROOT = ['reservations'] as const

export function useInvalidateServerState(): () => void {
  const queryClient = useQueryClient()

  return () => {
    void queryClient.invalidateQueries({ queryKey: GUESTS_ROOT })
    void queryClient.invalidateQueries({ queryKey: RESERVATIONS_ROOT })
  }
}
