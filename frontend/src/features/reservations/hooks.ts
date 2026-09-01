/**
 * Queries e mutations de reservas (SPEC 5.2).
 *
 * Politica de invalidacao da SPEC 5.2 aplicada por `useInvalidateServerState`:
 * toda mutation invalida `["guests"]` **e** `["reservations"]`.
 */

import { useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'
import { RESERVATIONS_ROOT, useInvalidateServerState } from '@/lib/queryKeys'

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
  all: RESERVATIONS_ROOT,
  list: (status?: ReservationStatus) => ['reservations', { status }] as const,
}

export function useReservations(filters: ReservationFilters = {}) {
  return useQuery({
    queryKey: reservationKeys.list(filters.status),
    queryFn: () => fetchReservations(filters),
    staleTime: DEFAULT_STALE_TIME_MS,
  })
}

export function useCreateReservation(options?: { onSuccess?: (r: Reservation) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (payload: CreateReservationPayload) => createReservation(payload),
    onSuccess: (reservation) => {
      invalidateServerState()
      options?.onSuccess?.(reservation)
    },
  })
}

export function useCheckIn(options?: { onSuccess?: (r: Reservation) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (payload: CheckInPayload) => checkIn(payload),
    onSuccess: (reservation) => {
      invalidateServerState()
      options?.onSuccess?.(reservation)
    },
  })
}

export function useCheckOut(options?: { onSuccess?: (s: CheckoutStatement) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (id: number) => checkOut(id),
    onSuccess: (statement) => {
      invalidateServerState()
      options?.onSuccess?.(statement)
    },
  })
}

export function useCancelReservation(options?: { onSuccess?: (r: Reservation) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (id: number) => cancelReservation(id),
    onSuccess: (reservation) => {
      invalidateServerState()
      options?.onSuccess?.(reservation)
    },
  })
}
