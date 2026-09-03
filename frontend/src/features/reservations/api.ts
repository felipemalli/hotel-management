/**
 * Endpoints de reservas (SPEC 4.4).
 *
 * `checkIn` envia `allow_early` sempre explicito: o override de D4 e uma
 * decisao do atendente, e default implicito esconderia essa decisao.
 */

import { apiClient, type Paginated } from '@/lib/apiClient'

import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  Reservation,
  ReservationStatus,
} from './types'

export interface ReservationFilters {
  status?: ReservationStatus
  guest?: number
}

export async function fetchReservations(
  filters: ReservationFilters = {},
): Promise<Paginated<Reservation>> {
  const response = await apiClient.get<Paginated<Reservation>>('/reservations/', {
    params: filters,
  })
  return response.data
}

export async function createReservation(payload: CreateReservationPayload): Promise<Reservation> {
  const response = await apiClient.post<Reservation>('/reservations/', payload)
  return response.data
}

export async function checkIn({ id, allow_early }: CheckInPayload): Promise<Reservation> {
  const response = await apiClient.post<Reservation>(`/reservations/${id}/check-in/`, {
    allow_early,
  })
  return response.data
}

export async function checkOut(id: number): Promise<CheckoutStatement> {
  const response = await apiClient.post<CheckoutStatement>(`/reservations/${id}/checkout/`)
  return response.data
}

export async function cancelReservation(id: number): Promise<Reservation> {
  const response = await apiClient.post<Reservation>(`/reservations/${id}/cancel/`)
  return response.data
}
