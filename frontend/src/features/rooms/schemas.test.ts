import { describe, expect, it } from 'vitest'

import { page } from '@/test/fixtures'

import { ROOM_101, ROOM_301_INACTIVE, SEED_ROOMS } from './__fixtures__/rooms'
import {
  roomCapacitySchema,
  roomFormSchema,
  roomPageSchema,
  roomSchema,
  roomSummarySchema,
} from './schemas'

describe('roomSchema', () => {
  it('aceita o inventario do seed e o quarto desativado', () => {
    for (const room of SEED_ROOMS) {
      expect(roomSchema.safeParse(room).success).toBe(true)
    }
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

describe('roomFormSchema', () => {
  const VALID = { number: '301', capacity: 3 }

  it('aceita numero curto e capacidade inteira', () => {
    expect(roomFormSchema.safeParse(VALID).success).toBe(true)
    expect(roomFormSchema.safeParse({ number: '12A', capacity: 1 }).success).toBe(true)
  })

  it('exige o numero e recusa o longo demais', () => {
    expect(roomFormSchema.safeParse({ ...VALID, number: '' }).error?.issues[0]?.message).toBe(
      'Campo obrigatório.',
    )
    expect(
      roomFormSchema.safeParse({ ...VALID, number: '12345678901' }).error?.issues[0]?.message,
    ).toBe('Número com no máximo 10 caracteres.')
  })

  // Campo vazio vira `NaN` (`valueAsNumber`); a frase fala do que falta, não de tipo.
  it('avisa o que falta na capacidade vazia, fracionaria ou zerada', () => {
    expect(roomFormSchema.safeParse({ ...VALID, capacity: NaN }).error?.issues[0]?.message).toBe(
      'Informe a capacidade.',
    )
    expect(roomFormSchema.safeParse({ ...VALID, capacity: 1.5 }).error?.issues[0]?.message).toBe(
      'A capacidade deve ser um número inteiro.',
    )
    expect(roomFormSchema.safeParse({ ...VALID, capacity: 0 }).error?.issues[0]?.message).toBe(
      'A capacidade mínima é 1 pessoa.',
    )
  })

  it('roomCapacitySchema conhece so a capacidade', () => {
    expect(roomCapacitySchema.safeParse({ capacity: 3 }).success).toBe(true)
    expect(roomCapacitySchema.safeParse({ capacity: 0 }).success).toBe(false)
  })
})
