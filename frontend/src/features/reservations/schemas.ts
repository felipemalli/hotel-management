import { z } from 'zod'

import { requiredString } from '@/lib/forms'

import type { CreateReservationPayload } from './types'

// Relógio injetado: `today` vem do chamador, nunca do ambiente daqui. As datas
// `YYYY-MM-DD` são comparadas lexicalmente, então nenhuma passa pelo construtor
// de `Date` (o porquê está em `lib/dates`).
export function reservationFormSchema(today: string) {
  return z
    .object({
      guest_id: z.number(),
      checkin_date: requiredString(),
      checkout_date: requiredString(),
      has_vehicle: z.boolean(),
    })
    .superRefine((value, ctx) => {
      const { checkin_date: checkin, checkout_date: checkout } = value
      if (!checkin || !checkout) return

      if (checkin < today) {
        ctx.addIssue({
          code: 'custom',
          path: ['checkin_date'],
          message: 'A reserva não pode começar no passado.',
        })
      }

      if (checkout <= checkin) {
        ctx.addIssue({
          code: 'custom',
          path: ['checkout_date'],
          message: 'A saída deve ser depois da entrada (mínimo de 1 noite).',
        })
      }
    }) satisfies z.ZodType<CreateReservationPayload>
}
