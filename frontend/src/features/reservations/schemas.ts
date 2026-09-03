import { z } from 'zod'

import { requiredString } from '@/lib/forms'
import { isoDate, isoDateTime, moneyString } from '@/lib/schemas'

import type { CreateReservationPayload } from './types'

export const reservationStatusSchema = z.enum(['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'])

// Todo campo monetário é string decimal ("120.00"), nunca `number`: o valor
// atravessa o frontend sem passar por ponto flutuante.
export const reservationSchema = z.object({
  id: z.number().int(),
  guest_id: z.number().int(),
  checkin_date: isoDate,
  checkout_date: isoDate,
  has_vehicle: z.boolean(),
  status: reservationStatusSchema,
  checked_in_at: isoDateTime.nullable(),
  checked_out_at: isoDateTime.nullable(),
  total_daily: moneyString.nullable(),
  total_parking: moneyString.nullable(),
  late_fee: moneyString.nullable(),
  total_amount: moneyString.nullable(),
  created_at: isoDateTime,
})

export const billLineSchema = z.object({
  date: isoDate,
  weekday: z.string(),
  daily_rate: moneyString,
  parking_fee: moneyString,
})

// União discriminada, e não `applied: boolean` com `base_rate` opcional: multa
// cobrada sem a tarifa que a originou é estado impossível, e era o que fazia a
// tela esconder uma cobrança que o total já incluía.
export const lateFeeSchema = z.discriminatedUnion('applied', [
  z.object({ applied: z.literal(true), base_rate: moneyString, amount: moneyString }),
  z.object({ applied: z.literal(false), base_rate: z.null(), amount: moneyString }),
])

export const checkoutStatementSchema = z.object({
  reservation_id: z.number().int(),
  guest: z.object({ id: z.number().int(), full_name: z.string() }),
  checked_in_at: isoDateTime,
  checked_out_at: isoDateTime,
  lines: z.array(billLineSchema),
  subtotal_daily: moneyString,
  subtotal_parking: moneyString,
  late_fee: lateFeeSchema,
  total: moneyString,
})

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
