import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/queryClient'
import { ROOMS_ROOT } from '@/lib/queryKeys'
import { useInvalidateServerState } from '@/lib/useInvalidateServerState'

import { createRoom, fetchAvailableRooms, fetchRooms, updateRoom } from './api'
import type {
  AvailabilityQuery,
  CreateRoomPayload,
  Room,
  RoomListParams,
  UpdateRoomPatch,
} from './types'

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

export function useCreateRoom(options?: { onSuccess?: (room: Room) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (payload: CreateRoomPayload) => createRoom(payload),
    onSuccess: (room) => {
      invalidateServerState()
      options?.onSuccess?.(room)
    },
  })
}

export interface UpdateRoomVariables {
  id: number
  patch: UpdateRoomPatch
}

export function useUpdateRoom(options?: { onSuccess?: (room: Room) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: ({ id, patch }: UpdateRoomVariables) => updateRoom(id, patch),
    onSuccess: (room) => {
      invalidateServerState()
      options?.onSuccess?.(room)
    },
  })
}
