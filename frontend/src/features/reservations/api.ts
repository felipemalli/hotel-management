import { apiClient, type Paginated, parseResponse } from '@/lib/apiClient'

import { checkoutStatementSchema, reservationPageSchema, reservationSchema } from './schemas'
import type {
  CheckInPayload,
  CheckoutStatement,
  CreateReservationPayload,
  PayReservationPayload,
  Reservation,
  ReservationListParams,
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

// 2ª via: o servidor hidrata o extrato gravado, nunca recalcula, então a
// reimpressão é idêntica à do checkout.
export async function fetchReservationStatement(id: number): Promise<CheckoutStatement> {
  const response = await apiClient.get<unknown>(`/reservations/${id}/statement/`)
  return parseResponse(checkoutStatementSchema, response)
}

export async function payReservation({
  id,
  payment_method,
}: PayReservationPayload): Promise<CheckoutStatement> {
  const response = await apiClient.post<unknown>(`/reservations/${id}/pay/`, { payment_method })
  return parseResponse(checkoutStatementSchema, response)
}

export async function fetchReservations(
  params: ReservationListParams,
): Promise<Paginated<Reservation>> {
  const response = await apiClient.get<unknown>('/reservations/', { params })
  return parseResponse(reservationPageSchema, response)
}

export async function fetchReservation(id: number): Promise<Reservation> {
  const response = await apiClient.get<unknown>(`/reservations/${id}/`)
  return parseResponse(reservationSchema, response)
}
