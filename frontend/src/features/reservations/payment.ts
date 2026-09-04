import { paymentMethodSchema } from './schemas'
import type { PaymentMethod } from './types'

export const PAYMENT_METHODS = paymentMethodSchema.options

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  PIX: 'Pix',
  OTHER: 'Outro',
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return paymentMethodSchema.safeParse(value).success
}
