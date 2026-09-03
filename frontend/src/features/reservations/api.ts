import { apiClient, parseResponse } from '@/lib/apiClient'

import { checkoutStatementSchema, reservationSchema } from './schemas'
import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  Reservation,
} from './types'

export async function createReservation(payload: CreateReservationPayload): Promise<Reservation> {
  const response = await apiClient.post<unknown>('/reservations/', payload)
  return parseResponse(reservationSchema, response)
}

export async function checkIn({ id, allow_early }: CheckInPayload): Promise<Reservation> {
  const response = await apiClient.post<unknown>(`/reservations/${id}/check-in/`, {
    allow_early,
  })
  return parseResponse(reservationSchema, response)
}

export async function checkOut(id: number): Promise<CheckoutStatement> {
  const response = await apiClient.post<unknown>(`/reservations/${id}/checkout/`)
  return parseResponse(checkoutStatementSchema, response)
}

export async function cancelReservation(id: number): Promise<Reservation> {
  const response = await apiClient.post<unknown>(`/reservations/${id}/cancel/`)
  return parseResponse(reservationSchema, response)
}
