import { apiClient, type Paginated } from '@/lib/api/apiClient'
import { parseResponse } from '@/lib/api/apiClient'

import { roomPageSchema } from './schemas'
import { roomSchema } from './schemas'
import type {
  AvailabilityQuery,
  CreateRoomPayload,
  Room,
  RoomListParams,
  UpdateRoomPatch,
} from './types'

// `is_active=false` é o que AMPLIA a listagem no servidor: sem o parâmetro ele
// devolve só os ativos. O nome do parâmetro é o da API, não o da tela.
export async function fetchRooms({
  includeInactive = false,
  page = 1,
}: RoomListParams = {}): Promise<Paginated<Room>> {
  const response = await apiClient.get<unknown>('/rooms/', {
    params: {
      ...(includeInactive ? { is_active: 'false' } : {}),
      ...(page > 1 ? { page } : {}),
    },
  })
  return parseResponse(roomPageSchema, response)
}

export async function fetchAvailableRooms(query: AvailabilityQuery): Promise<Paginated<Room>> {
  const response = await apiClient.get<unknown>('/rooms/available/', { params: query })
  return parseResponse(roomPageSchema, response)
}

export async function createRoom(payload: CreateRoomPayload): Promise<Room> {
  const response = await apiClient.post<unknown>('/rooms/', payload)
  return parseResponse(roomSchema, response)
}

export async function updateRoom(id: number, patch: UpdateRoomPatch): Promise<Room> {
  const response = await apiClient.patch<unknown>(`/rooms/${id}/`, patch)
  return parseResponse(roomSchema, response)
}
