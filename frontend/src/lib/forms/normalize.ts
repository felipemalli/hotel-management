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

export function applyBrPhoneMask(value: string): string {
  let digits = normalizePhone(value)
  if (digits === '') return ''
  if (!digits.startsWith('55')) {
    digits = `55${digits}`
  }
  digits = digits.slice(0, 13)
  const national = digits.slice(2)
  if (national.length === 0) return '55'
  if (national.length <= 2) return `55 (${national}`
  const area = national.slice(0, 2)
  const rest = national.slice(2)
  if (national.length <= 6) return `55 (${area}) ${rest}`
  if (national.length <= 10) return `55 (${area}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  return `55 (${area}) ${rest.slice(0, 5)}-${rest.slice(5)}`
}

export function brPhoneToInternational(value: string): string {
  return withLeadingPlus(applyBrPhoneMask(value))
}

export function isCompleteBrNationalPhone(value: string): boolean {
  const digits = normalizePhone(value).length
  return digits === 10 || digits === 11
}

export function isInternationalPhone(value: string): boolean {
  const trimmed = value.trim()
  const digits = normalizePhone(trimmed).length
  if (digits < PHONE_MIN_LENGTH) return false
  if (trimmed.startsWith('+')) return true
  return digits >= PHONE_MIN_DIGITS_WITHOUT_PLUS
}
