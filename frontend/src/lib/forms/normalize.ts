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

// Espelho da entrada de `to_e164_digits`: o `+` é obrigatório e os dígitos
// bastam para um número plausível. Sem o `+` o servidor recusa, porque
// adivinhar o país de um número solto erraria calado no hóspede estrangeiro.
// A validade por plano de numeração fica no servidor (phonenumbers); aqui só a
// forma, para não existirem duas mensagens para a mesma entrada ruim.
export function isInternationalPhone(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('+') && normalizePhone(trimmed).length >= PHONE_MIN_LENGTH
}
