import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'
import { ROOMS_ROOT } from '@/lib/queryKeys'

import { fetchAvailableRooms, fetchRooms } from './api'
import type { AvailabilityQuery, RoomListParams } from './types'

export const roomKeys = {
  list: (params: Required<RoomListParams>) => [...ROOMS_ROOT, 'list', params] as const,
  available: (query: AvailabilityQuery) => [...ROOMS_ROOT, 'available', query] as const,
}

export interface QueryOptions {
  enabled?: boolean
}

export function useRooms(params: Required<RoomListParams>) {
  return useQuery({
    queryKey: roomKeys.list(params),
    queryFn: () => fetchRooms(params),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  })
}

// `keepPreviousData`: trocar uma data ou somar um acompanhante refaz a consulta,
// e piscar a lista vazia entre uma resposta e outra faria o quarto já escolhido
// desaparecer da tela por um instante.
export function useAvailableRooms(query: AvailabilityQuery, options?: QueryOptions) {
  return useQuery({
    queryKey: roomKeys.available(query),
    queryFn: () => fetchAvailableRooms(query),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}
