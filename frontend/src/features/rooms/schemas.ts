import { z } from 'zod'

import { isoDateTime, paginated } from '@/lib/api/schemas'
import { requiredString } from '@/lib/forms/forms'

import type { CreateRoomPayload } from './types'

export const roomSummarySchema = z.object({
  id: z.number().int(),
  number: z.string(),
})

export const roomSchema = roomSummarySchema.extend({
  capacity: z.number().int(),
  is_active: z.boolean(),
  created_at: isoDateTime,
})

export const roomPageSchema = paginated(roomSchema)

export const ROOM_NUMBER_MAX_LENGTH = 10

// Contagem de pessoas, não dinheiro: Number é legítimo (a guarda do CI é de dinheiro).
export const capacityField = z
  .number({ error: 'Informe a capacidade.' })
  .int({ error: 'A capacidade deve ser um número inteiro.' })
  .min(1, { error: 'A capacidade mínima é 1 pessoa.' })

export const roomFormSchema = z.object({
  number: requiredString().max(ROOM_NUMBER_MAX_LENGTH, {
    error: `Número com no máximo ${ROOM_NUMBER_MAX_LENGTH} caracteres.`,
  }),
  capacity: capacityField,
}) satisfies z.ZodType<CreateRoomPayload>

export const roomCapacitySchema = roomFormSchema.pick({ capacity: true })
