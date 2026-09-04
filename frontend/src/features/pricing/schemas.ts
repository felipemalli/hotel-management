import { z } from 'zod'

import { requiredString } from '@/lib/forms'
import { toDecimalString } from '@/lib/money'
import { factorString, isoDateTime, moneyString, paginated, userRefSchema } from '@/lib/schemas'
import { timeHHMM } from '@/lib/schemas'

import type { CreatePolicyPayload, PolicyFormValues, PricingPolicy } from './types'

export const pricingPolicySchema = z.object({
  id: z.number().int(),
  weekday_rate: moneyString,
  weekend_rate: moneyString,
  weekday_park: moneyString,
  weekend_park: moneyString,
  late_fee_factor: factorString,
  checkin_opens: timeHHMM,
  checkout_limit: timeHHMM,
  effective_from: isoDateTime,
  note: z.string(),
  created_at: isoDateTime,
  created_by: userRefSchema.nullable(),
})

export const pricingPolicyPageSchema = paginated(pricingPolicySchema)

export const NOTE_MAX_LENGTH = 200

// A frase é idêntica à do servidor: uma entrada ruim tem uma mensagem só.
export const CHECKOUT_LIMIT_MESSAGE =
  'O limite de checkout deve ser anterior ao horário de abertura do check-in.'

// O balcão digita "120,5"; o contrato pede "120.50". A conversão é de texto
// (`toDecimalString`), nunca por `Number`, e uma fração mais longa que o
// contrato é recusada em vez de arredondada.
function decimalInput(places: number, invalid: string) {
  return requiredString().transform((value, ctx) => {
    const normalized = toDecimalString(value, places)
    if (normalized === null) {
      ctx.addIssue({ code: 'custom', message: invalid })
      return z.NEVER
    }
    if (normalized.startsWith('-')) {
      ctx.addIssue({ code: 'custom', message: 'O valor não pode ser negativo.' })
      return z.NEVER
    }
    return normalized
  })
}

const moneyInput = decimalInput(2, 'Informe um valor como 120 ou 120,50 (até dois centavos).')
const factorInput = decimalInput(4, 'Informe o fator como 0,5 ou 0,25 (até quatro casas).')
const timeInput = requiredString().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  error: 'Horário no formato HH:MM.',
})

export const policyFormSchema = z
  .object({
    weekday_rate: moneyInput,
    weekend_rate: moneyInput,
    weekday_park: moneyInput,
    weekend_park: moneyInput,
    late_fee_factor: factorInput,
    checkin_opens: timeInput,
    checkout_limit: timeInput,
    note: z.string().max(NOTE_MAX_LENGTH, {
      error: `Nota com no máximo ${NOTE_MAX_LENGTH} caracteres.`,
    }),
  })
  .superRefine((value, ctx) => {
    const { checkin_opens: opens, checkout_limit: limit } = value
    if (!timeHHMM.safeParse(opens).success || !timeHHMM.safeParse(limit).success) return

    // Comparação lexical funciona porque HH:MM é zero-padded. A igualdade é
    // permitida: o servidor recusa só `checkout_limit > checkin_opens`.
    if (limit > opens) {
      ctx.addIssue({ code: 'custom', path: ['checkout_limit'], message: CHECKOUT_LIMIT_MESSAGE })
    }
  }) satisfies z.ZodType<CreatePolicyPayload, PolicyFormValues>

// O admin edita deltas sobre a vigente, em notação brasileira. A nota começa
// vazia: a publicação nova tem a própria justificativa.
export function policyToFormValues(policy: PricingPolicy): PolicyFormValues {
  return {
    weekday_rate: policy.weekday_rate.replace('.', ','),
    weekend_rate: policy.weekend_rate.replace('.', ','),
    weekday_park: policy.weekday_park.replace('.', ','),
    weekend_park: policy.weekend_park.replace('.', ','),
    late_fee_factor: policy.late_fee_factor.replace('.', ','),
    checkin_opens: policy.checkin_opens,
    checkout_limit: policy.checkout_limit,
    note: '',
  }
}
