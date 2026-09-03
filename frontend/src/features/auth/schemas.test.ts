import { describe, expect, it } from 'vitest'

import { credentialsSchema } from './schemas'

describe('credentialsSchema', () => {
  it('aceita usuario e senha preenchidos', () => {
    expect(
      credentialsSchema.safeParse({ username: 'atendente', password: 'atendente123' }).success,
    ).toBe(true)
  })

  it('devolve exatamente um problema por campo vazio, nunca dois', () => {
    const result = credentialsSchema.safeParse({ username: '', password: '' })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(2)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Campo obrigatório.',
      'Campo obrigatório.',
    ])
  })
})
