/**
 * Endpoints de hospedes (SPEC 4.3).
 *
 * `in-hotel` e `pending-checkin` nao aceitam `?search=` no contrato: a busca
 * parcial vive na listagem geral (RF3), e as abas sao recortes por estado
 * (RF4/RF5).
 */

import { apiClient, type Paginated } from '@/lib/apiClient'

import type {
  CreateGuestPayload,
  Guest,
  GuestInHotel,
  GuestPendingCheckin,
} from './types'

export async function fetchGuests(search: string): Promise<Paginated<Guest>> {
  const response = await apiClient.get<Paginated<Guest>>('/guests/', {
    params: search ? { search } : undefined,
  })
  return response.data
}

export async function fetchGuestsInHotel(): Promise<Paginated<GuestInHotel>> {
  const response = await apiClient.get<Paginated<GuestInHotel>>('/guests/in-hotel/')
  return response.data
}

export async function fetchGuestsPendingCheckin(): Promise<Paginated<GuestPendingCheckin>> {
  const response = await apiClient.get<Paginated<GuestPendingCheckin>>(
    '/guests/pending-checkin/',
  )
  return response.data
}

export async function createGuest(payload: CreateGuestPayload): Promise<Guest> {
  const response = await apiClient.post<Guest>('/guests/', payload)
  return response.data
}
