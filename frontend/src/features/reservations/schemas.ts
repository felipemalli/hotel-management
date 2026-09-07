import { z } from 'zod'

import { roomSummarySchema } from '@/features/rooms/schemas'
import { isoDate, isoDateTime, moneyString, paginated, userRefSchema } from '@/lib/api/schemas'
import { requiredString } from '@/lib/forms/forms'

import type { CreateReservationPayload, ReservationFormValues } from './types'

export const reservationStatusSchema = z.enum(['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'])

export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'PIX', 'OTHER'])

export const guestRefSchema = z.object({ id: z.number().int(), full_name: z.string() })

export const accountStatusSchema = z.enum(['OPEN', 'CLOSED', 'PAID'])

export const paymentSchema = z.object({
  paid_at: isoDateTime,
  method: paymentMethodSchema,
  received_by: userRefSchema,
})

// Toda a conta da estadia: aberta no check-in, fechada no checkout, paga depois.
export const accountSchema = z.object({
  id: z.number().int(),
  status: accountStatusSchema,
  total_amount: moneyString.nullable(),
  opened_at: isoDateTime,
  closed_at: isoDateTime.nullable(),
  payment: paymentSchema.nullable(),
})

// Monetário é string decimal ("120.00"), nunca number.
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
  // null fora de CHECKED_IN/CHECKED_OUT: antes do check-in não existe conta.
  account: accountSchema.nullable(),
  created_at: isoDateTime,
  created_by: userRefSchema.nullable(),
  checked_in_by: userRefSchema.nullable(),
  checked_out_by: userRefSchema.nullable(),
  cancelled_by: userRefSchema.nullable(),
})

export const billLineSchema = z.object({
  date: isoDate,
  weekday: z.string(),
  daily_rate: moneyString,
  parking_fee: moneyString,
})

export const lateFeeDaySchema = z.object({
  date: isoDate,
  weekday: z.string(),
  base_rate: moneyString,
  amount: moneyString,
})

// União discriminada: multa cobrada sem os dias era estado impossível que escondia cobrança.
export const lateFeeSchema = z.discriminatedUnion('applied', [
  z.object({
    applied: z.literal(true),
    amount: moneyString,
    days: z.array(lateFeeDaySchema).nonempty(),
  }),
  z.object({
    applied: z.literal(false),
    amount: moneyString,
    days: z.array(lateFeeDaySchema).max(0),
  }),
])

export const reservationPageSchema = paginated(reservationSchema)

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
  // null = conta em aberto: a tela ramifica por isto, não pelo status.
  payment: paymentSchema.nullable(),
})

export const ROOM_REQUIRED_MESSAGE = 'Escolha um quarto.'

// today vem do chamador. Datas YYYY-MM-DD comparadas lexicalmente (ver lib/format/dates).
export function reservationFormSchema(today: string) {
  return z
    .object({
      guest_id: z.number(),
      // null = ainda não escolhi; o refine estreita a saída para number.
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
