import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'
import { GUESTS_ROOT } from '@/lib/queryKeys'
import { useInvalidateServerState } from '@/lib/useInvalidateServerState'

import { createGuest, fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from './api'
import type { CreateGuestPayload, Guest } from './types'

export const guestKeys = {
  list: (search: string) => [...GUESTS_ROOT, { search }] as const,
  inHotel: [...GUESTS_ROOT, 'in-hotel'] as const,
  pendingCheckin: [...GUESTS_ROOT, 'pending-checkin'] as const,
}

export interface QueryOptions {
  enabled?: boolean
}

export function useGuests(search: string, options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.list(search),
    queryFn: () => fetchGuests(search),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}

export function useGuestsInHotel(options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.inHotel,
    queryFn: fetchGuestsInHotel,
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
  })
}

export function useGuestsPendingCheckin(options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.pendingCheckin,
    queryFn: fetchGuestsPendingCheckin,
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
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
