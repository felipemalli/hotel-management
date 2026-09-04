export const DOCUMENT_MIN_LENGTH = 4
export const PHONE_MIN_LENGTH = 8

export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

// O `+` é obrigatório: o servidor recusa sem ele.
export function isInternationalPhone(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('+') && normalizePhone(trimmed).length >= PHONE_MIN_LENGTH
}
