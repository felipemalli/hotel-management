import { z } from 'zod'

import { isoDateTime, paginated } from '@/lib/schemas'

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
