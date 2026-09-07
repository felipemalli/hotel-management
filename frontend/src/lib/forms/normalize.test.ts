import { describe, expect, it } from 'vitest'

import {
  applyBrPhoneMask,
  brPhoneToInternational,
  isCompleteBrNationalPhone,
  isInternationalPhone,
  normalizeDocument,
  normalizePhone,
  withLeadingPlus,
} from './normalize'

describe('normalizeDocument', () => {
  it('remove pontuacao e mantem os digitos do CPF', () => {
    expect(normalizeDocument('123.456.789-01')).toBe('12345678901')
  })

  it('caixa alta o passaporte alfanumerico', () => {
    expect(normalizeDocument('ab123456')).toBe('AB123456')
  })

  it('normaliza tambem um fragmento de busca mascarado', () => {
    expect(normalizeDocument('789-01')).toBe('78901')
    expect(normalizeDocument('.-/')).toBe('')
  })
})

describe('normalizePhone', () => {
  it('mantem so os digitos do telefone com mascara', () => {
    expect(normalizePhone('(21) 98888-7777')).toBe('21988887777')
    expect(normalizePhone('(21) 98888')).toBe('2198888')
  })
})

describe('withLeadingPlus', () => {
  it('prefixa o mais quando o valor nao tem', () => {
    expect(withLeadingPlus('55 21 98888-7777')).toBe('+55 21 98888-7777')
    expect(withLeadingPlus('  54 11 5555-4444  ')).toBe('+54 11 5555-4444')
  })

  it('nao duplica o mais ja digitado', () => {
    expect(withLeadingPlus('+55 21 98888-7777')).toBe('+55 21 98888-7777')
  })
})

describe('applyBrPhoneMask', () => {
  it('aplica a mascara progressiva com o DDI 55', () => {
    expect(applyBrPhoneMask('')).toBe('')
    expect(applyBrPhoneMask('55')).toBe('55')
    expect(applyBrPhoneMask('2')).toBe('55 (2')
    expect(applyBrPhoneMask('21')).toBe('55 (21')
    expect(applyBrPhoneMask('219888')).toBe('55 (21) 9888')
    expect(applyBrPhoneMask('2198887777')).toBe('55 (21) 9888-7777')
    expect(applyBrPhoneMask('21988887777')).toBe('55 (21) 98888-7777')
  })

  it('mantem o DDI 55 quando o valor ja veio internacional', () => {
    expect(applyBrPhoneMask('5521988887777')).toBe('55 (21) 98888-7777')
    expect(applyBrPhoneMask('+55 21 98888-7777')).toBe('55 (21) 98888-7777')
  })

  it('corta o excesso depois do celular', () => {
    expect(applyBrPhoneMask('21988887777888')).toBe('55 (21) 98888-7777')
  })
})

describe('brPhoneToInternational', () => {
  it('prefixa o mais na mascara com DDI 55', () => {
    expect(brPhoneToInternational('(21) 98888-7777')).toBe('+55 (21) 98888-7777')
    expect(brPhoneToInternational('5521988887777')).toBe('+55 (21) 98888-7777')
  })
})

describe('isCompleteBrNationalPhone', () => {
  it('aceita fixo de 10 e celular de 11 digitos', () => {
    expect(isCompleteBrNationalPhone('(21) 9888-7777')).toBe(true)
    expect(isCompleteBrNationalPhone('(21) 98888-7777')).toBe(true)
  })

  it('recusa numero incompleto ou ja com DDI', () => {
    expect(isCompleteBrNationalPhone('98888-7777')).toBe(false)
    expect(isCompleteBrNationalPhone('55 21 98888-7777')).toBe(false)
  })
})

describe('isInternationalPhone', () => {
  it('aceita o numero com codigo do pais e digitos suficientes', () => {
    expect(isInternationalPhone('+55 21 98888-7777')).toBe(true)
    expect(isInternationalPhone('  +54 11 5555-4444  ')).toBe(true)
    expect(isInternationalPhone('55 21 98888-7777')).toBe(true)
  })

  it('recusa o numero sem o codigo do pais', () => {
    expect(isInternationalPhone('(21) 98888-7777')).toBe(false)
    expect(isInternationalPhone('21988887777')).toBe(false)
  })

  it('recusa o numero curto demais para qualquer plano', () => {
    expect(isInternationalPhone('+55 21')).toBe(false)
    expect(isInternationalPhone('55 21')).toBe(false)
  })
})
