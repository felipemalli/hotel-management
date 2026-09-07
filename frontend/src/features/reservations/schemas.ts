import { z } from 'zod'

import { roomSummarySchema } from '@/features/rooms/schemas'
import { isoDate, isoDateTime, moneyString, paginated, userRefSchema } from '@/lib/api/schemas'
import { requiredString } from '@/lib/forms/forms'

import type { CreateReservationPayload, ReservationFormValues } from './types'

export const reservationStatusSchema = z.enum(['PENDING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'])

export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'PIX', 'OTHER'])

// Espelha `RESERVATION_ORDERINGS` do servidor; a ordenação é dele, não da tabela.
export const reservationOrderingSchema = z.enum([
  'checkin_date',
  '-checkin_date',
  'checkout_date',
  '-checkout_date',
])

export const guestRefSchema = z.object({ id: z.number().int(), full_name: z.string() })

export const accountStatusSchema = z.enum(['OPEN', 'CLOSED', 'PAID'])

export const paymentSchema = z.object({
  paid_at: isoDateTime,
  method: paymentMethodSchema,
  received_by: userRefSchema,
})

export const accountSchema = z.object({
  id: z.number().int(),
  status: accountStatusSchema,
  total_amount: moneyString.nullable(),
  opened_at: isoDateTime,
  closed_at: isoDateTime.nullable(),
  payment: paymentSchema.nullable(),
})

export const reservationSchema = z.object({
  id: z.number().int(),
  guest_id: z.number().int(),
  companions: z.array(guestRefSchema),
  room: roomSummarySchema.extend({ capacity: z.number().int() }),
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

export const COMPANION_UNRESOLVED_MESSAGE = 'Selecione um hóspede cadastrado ou limpe a busca.'

// `today` vem do chamador: datas YYYY-MM-DD comparam-se lexicalmente.
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
      companion_draft: z.string(),
      checkin_date: requiredString(),
      checkout_date: requiredString(),
      has_vehicle: z.boolean(),
    })
    .superRefine((value, ctx) => {
      if (value.companion_draft.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['companion_ids'],
          message: COMPANION_UNRESOLVED_MESSAGE,
        })
      }

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
    })
    .transform((value) => ({
      guest_id: value.guest_id,
      room_id: value.room_id,
      companion_ids: value.companion_ids,
      checkin_date: value.checkin_date,
      checkout_date: value.checkout_date,
      has_vehicle: value.has_vehicle,
    })) satisfies z.ZodType<CreateReservationPayload, ReservationFormValues>
}
