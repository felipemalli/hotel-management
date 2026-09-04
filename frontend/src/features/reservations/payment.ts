import { paymentMethodSchema } from './schemas'
import type { PaymentMethod } from './types'

export const PAYMENT_METHODS = paymentMethodSchema.options

export function isPaymentMethod(value: string): value is PaymentMethod {
  return paymentMethodSchema.safeParse(value).success
}
