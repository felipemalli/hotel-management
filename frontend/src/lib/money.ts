/**
 * Formatacao de dinheiro (SPEC 5.3/F3).
 *
 * INVARIANTE SPEC 0.3: o frontend **nunca** faz aritmetica de dinheiro. O valor
 * chega da API como string decimal ("120.00") e sai como string exibivel
 * ("R$ 120,00"). Zero `Number`, zero `parseFloat`, zero `toLocaleString` — a
 * conversao para binario de ponto flutuante nao acontece em nenhum ponto.
 *
 *   formatBRL('120.00')  -> 'R$ 120,00'
 *   formatBRL('1234.50') -> 'R$ 1.234,50'
 *   formatBRL('0.00')    -> 'R$ 0,00'
 */

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

/** Agrupa milhares por regex, da direita para a esquerda, sobre a string crua. */
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
