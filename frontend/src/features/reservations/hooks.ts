import { useMutation } from '@tanstack/react-query'

import { useInvalidateServerState } from '@/lib/queryKeys'

import { cancelReservation, checkIn, checkOut, createReservation } from './api'
import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  Reservation,
} from './types'

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
