import { apiClient } from '@/lib/apiClient'

import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  Reservation,
} from './types'

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
