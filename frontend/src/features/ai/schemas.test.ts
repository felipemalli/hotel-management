import { describe, expect, it } from 'vitest'

import { aiStatusSchema, copilotReplySchema } from './schemas'

describe('aiStatusSchema', () => {
  it('aceita o portao booleano e recusa qualquer outra forma', () => {
    expect(aiStatusSchema.parse({ enabled: false })).toEqual({ enabled: false })
    expect(aiStatusSchema.safeParse({ enabled: 'false' }).success).toBe(false)
    expect(aiStatusSchema.safeParse({}).success).toBe(false)
  })
})

describe('copilotReplySchema', () => {
  it('aceita a resposta sem acao proposta', () => {
    const parsed = copilotReplySchema.parse({ reply: 'Tudo calmo.', proposed_action: null })

    expect(parsed.proposed_action).toBeNull()
  })

  it.each(['check_in', 'checkout'] as const)('aceita a acao %s com o nome do hospede', (type) => {
    const parsed = copilotReplySchema.parse({
      reply: 'Achei a reserva.',
      proposed_action: { type, reservation_id: 7, guest_name: 'Ana Souza' },
    })

    expect(parsed.proposed_action).toEqual({
      type,
      reservation_id: 7,
      guest_name: 'Ana Souza',
    })
  })

  it.each([
    ['acao fora do contrato', { type: 'cancel', reservation_id: 7, guest_name: 'Ana Souza' }],
    ['id que nao e inteiro', { type: 'check_in', reservation_id: 7.5, guest_name: 'Ana Souza' }],
    ['sem o nome do hospede', { type: 'check_in', reservation_id: 7 }],
  ])('recusa %s', (_label, proposed_action) => {
    expect(copilotReplySchema.safeParse({ reply: 'ok', proposed_action }).success).toBe(false)
  })

  it('recusa a resposta sem texto ou sem a chave da acao', () => {
    expect(copilotReplySchema.safeParse({ proposed_action: null }).success).toBe(false)
    expect(copilotReplySchema.safeParse({ reply: 'ok' }).success).toBe(false)
  })
})
