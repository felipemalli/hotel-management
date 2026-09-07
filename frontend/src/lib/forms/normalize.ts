export const DOCUMENT_MIN_LENGTH = 4
export const PHONE_MIN_LENGTH = 8
// Sem `+`, 10–11 dígitos são só DDD; o DDI só cabe a partir do 12º.
export const PHONE_MIN_DIGITS_WITHOUT_PLUS = 12

export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

export function withLeadingPlus(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

export function isInternationalPhone(value: string): boolean {
  const trimmed = value.trim()
  const digits = normalizePhone(trimmed).length
  if (digits < PHONE_MIN_LENGTH) return false
  if (trimmed.startsWith('+')) return true
  return digits >= PHONE_MIN_DIGITS_WITHOUT_PLUS
}
