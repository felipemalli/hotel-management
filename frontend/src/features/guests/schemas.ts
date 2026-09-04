import { z } from 'zod'

import { roomSummarySchema } from '@/features/rooms/schemas'
import { isCountryCode } from '@/lib/countries'
import { requiredString } from '@/lib/forms'
import { DOCUMENT_MIN_LENGTH, isInternationalPhone, normalizeDocument } from '@/lib/normalize'
import { isoDate, isoDateTime, paginated } from '@/lib/schemas'

import type { CreateGuestPayload } from './types'

// `document` e `phone` chegam normalizados da API: documento alfanumérico
// maiúsculo, telefone só dígitos. A máscara de exibição é de `lib/pii.ts`.
export const guestSchema = z.object({
  id: z.number().int(),
  full_name: z.string(),
  document: z.string(),
  phone: z.string(),
  // ISO 3166-1 alpha-2, como o servidor grava. `z.string()` e não o enum da
  // lista: um código que o servidor passe a aceitar não pode derrubar a
  // listagem inteira em `CONTRACT_ERROR`, e `countryName` já cai no código.
  nationality: z.string(),
  created_at: isoDateTime,
})

export const reservationSummarySchema = z.object({
  id: z.number().int(),
  // Titular da reserva. Acompanhante é a linha cujo `guest_id` é outra pessoa:
  // o contrato não tem campo de papel, e derivar daqui evita inventá-lo.
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

export const PHONE_HINT = 'Com código do país, ex.: +55 21 98888-7777.'

// A frase é a mesma do servidor: a entrada ruim tem uma mensagem só, venha ela
// do formulário ou do 400.
export const PHONE_FORMAT_MESSAGE =
  'Informe o telefone com o código do país, ex.: +55 21 98888-7777.'

export const NATIONALITY_MESSAGE = 'Selecione a nacionalidade.'

export const guestFormSchema = z.object({
  full_name: requiredString(),
  document: requiredString().refine(
    (value) => normalizeDocument(value).length >= DOCUMENT_MIN_LENGTH,
    { error: `Documento exige ao menos ${DOCUMENT_MIN_LENGTH} caracteres alfanuméricos.` },
  ),
  phone: requiredString().refine(isInternationalPhone, { error: PHONE_FORMAT_MESSAGE }),
  // `requiredString` + refine, e não `z.enum(COUNTRY_CODES)`: o enum daria a
  // mesma mensagem para vazio e para inválido, e a de inválido listaria as 249
  // opções na tela.
  nationality: requiredString().refine(isCountryCode, { error: NATIONALITY_MESSAGE }),
}) satisfies z.ZodType<CreateGuestPayload>
