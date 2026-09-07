import { describe, expect, it } from 'vitest'

import {
  ANA_CANCELLED,
  ANA_PENDING,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
  CARLA_PAID,
  reservation,
} from './__fixtures__/reservations'
import {
  checkoutAlert,
  type CheckoutClock,
  paymentLabel,
  peopleCount,
  RESERVATION_STATUS_LABELS,
} from './status'

describe('peopleCount', () => {
  it('conta o titular e os acompanhantes', () => {
    expect(peopleCount(ANA_PENDING)).toBe(1)
    expect(peopleCount(BRUNO_CHECKED_IN)).toBe(2)
  })
})

describe('paymentLabel', () => {
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

describe('checkoutAlert', () => {
  const clock = (time: string): CheckoutClock => ({
    today: '2026-09-05',
    time,
    checkoutLimit: '12:00',
  })

  it('alerta quem sai hoje e vira atraso depois do limite', () => {
    expect(checkoutAlert(BRUNO_CHECKED_IN, clock('09:30:00'))).toBe('due')
    expect(checkoutAlert(BRUNO_CHECKED_IN, clock('11:59:59'))).toBe('due')
    expect(checkoutAlert(BRUNO_CHECKED_IN, clock('12:00:01'))).toBe('overdue')
  })

  it('nao acusa atraso as 12:00:00 em ponto', () => {
    expect(checkoutAlert(BRUNO_CHECKED_IN, clock('12:00:00'))).toBe('due')
  })

  it('mantem o vermelho de quem passou da data contratada', () => {
    const overstay = reservation({ ...BRUNO_CHECKED_IN, checkout_date: '2026-09-04' })

    expect(checkoutAlert(overstay, clock('08:00:00'))).toBe('overdue')
  })

  it('nao alerta quem sai depois de hoje', () => {
    const later = reservation({ ...BRUNO_CHECKED_IN, checkout_date: '2026-09-06' })

    expect(checkoutAlert(later, clock('23:00:00'))).toBeNull()
  })

  it('so alerta quem esta no hotel', () => {
    const dueToday = { checkout_date: '2026-09-05' }

    expect(
      checkoutAlert(reservation({ ...ANA_PENDING, ...dueToday }), clock('18:00:00')),
    ).toBeNull()
    expect(
      checkoutAlert(reservation({ ...CARLA_CHECKED_OUT, ...dueToday }), clock('18:00:00')),
    ).toBeNull()
    expect(
      checkoutAlert(reservation({ ...ANA_CANCELLED, ...dueToday }), clock('18:00:00')),
    ).toBeNull()
  })

  it('nao alerta enquanto a politica vigente nao chegou', () => {
    expect(checkoutAlert(BRUNO_CHECKED_IN, null)).toBeNull()
  })
})
