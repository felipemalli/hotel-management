import { describe, expect, it } from 'vitest'

import {
  ANA_CANCELLED,
  ANA_PENDING,
  BRUNO_CHECKED_IN,
  CARLA_CHECKED_OUT,
  CARLA_PAID,
  reservation,
} from './__fixtures__/reservations'
import { describeEntry, historyEntries } from './history'

function labels(entries: ReturnType<typeof historyEntries>) {
  return entries.map((entry) => entry.label)
}

describe('historyEntries', () => {
  // Uma linha nula e uma transicao que nao aconteceu: o historico mostra o que
  // houve, e nunca uma lacuna a preencher.
  it('mostra so as transicoes que aconteceram, em ordem', () => {
    expect(labels(historyEntries(ANA_PENDING))).toEqual(['Criada'])
    expect(labels(historyEntries(BRUNO_CHECKED_IN))).toEqual(['Criada', 'Check-in'])
    expect(labels(historyEntries(CARLA_CHECKED_OUT))).toEqual(['Criada', 'Check-in', 'Checkout'])
    expect(labels(historyEntries(CARLA_PAID))).toEqual([
      'Criada',
      'Check-in',
      'Checkout',
      'Pagamento (Pix)',
    ])
    expect(labels(historyEntries(ANA_CANCELLED))).toEqual(['Criada', 'Cancelamento'])
  })

  it('nomeia o pagamento sem a forma quando ela nao veio', () => {
    const withoutMethod = reservation({
      ...CARLA_PAID,
      payment_method: null,
    })

    expect(labels(historyEntries(withoutMethod))).toContain('Pagamento')
  })
})

describe('describeEntry', () => {
  it('diz o que houve, quando e por quem', () => {
    const [created] = historyEntries(ANA_PENDING)

    expect(created && describeEntry(created)).toBe('Criada em 01/09/2026 08:00 por atendente')
  })

  it('atribui ao sistema o que nao tem ator', () => {
    const [created] = historyEntries(reservation({ created_by: null }))

    expect(created && describeEntry(created)).toBe('Criada em 01/09/2026 08:00 por sistema')
  })
})
