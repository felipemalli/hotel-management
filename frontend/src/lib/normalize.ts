// Espelho da normalização de armazenamento do servidor: documento é
// alfanumérico maiúsculo, telefone é só dígitos. Os mínimos são os mesmos, para
// o campo recusar no balcão o que a coluna recusaria depois.
export const DOCUMENT_MIN_LENGTH = 4
export const PHONE_MIN_LENGTH = 8

export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}
