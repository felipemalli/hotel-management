/**
 * Queries e mutations de reservas (SPEC 5.2).
 *
 * Politica de invalidacao da SPEC 5.2, aplicada por igual as cinco mutations:
 * toda mutacao invalida `["guests"]` **e** `["reservations"]`. Nao e excesso —
 * check-in e checkout mudam de aba o hospede (pendente -> no hotel -> fora),
 * logo as tres listagens de hospedes mudam junto com a reserva.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { guestKeys } from '@/features/guests/hooks'
import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'

import {
  cancelReservation,
  checkIn,
  checkOut,
  createReservation,
  fetchReservations,
  type ReservationFilters,
} from './api'
import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  Reservation,
  ReservationStatus,
} from './types'

export const reservationKeys = {
  all: ['reservations'] as const,
  list: (status?: ReservationStatus) => ['reservations', { status }] as const,
}

export function useReservations(filters: ReservationFilters = {}) {
  return useQuery({
    queryKey: reservationKeys.list(filters.status),
    queryFn: () => fetchReservations(filters),
    staleTime: DEFAULT_STALE_TIME_MS,
  })
}

/** Invalida os dois dominios de leitura afetados por qualquer mutacao. */
function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: guestKeys.all })
    void queryClient.invalidateQueries({ queryKey: reservationKeys.all })
  }
}

export function useCreateReservation(options?: { onSuccess?: (r: Reservation) => void }) {
  const invalidateAll = useInvalidateAll()

  return useMutation({
    mutationFn: (payload: CreateReservationPayload) => createReservation(payload),
    onSuccess: (reservation) => {
      invalidateAll()
      options?.onSuccess?.(reservation)
    },
  })
}

export function useCheckIn(options?: { onSuccess?: (r: Reservation) => void }) {
  const invalidateAll = useInvalidateAll()

  return useMutation({
    mutationFn: (payload: CheckInPayload) => checkIn(payload),
    onSuccess: (reservation) => {
      invalidateAll()
      options?.onSuccess?.(reservation)
    },
  })
}

export function useCheckOut(options?: { onSuccess?: (s: CheckoutStatement) => void }) {
  const invalidateAll = useInvalidateAll()

  return useMutation({
    mutationFn: (id: number) => checkOut(id),
    onSuccess: (statement) => {
      invalidateAll()
      options?.onSuccess?.(statement)
    },
  })
}

export function useCancelReservation(options?: { onSuccess?: (r: Reservation) => void }) {
  const invalidateAll = useInvalidateAll()

  return useMutation({
    mutationFn: (id: number) => cancelReservation(id),
    onSuccess: (reservation) => {
      invalidateAll()
      options?.onSuccess?.(reservation)
    },
  })
}
