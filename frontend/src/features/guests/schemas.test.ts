import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it } from 'vitest'

import { ANA, BRUNO, inHotel, pendingCheckin } from './__fixtures__/guests'
import {
  guestFormSchema,
  guestInHotelPageSchema,
  guestPageSchema,
  guestPendingCheckinPageSchema,
  NATIONALITY_MESSAGE,
  PHONE_FORMAT_MESSAGE,
} from './schemas'

const VALID = {
  full_name: 'Ana Souza',
  document: '123.456.789-01',
  phone: '+55 21 98888-7777',
  nationality: 'BR',
}

describe('guestFormSchema', () => {
  it('aceita nome, documento, telefone com DDI e nacionalidade validos', () => {
    expect(guestFormSchema.safeParse(VALID).success).toBe(true)
  })

  it('devolve exatamente um problema por campo vazio, nunca dois', () => {
    const result = guestFormSchema.safeParse({
      full_name: '',
      document: '',
      phone: '',
      nationality: '',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(4)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Campo obrigatório.',
      'Campo obrigatório.',
      'Campo obrigatório.',
      'Campo obrigatório.',
    ])
  })

  it('barra documento curto demais apos normalizar', () => {
    const result = guestFormSchema.safeParse({ ...VALID, document: 'a-1' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Documento exige ao menos 4 caracteres alfanuméricos.',
    )
  })

  it('barra telefone sem o codigo do pais com a frase do servidor', () => {
    const result = guestFormSchema.safeParse({ ...VALID, phone: '(21) 98888-7777' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(PHONE_FORMAT_MESSAGE)
  })

  it('barra telefone curto demais mesmo com o DDI', () => {
    const result = guestFormSchema.safeParse({ ...VALID, phone: '+55 21' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(PHONE_FORMAT_MESSAGE)
  })

  it('barra nacionalidade fora da lista ISO', () => {
    const result = guestFormSchema.safeParse({ ...VALID, nationality: 'ZZ' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(NATIONALITY_MESSAGE)
  })
})

// O teste normativo do formulario espera exatamente tres avisos de obrigatorio
// no submit vazio: o resolver e quem traduz os problemas do schema em erros por
// campo, e um `abort` esquecido apareceria aqui como duas mensagens no mesmo.
describe('guestFormSchema pelo resolver do formulario', () => {
  it('devolve uma unica mensagem por campo vazio', async () => {
    const resolver = zodResolver(guestFormSchema)

    const { errors, values } = await resolver(
      { full_name: '', document: '', phone: '', nationality: '' },
      undefined,
      { fields: {}, shouldUseNativeValidation: false },
    )

    expect(values).toEqual({})
    expect(Object.keys(errors)).toEqual(['full_name', 'document', 'phone', 'nationality'])
    expect(errors.full_name?.message).toBe('Campo obrigatório.')
    expect(errors.document?.message).toBe('Campo obrigatório.')
    expect(errors.phone?.message).toBe('Campo obrigatório.')
    expect(errors.nationality?.message).toBe('Campo obrigatório.')
  })

  it('mantem a mensagem de formato quando o documento e curto demais', async () => {
    const resolver = zodResolver(guestFormSchema)

    const { errors } = await resolver({ ...VALID, document: 'a-1' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    })

    expect(errors.document?.message).toBe('Documento exige ao menos 4 caracteres alfanuméricos.')
    expect(errors.phone).toBeUndefined()
  })
})

describe('schemas de resposta dos hospedes', () => {
  function envelope<T>(results: T[]) {
    return { count: results.length, next: null, previous: null, results }
  }

  it('aceita as tres formas que as abas consomem', () => {
    expect(guestPageSchema.safeParse(envelope([ANA, BRUNO])).success).toBe(true)
    expect(guestInHotelPageSchema.safeParse(envelope([inHotel(ANA)])).success).toBe(true)
    expect(guestPendingCheckinPageSchema.safeParse(envelope([pendingCheckin(BRUNO)])).success).toBe(
      true,
    )
  })

  it('recusa a listagem sem o envelope de paginacao', () => {
    expect(guestPageSchema.safeParse([ANA]).success).toBe(false)
    expect(guestPageSchema.safeParse({ results: [ANA] }).success).toBe(false)
  })

  it('recusa hospede sem a reserva que a aba promete', () => {
    expect(guestInHotelPageSchema.safeParse(envelope([ANA])).success).toBe(false)
  })
})
