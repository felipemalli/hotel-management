import { z } from 'zod'

import { requiredString } from '@/lib/forms'
import {
  DOCUMENT_MIN_LENGTH,
  normalizeDocument,
  normalizePhone,
  PHONE_MIN_LENGTH,
} from '@/lib/normalize'

import type { CreateGuestPayload } from './types'

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
