import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'
import { RESERVATIONS_ROOT } from '@/lib/queryKeys'
import { useInvalidateServerState } from '@/lib/useInvalidateServerState'

import {
  cancelReservation,
  checkIn,
  checkOut,
  createReservation,
  fetchReservation,
  fetchReservations,
  fetchReservationStatement,
  payReservation,
} from './api'
import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  PayReservationPayload,
  Reservation,
  ReservationListParams,
} from './types'

export const reservationKeys = {
  list: (params: ReservationListParams) => [...RESERVATIONS_ROOT, 'list', params] as const,
  detail: (id: number) => [...RESERVATIONS_ROOT, id] as const,
  statement: (id: number) => [...RESERVATIONS_ROOT, id, 'statement'] as const,
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
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => checkOut(id),
    onSuccess: (statement) => {
      // A semeadura vem DEPOIS da invalidação: a chave do extrato mora sob a
      // raiz das reservas, e invalidar em seguida marcaria como velho o dado
      // que o próprio POST acabou de devolver — a 2ª via aberta logo depois
      // pagaria uma segunda ida ao servidor por nada.
      invalidateServerState()
      queryClient.setQueryData(reservationKeys.statement(statement.reservation_id), statement)
      options?.onSuccess?.(statement)
    },
  })
}

export interface QueryOptions {
  enabled?: boolean
}

export function useReservationStatement(id: number, options?: QueryOptions) {
  return useQuery({
    queryKey: reservationKeys.statement(id),
    queryFn: () => fetchReservationStatement(id),
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
  })
}

export function usePayReservation(options?: { onSuccess?: (s: CheckoutStatement) => void }) {
  const invalidateServerState = useInvalidateServerState()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: PayReservationPayload) => payReservation(payload),
    onSuccess: (statement) => {
      invalidateServerState()
      queryClient.setQueryData(reservationKeys.statement(statement.reservation_id), statement)
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

export function useReservations(params: ReservationListParams) {
  return useQuery({
    queryKey: reservationKeys.list(params),
    queryFn: () => fetchReservations(params),
    staleTime: DEFAULT_STALE_TIME_MS,
    // Trocar de página não pode piscar a tabela vazia: o dado anterior fica na
    // tela enquanto o seguinte não chega.
    placeholderData: keepPreviousData,
  })
}

export function useReservation(id: number | null) {
  return useQuery({
    queryKey: reservationKeys.detail(id ?? 0),
    queryFn: () => fetchReservation(id ?? 0),
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled: id !== null,
  })
}
