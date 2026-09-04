import { apiClient, type Paginated, parseResponse } from '@/lib/api/apiClient'

import {
  guestInHotelPageSchema,
  guestPageSchema,
  guestPendingCheckinPageSchema,
  guestSchema,
} from './schemas'
import type { CreateGuestPayload, Guest, GuestInHotel, GuestPendingCheckin } from './types'

// `page` só viaja depois da primeira: a primeira página é o padrão do servidor.
function pageParam(page: number): { page?: number } {
  return page > 1 ? { page } : {}
}

export async function fetchGuests(search: string, page = 1): Promise<Paginated<Guest>> {
  const response = await apiClient.get<unknown>('/guests/', {
    params: { ...(search ? { search } : {}), ...pageParam(page) },
  })
  return parseResponse(guestPageSchema, response)
}

export async function fetchGuestsInHotel(page = 1): Promise<Paginated<GuestInHotel>> {
  const response = await apiClient.get<unknown>('/guests/in-hotel/', { params: pageParam(page) })
  return parseResponse(guestInHotelPageSchema, response)
}

export async function fetchGuestsPendingCheckin(page = 1): Promise<Paginated<GuestPendingCheckin>> {
  const response = await apiClient.get<unknown>('/guests/pending-checkin/', {
    params: pageParam(page),
  })
  return parseResponse(guestPendingCheckinPageSchema, response)
}

export async function createGuest(payload: CreateGuestPayload): Promise<Guest> {
  const response = await apiClient.post<unknown>('/guests/', payload)
  return parseResponse(guestSchema, response)
}

export async function fetchGuest(id: number): Promise<Guest> {
  const response = await apiClient.get<unknown>(`/guests/${id}/`)
  return parseResponse(guestSchema, response)
}
