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

// A ponte schema → RHF (resolver do zod) e provada pelo teste normativo de
// GuestForm, que submete o formulario real; testar o resolver aqui em cima
// repetiria o mesmo schema so que por outra porta.
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
