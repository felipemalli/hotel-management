import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ApiError } from '../errors/errors'
import { applyServerErrors, REQUIRED_MESSAGE, requiredString } from './forms'

interface GuestFields {
  document: string
  phone: string
}

const FIELDS: readonly (keyof GuestFields)[] = ['document', 'phone']

describe('requiredString', () => {
  it('reporta so a mensagem de obrigatorio quando o valor esta vazio', () => {
    const result = z.string().min(4).safeParse('')
    expect(result.success).toBe(false)

    const abortResult = requiredString().safeParse('')
    expect(abortResult.success).toBe(false)
    expect(abortResult.error?.issues).toHaveLength(1)
    expect(abortResult.error?.issues[0]?.message).toBe(REQUIRED_MESSAGE)

    expect(requiredString().safeParse('Ana').success).toBe(true)
  })

  it('nao roda um refine encadeado quando o valor esta vazio, gracas ao abort', () => {
    const schema = requiredString().refine((value) => value.length >= 4, {
      error: 'Muito curto.',
    })

    const result = schema.safeParse('')
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toBe(REQUIRED_MESSAGE)
  })
})

describe('applyServerErrors', () => {
  it('devolve false e nao chama setError para um codigo que nao e VALIDATION_ERROR', () => {
    const setError = vi.fn()
    const error = new ApiError({ code: 'DUPLICATE_DOCUMENT', detail: 'Já existe.', status: 409 })

    expect(applyServerErrors(error, setError, FIELDS)).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })

  it('roteia um erro de campo conhecido para o proprio campo', () => {
    const setError = vi.fn()
    const error = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Dados inválidos.',
      status: 400,
      extra: { phone: ['Telefone inválido para a região.'] },
    })

    expect(applyServerErrors(error, setError, FIELDS)).toBe(true)
    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('phone', {
      type: 'server',
      message: 'Telefone inválido para a região.',
    })
  })

  it('ignora lista vazia e aceita a mensagem que vem como string', () => {
    const setError = vi.fn()
    const error = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Dados inválidos.',
      status: 400,
      extra: { document: 'Documento inválido.', phone: [] },
    })

    expect(applyServerErrors(error, setError, FIELDS)).toBe(true)
    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('document', {
      type: 'server',
      message: 'Documento inválido.',
    })
  })

  it('roteia non_field_errors para o erro de raiz', () => {
    const setError = vi.fn()
    const error = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Dados inválidos.',
      status: 400,
      extra: { non_field_errors: ['Combinação de datas inválida.'] },
    })

    expect(applyServerErrors(error, setError, FIELDS)).toBe(true)
    expect(setError).toHaveBeenCalledWith('root.server', {
      type: 'server',
      message: 'Combinação de datas inválida.',
    })
  })

  it('roteia uma chave desconhecida para o erro de raiz em vez de sumir', () => {
    const setError = vi.fn()
    const error = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Dados inválidos.',
      status: 400,
      extra: { has_vehicle: ['Valor inesperado.'] },
    })

    expect(applyServerErrors(error, setError, FIELDS)).toBe(true)
    expect(setError).toHaveBeenCalledWith('root.server', {
      type: 'server',
      message: 'Valor inesperado.',
    })
  })

  it('cai no detail do envelope quando extra vem vazio', () => {
    const setError = vi.fn()
    const error = new ApiError({
      code: 'VALIDATION_ERROR',
      detail: 'Dados inválidos.',
      status: 400,
    })

    expect(applyServerErrors(error, setError, FIELDS)).toBe(true)
    expect(setError).toHaveBeenCalledWith('root.server', {
      type: 'server',
      message: 'Dados inválidos.',
    })
  })
})
