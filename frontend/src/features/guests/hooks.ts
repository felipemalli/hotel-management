/**
 * Queries e mutations de hospedes (SPEC 5.2).
 *
 * As chaves sao exatamente as da tabela da SPEC 5.2 — `["guests", {search}]`,
 * `["guests","in-hotel"]`, `["guests","pending-checkin"]` — e todas nascem sob
 * o prefixo `["guests"]`, o que faz `invalidateQueries({queryKey:["guests"]})`
 * alcancar as tres de uma vez.
 */

import { useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'
import { GUESTS_ROOT, useInvalidateServerState } from '@/lib/queryKeys'

import { createGuest, fetchGuests, fetchGuestsInHotel, fetchGuestsPendingCheckin } from './api'
import type { CreateGuestPayload, Guest } from './types'

export const guestKeys = {
  all: GUESTS_ROOT,
  list: (search: string) => ['guests', { search }] as const,
  inHotel: ['guests', 'in-hotel'] as const,
  pendingCheckin: ['guests', 'pending-checkin'] as const,
}

/** `enabled` deixa a aba inativa sem requisicao: uma aba, uma chamada. */
export interface QueryOptions {
  enabled?: boolean
}

export function useGuests(search: string, options?: QueryOptions) {
  return useQuery({
    queryKey: guestKeys.list(search),
    queryFn: () => fetchGuests(search),
    staleTime: DEFAULT_STALE_TIME_MS,
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
