import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/api/queryClient'
import { GUESTS_ROOT } from '@/lib/api/queryKeys'
import { useInvalidateServerState } from '@/lib/api/useInvalidateServerState'

import {
  createGuest,
  fetchGuest,
  fetchGuests,
  fetchGuestsInHotel,
  fetchGuestsPendingCheckin,
} from './api'
import type { CreateGuestPayload, Guest } from './types'

export const guestKeys = {
  list: (search: string, page: number) => [...GUESTS_ROOT, { search, page }] as const,
  inHotel: (search: string, page: number) =>
    [...GUESTS_ROOT, 'in-hotel', { search, page }] as const,
  pendingCheckin: (search: string, page: number) =>
    [...GUESTS_ROOT, 'pending-checkin', { search, page }] as const,
  detail: (id: number) => [...GUESTS_ROOT, id] as const,
}

export interface QueryOptions {
  enabled?: boolean
  keepPrevious?: boolean
}

function placeholderFor(options?: QueryOptions) {
  return options?.keepPrevious === false ? undefined : keepPreviousData
}

export function useGuests(search: string, page = 1, options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.list(search, page),
    queryFn: () => fetchGuests(search, page),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: placeholderFor(options),
    enabled: options?.enabled ?? true,
  })
}

export function useGuestsInHotel(search: string, page = 1, options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.inHotel(search, page),
    queryFn: () => fetchGuestsInHotel(search, page),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: placeholderFor(options),
    enabled: options?.enabled ?? true,
  })
}

export function useGuestsPendingCheckin(search: string, page = 1, options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.pendingCheckin(search, page),
    queryFn: () => fetchGuestsPendingCheckin(search, page),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: placeholderFor(options),
    enabled: options?.enabled ?? true,
  })
}

export function useGuest(id: number | undefined) {
  return useQuery({
    queryKey: guestKeys.detail(id ?? 0),
    queryFn: () => fetchGuest(id ?? 0),
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled: id !== undefined,
  })
}

export function useCreateGuest(options?: { onSuccess?: (guest: Guest) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (payload: CreateGuestPayload) => createGuest(payload),
    onSuccess: (guest) => {
      invalidateServerState()
      options?.onSuccess?.(guest)
    },
  })
}
