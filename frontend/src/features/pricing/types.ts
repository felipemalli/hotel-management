import type { z } from 'zod'

import type { pricingPolicySchema } from './schemas'

export type PricingPolicy = z.infer<typeof pricingPolicySchema>

// Sete decimais/horários já normalizados, mais a nota: é o que a API recebe.
export interface CreatePolicyPayload {
  weekday_rate: string
  weekend_rate: string
  weekday_park: string
  weekend_park: string
  late_fee_factor: string
  checkin_opens: string
  checkout_limit: string
  note: string
}

// O que está nos campos: texto cru ("120,5") antes da normalização.
export type PolicyFormValues = CreatePolicyPayload
