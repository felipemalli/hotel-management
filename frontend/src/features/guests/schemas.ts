import { z } from 'zod'

import { requiredString } from '@/lib/forms'
import {
  DOCUMENT_MIN_LENGTH,
  normalizeDocument,
  normalizePhone,
  PHONE_MIN_LENGTH,
} from '@/lib/normalize'
import { isoDate, isoDateTime, paginated } from '@/lib/schemas'

import type { CreateGuestPayload } from './types'

// `document` e `phone` chegam normalizados da API: documento alfanumérico
// maiúsculo, telefone só dígitos. A máscara de exibição é de `lib/pii.ts`.
export const guestSchema = z.object({
  id: z.number().int(),
  full_name: z.string(),
  document: z.string(),
  phone: z.string(),
  created_at: isoDateTime,
})

export const reservationSummarySchema = z.object({
  id: z.number().int(),
  checkin_date: isoDate,
  checkout_date: isoDate,
  has_vehicle: z.boolean(),
  checked_in_at: isoDateTime.nullable(),
})

export const guestInHotelSchema = guestSchema.extend({
  active_reservation: reservationSummarySchema,
})

export const guestPendingCheckinSchema = guestSchema.extend({
  pending_reservations: z.array(reservationSummarySchema),
})

export const guestPageSchema = paginated(guestSchema)
export const guestInHotelPageSchema = paginated(guestInHotelSchema)
export const guestPendingCheckinPageSchema = paginated(guestPendingCheckinSchema)

export const guestFormSchema = z.object({
  full_name: requiredString(),
  document: requiredString().refine(
    (value) => normalizeDocument(value).length >= DOCUMENT_MIN_LENGTH,
    { error: `Documento exige ao menos ${DOCUMENT_MIN_LENGTH} caracteres alfanuméricos.` },
  ),
  phone: requiredString().refine((value) => normalizePhone(value).length >= PHONE_MIN_LENGTH, {
    error: `Telefone exige ao menos ${PHONE_MIN_LENGTH} dígitos.`,
  }),
}) satisfies z.ZodType<CreateGuestPayload>
