// Invariante: o frontend nunca faz aritmética de dinheiro. O valor chega da API
// como string decimal ("120.00") e sai como string exibível ("R$ 120,00"), sem
// nenhuma passagem por ponto flutuante.
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

function groupThousands(digits: string): string {
  return digits.replace(THOUSANDS, '.')
}

export function formatBRL(value: string): string {
  const raw = value.trim()
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw

  const separator = unsigned.indexOf('.')
  const integerPart = separator === -1 ? unsigned : unsigned.slice(0, separator)
  const fractionPart = separator === -1 ? '' : unsigned.slice(separator + 1)

  const integerDigits = integerPart.replace(/\D/g, '') || '0'
  const cents = `${fractionPart.replace(/\D/g, '')}00`.slice(0, 2)

  return `R$ ${negative ? '-' : ''}${groupThousands(integerDigits)},${cents}`
}
