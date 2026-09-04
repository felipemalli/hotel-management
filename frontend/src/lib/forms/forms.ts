import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { z } from 'zod'

import { isApiErrorCode } from '../errors/errors'

export const REQUIRED_MESSAGE = 'Campo obrigatório.'

// `abort: true` para valor vazio não disparar também o `.refine()`.
export function requiredString() {
  return z.string().min(1, { error: REQUIRED_MESSAGE, abort: true })
}

function firstMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!isApiErrorCode(error, 'VALIDATION_ERROR')) return false

  const known = new Set<string>(fields)
  let mapped = false

  for (const field of fields) {
    const message = firstMessage(error.extra[field])
    if (message) {
      setError(field, { type: 'server', message })
      mapped = true
    }
  }

  const rootMessages = Object.entries(error.extra)
    .filter(([key]) => !known.has(key))
    .map(([, value]) => firstMessage(value))
    .filter((message): message is string => message !== undefined)

  if (rootMessages.length > 0) {
    setError('root.server', { type: 'server', message: rootMessages.join(' ') })
    mapped = true
  } else if (!mapped) {
    setError('root.server', { type: 'server', message: error.message })
    mapped = true
  }

  return mapped
}
