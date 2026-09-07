import type { z } from 'zod'

import type { pricingPolicySchema, stayQuoteSchema } from './schemas'

export type PricingPolicy = z.infer<typeof pricingPolicySchema>

export type StayQuote = z.infer<typeof stayQuoteSchema>

export interface StayQuoteQuery {
  checkin_date: string
  checkout_date: string
  has_vehicle: boolean
}

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

export type PolicyFormValues = CreatePolicyPayload
