import { z } from 'zod'

import { requiredString } from '@/lib/forms'
import { isoDateTime, paginated } from '@/lib/schemas'

import type { CreateRoomPayload } from './types'

// O resumo é o que vem embutido numa reserva. Mora aqui, e não em `guests` ou
// `reservations`, porque as duas features o consomem e `rooms` não importa
// nenhuma delas — é a ponta da qual as outras dependem.
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

// Capacidade é CONTAGEM de pessoas, não dinheiro: aqui um número é legítimo, e
// a guarda do CI (que proíbe converter dinheiro) não se aplica. `valueAsNumber`
// no `register` mantém o tipo de entrada igual ao do payload.
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
