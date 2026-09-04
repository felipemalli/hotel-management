import { describe, expect, it } from 'vitest'

import { BOOTSTRAP_POLICY, HIGH_SEASON_POLICY } from './__fixtures__/policies'
import {
  CHECKOUT_LIMIT_MESSAGE,
  policyFormSchema,
  policyToFormValues,
  pricingPolicySchema,
} from './schemas'

const FILLED = {
  weekday_rate: '120',
  weekend_rate: '180',
  weekday_park: '15',
  weekend_park: '20',
  late_fee_factor: '0,5',
  checkin_opens: '14:00',
  checkout_limit: '12:00',
  note: '',
}

function firstMessage(input: Record<string, string>) {
  return policyFormSchema.safeParse(input).error?.issues[0]?.message
}

describe('pricingPolicySchema', () => {
  it('aceita a fixture do bootstrap e a da alta temporada', () => {
    expect(pricingPolicySchema.safeParse(BOOTSTRAP_POLICY).success).toBe(true)
    expect(pricingPolicySchema.safeParse(HIGH_SEASON_POLICY).success).toBe(true)
  })

  it('recusa fator fora das quatro casas e horario com segundos', () => {
    expect(
      pricingPolicySchema.safeParse({ ...BOOTSTRAP_POLICY, late_fee_factor: '0.5' }).success,
    ).toBe(false)
    expect(
      pricingPolicySchema.safeParse({ ...BOOTSTRAP_POLICY, checkin_opens: '14:00:00' }).success,
    ).toBe(false)
    expect(pricingPolicySchema.safeParse({ ...BOOTSTRAP_POLICY, weekday_rate: 120 }).success).toBe(
      false,
    )
  })
})

describe('policyFormSchema', () => {
  it('test_normalizes_money_and_factor', () => {
    const parsed = policyFormSchema.parse({
      ...FILLED,
      weekday_rate: '150,5',
      late_fee_factor: '0,25',
    })

    expect(parsed.weekday_rate).toBe('150.50')
    expect(parsed.weekend_rate).toBe('180.00')
    expect(parsed.late_fee_factor).toBe('0.2500')
  })

  // Arredondar seria aritmética, e o admin precisa ver o que digitou.
  it('recusa mais casas do que o contrato aceita, em vez de arredondar', () => {
    expect(firstMessage({ ...FILLED, weekday_rate: '12.345' })).toBe(
      'Informe um valor como 120 ou 120,50 (até dois centavos).',
    )
    expect(firstMessage({ ...FILLED, late_fee_factor: '0,50000' })).toBe(
      'Informe o fator como 0,5 ou 0,25 (até quatro casas).',
    )
  })

  it('recusa valor negativo e nota longa demais', () => {
    expect(firstMessage({ ...FILLED, weekday_rate: '-90' })).toBe('O valor não pode ser negativo.')
    expect(firstMessage({ ...FILLED, note: 'x'.repeat(201) })).toBe(
      'Nota com no máximo 200 caracteres.',
    )
  })

  it('so avisa do obrigatorio quando o campo esta vazio', () => {
    const result = policyFormSchema.safeParse({ ...FILLED, weekday_rate: '' })

    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toBe('Campo obrigatório.')
  })

  // O servidor recusa só `checkout_limit > checkin_opens`: a igualdade passa.
  it('barra o limite de checkout depois da abertura e aceita a igualdade', () => {
    const late = policyFormSchema.safeParse({ ...FILLED, checkout_limit: '15:00' })

    expect(late.error?.issues).toEqual([
      expect.objectContaining({ path: ['checkout_limit'], message: CHECKOUT_LIMIT_MESSAGE }),
    ])
    expect(
      policyFormSchema.safeParse({ ...FILLED, checkin_opens: '12:00', checkout_limit: '12:00' })
        .success,
    ).toBe(true)
  })
})

describe('policyToFormValues', () => {
  it('mostra a vigente em notacao brasileira e deixa a nota vazia', () => {
    expect(policyToFormValues(BOOTSTRAP_POLICY)).toEqual({
      weekday_rate: '120,00',
      weekend_rate: '180,00',
      weekday_park: '15,00',
      weekend_park: '20,00',
      late_fee_factor: '0,5000',
      checkin_opens: '14:00',
      checkout_limit: '12:00',
      note: '',
    })
  })
})
