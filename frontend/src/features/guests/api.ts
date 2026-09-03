import { apiClient, type Paginated, parseResponse } from '@/lib/apiClient'

import {
  guestInHotelPageSchema,
  guestPageSchema,
  guestPendingCheckinPageSchema,
  guestSchema,
} from './schemas'
import type { CreateGuestPayload, Guest, GuestInHotel, GuestPendingCheckin } from './types'

export async function fetchGuests(search: string): Promise<Paginated<Guest>> {
  const response = await apiClient.get<unknown>('/guests/', {
    params: search ? { search } : undefined,
  })
  return parseResponse(guestPageSchema, response)
}

export async function fetchGuestsInHotel(): Promise<Paginated<GuestInHotel>> {
  const response = await apiClient.get<unknown>('/guests/in-hotel/')
  return parseResponse(guestInHotelPageSchema, response)
}

export async function fetchGuestsPendingCheckin(): Promise<Paginated<GuestPendingCheckin>> {
  const response = await apiClient.get<unknown>('/guests/pending-checkin/')
  return parseResponse(guestPendingCheckinPageSchema, response)
}

export async function createGuest(payload: CreateGuestPayload): Promise<Guest> {
  const response = await apiClient.post<unknown>('/guests/', payload)
  return parseResponse(guestSchema, response)
}
