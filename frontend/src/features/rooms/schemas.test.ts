import { describe, expect, it } from 'vitest'

import { page } from '@/test/fixtures'

import { ROOM_101, ROOM_301_INACTIVE, SEED_ROOMS } from './__fixtures__/rooms'
import { roomPageSchema, roomSchema, roomSummarySchema } from './schemas'

describe('roomSchema', () => {
  it('aceita o inventario do seed', () => {
    for (const room of SEED_ROOMS) {
      expect(roomSchema.safeParse(room).success).toBe(true)
    }
  })

  it('aceita o quarto desativado', () => {
    expect(roomSchema.safeParse(ROOM_301_INACTIVE).success).toBe(true)
  })

  it('recusa capacidade que veio como texto', () => {
    expect(roomSchema.safeParse({ ...ROOM_101, capacity: '2' }).success).toBe(false)
  })

  it('reduz o resumo ao que a reserva embute', () => {
    const parsed = roomSummarySchema.parse(ROOM_101)

    expect(parsed).toEqual({ id: ROOM_101.id, number: ROOM_101.number })
  })

  it('aceita a pagina do DRF', () => {
    expect(roomPageSchema.safeParse(page(SEED_ROOMS)).success).toBe(true)
  })
})
