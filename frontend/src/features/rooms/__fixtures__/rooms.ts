import type { Room } from '../types'

export const ROOM_101: Room = {
  id: 1,
  number: '101',
  capacity: 2,
  is_active: true,
  created_at: '2026-09-01T08:00:00-03:00',
}

export const ROOM_102: Room = { ...ROOM_101, id: 2, number: '102' }

export const ROOM_103: Room = { ...ROOM_101, id: 3, number: '103', capacity: 3 }

export const ROOM_201: Room = { ...ROOM_101, id: 4, number: '201', capacity: 4 }

// Fora do seed: desativado, capacidade 1 (singular).
export const ROOM_301_INACTIVE: Room = {
  ...ROOM_101,
  id: 5,
  number: '301',
  capacity: 1,
  is_active: false,
}

export const SEED_ROOMS = [ROOM_101, ROOM_102, ROOM_103, ROOM_201]
