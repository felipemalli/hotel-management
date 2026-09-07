import { z } from 'zod'

import { roomSummarySchema } from '@/features/rooms/schemas'
import { isoDate, isoDateTime, paginated } from '@/lib/api/schemas'
import { isCountryCode } from '@/lib/format/countries'
import { requiredString } from '@/lib/forms/forms'
import {
  brPhoneToInternational,
  DOCUMENT_MIN_LENGTH,
  isCompleteBrNationalPhone,
  isInternationalPhone,
  normalizeDocument,
  withLeadingPlus,
} from '@/lib/forms/normalize'

import type { CreateGuestPayload } from './types'

export const guestSchema = z.object({
  id: z.number().int(),
  full_name: z.string(),
  document: z.string(),
  phone: z.string(),
  // string, não enum: código novo no servidor não pode derrubar a listagem em CONTRACT_ERROR.
  nationality: z.string(),
  created_at: isoDateTime,
})

export const reservationSummarySchema = z.object({
  id: z.number().int(),
  // Titular. Acompanhante é a linha cujo guest_id é outra pessoa (sem campo de papel).
  guest_id: z.number().int(),
  room: roomSummarySchema,
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

export const PHONE_HINT = 'Com código do país, ex.: 55 21 98888-7777.'

export const BR_PHONE_HINT = 'DDI 55, DDD e número, ex.: 55 (21) 98888-7777.'

export const PHONE_FORMAT_MESSAGE =
  'Informe o telefone com o código do país, ex.: 55 21 98888-7777.'

export const NATIONALITY_MESSAGE = 'Selecione a nacionalidade.'

function submittedPhone(phone: string, nationality: string): string {
  return nationality === 'BR' ? brPhoneToInternational(phone) : withLeadingPlus(phone)
}

export const guestFormSchema = z
  .object({
    full_name: requiredString(),
    document: requiredString().refine(
      (value) => normalizeDocument(value).length >= DOCUMENT_MIN_LENGTH,
      { error: `Documento exige ao menos ${DOCUMENT_MIN_LENGTH} caracteres alfanuméricos.` },
    ),
    phone: requiredString().refine(
      (value) => isInternationalPhone(value) || isCompleteBrNationalPhone(value),
      { error: PHONE_FORMAT_MESSAGE },
    ),
    // requiredString + refine, não z.enum: o enum listaria as 249 opções na mensagem.
    nationality: requiredString().refine(isCountryCode, { error: NATIONALITY_MESSAGE }),
  })
  .superRefine((data, ctx) => {
    if (data.nationality === 'BR' || isInternationalPhone(data.phone)) return
    if (isCompleteBrNationalPhone(data.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: PHONE_FORMAT_MESSAGE })
    }
  })
  .transform((data) => ({
    ...data,
    phone: submittedPhone(data.phone, data.nationality),
  })) satisfies z.ZodType<CreateGuestPayload>
