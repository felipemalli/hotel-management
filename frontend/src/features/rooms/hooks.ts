import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/api/queryClient'
import { ROOMS_ROOT } from '@/lib/api/queryKeys'
import { useInvalidateServerState } from '@/lib/api/useInvalidateServerState'

import { createRoom, deleteRoom, fetchAvailableRooms, fetchRooms, updateRoom } from './api'
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

// keepPreviousData: senão a lista pisca vazia e o quarto escolhido some.
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

export function useDeleteRoom(options?: { onSuccess?: () => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (id: number) => deleteRoom(id),
    onSuccess: () => {
      invalidateServerState()
      options?.onSuccess?.()
    },
  })
}
