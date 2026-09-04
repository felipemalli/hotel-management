import { z } from 'zod'

import { roomSummarySchema } from '@/features/rooms/schemas'
import { isoDate, isoDateTime, moneyString, paginated, userRefSchema } from '@/lib/api/schemas'
import { requiredString } from '@/lib/forms/forms'

import type { CreateReservationPayload, ReservationFormValues } from './types'

export const reservationStatusSchema = z.enum(['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'])

export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'PIX', 'OTHER'])

export const guestRefSchema = z.object({ id: z.number().int(), full_name: z.string() })

// Todo campo monetário é string decimal ("120.00"), nunca `number`: o valor
// atravessa o frontend sem passar por ponto flutuante.
export const reservationSchema = z.object({
  id: z.number().int(),
  guest_id: z.number().int(),
  companions: z.array(guestRefSchema),
  room: roomSummarySchema,
  policy_id: z.number().int().nullable(),
  checkin_date: isoDate,
  checkout_date: isoDate,
  has_vehicle: z.boolean(),
  status: reservationStatusSchema,
  checked_in_at: isoDateTime.nullable(),
  checked_out_at: isoDateTime.nullable(),
  cancelled_at: isoDateTime.nullable(),
  total_daily: moneyString.nullable(),
  total_parking: moneyString.nullable(),
  late_fee: moneyString.nullable(),
  late_fee_base: moneyString.nullable(),
  total_amount: moneyString.nullable(),
  paid_at: isoDateTime.nullable(),
  payment_method: paymentMethodSchema.nullable(),
  created_at: isoDateTime,
  // Cada transição acontece uma vez, e a coluna com o seu `*_at` ao lado é o
  // histórico com ator: é o que a tela de detalhe lê.
  created_by: userRefSchema.nullable(),
  checked_in_by: userRefSchema.nullable(),
  checked_out_by: userRefSchema.nullable(),
  cancelled_by: userRefSchema.nullable(),
  paid_by: userRefSchema.nullable(),
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

export const reservationPageSchema = paginated(reservationSchema)

export const paymentSchema = z.object({
  paid_at: isoDateTime,
  method: paymentMethodSchema,
  paid_by: userRefSchema,
})

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
  // `null` é "conta em aberto": a tela ramifica por isto, e não pelo status —
  // pagamento não é status, `CHECKED_OUT` segue terminal (D18).
  payment: paymentSchema.nullable(),
})

export const ROOM_REQUIRED_MESSAGE = 'Escolha um quarto.'

// Relógio injetado: `today` vem do chamador, nunca do ambiente daqui. As datas
// `YYYY-MM-DD` são comparadas lexicalmente, então nenhuma passa pelo construtor
// de `Date` (o porquê está em `lib/dates`).
export function reservationFormSchema(today: string) {
  return z
    .object({
      guest_id: z.number(),
      // `null` é "ainda não escolhi". O refine com predicado estreita a saída
      // para `number`, então o que sai do submit já é o payload da API.
      room_id: z
        .number()
        .int()
        .nullable()
        .refine((value): value is number => value !== null, { error: ROOM_REQUIRED_MESSAGE }),
      companion_ids: z.array(z.number().int()),
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
    }) satisfies z.ZodType<CreateReservationPayload, ReservationFormValues>
}
