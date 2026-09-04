import { describe, expect, it } from 'vitest'

import {
  ANA_CANCELLED,
  ANA_PENDING,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
  CARLA_PAID,
} from './__fixtures__/reservations'
import { paymentLabel, peopleCount, RESERVATION_STATUS_LABELS } from './status'

describe('peopleCount', () => {
  it('conta o titular e os acompanhantes', () => {
    expect(peopleCount(ANA_PENDING)).toBe(1)
    expect(peopleCount(BRUNO_CHECKED_IN)).toBe(2)
  })
})

describe('paymentLabel', () => {
  // Antes do checkout nao existe conta: dizer "em aberto" sugeriria cobranca.
  it('nao fala de pagamento antes de haver conta', () => {
    expect(paymentLabel(ANA_PENDING)).toBe('—')
    expect(paymentLabel(BRUNO_CHECKED_IN)).toBe('—')
    expect(paymentLabel(ANA_CANCELLED)).toBe('—')
  })

  it('distingue a conta fechada em aberto da paga', () => {
    expect(paymentLabel(CARLA_CHECKED_OUT)).toBe('Em aberto')
    expect(paymentLabel(CARLA_PAID)).toBe('Pago')
  })
})

describe('RESERVATION_STATUS_LABELS', () => {
  it('traduz os quatro status do contrato', () => {
    expect(Object.values(RESERVATION_STATUS_LABELS)).toEqual([
      'Pendente',
      'No hotel',
      'Finalizada',
      'Cancelada',
    ])
  })
})
