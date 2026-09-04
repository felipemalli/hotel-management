// Invariante: o frontend nunca faz aritmética de dinheiro. O valor chega da API
// como string decimal ("120.00") e sai como string exibível ("R$ 120,00"), sem
// nenhuma passagem por ponto flutuante.
const MONEY = /^(-?)(\d+)\.(\d{2})$/
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

function groupThousands(digits: string): string {
  return digits.replace(THOUSANDS, '.')
}

// Entrada fora do contrato lança: um valor plausível na tela do balcão é pior
// que uma falha visível, porque ninguém confere um total que "parece certo".
export function formatBRL(value: string): string {
  const parts = MONEY.exec(value)
  if (!parts) throw new TypeError(`Valor monetário fora do contrato: ${JSON.stringify(value)}`)

  const [, sign = '', reais = '', centavos = ''] = parts
  return `R$ ${sign}${groupThousands(reais)},${centavos}`
}

// Entrada humana → string decimal do contrato, por manipulação de texto:
// "120" → "120.00", "120,5" → "120.50", "0,5" com 4 casas → "0.5000".
// Nunca arredonda: fração mais longa que `places` é inválida, porque arredondar
// é aritmética e o admin precisa ver exatamente o que digitou.
const DECIMAL_INPUT = /^(-?)(\d+)(?:[.,](\d*))?$/
const LEADING_ZEROS = /^0+(?=\d)/
const DECIMAL = /^-?\d+\.\d+$/

export function toDecimalString(input: string, places: number): string | null {
  const parts = DECIMAL_INPUT.exec(input.trim())
  if (!parts) return null

  const [, sign = '', integer = '', fraction = ''] = parts
  if (fraction.length > places) return null

  return `${sign}${integer.replace(LEADING_ZEROS, '')}.${fraction.padEnd(places, '0')}`
}

export function toMoneyString(input: string): string | null {
  return toDecimalString(input, 2)
}

// "0.5000" → "0,5000": a vírgula do balcão, sem passar por número.
export function formatDecimalBR(value: string): string {
  if (!DECIMAL.test(value)) {
    throw new TypeError(`Valor decimal fora do contrato: ${JSON.stringify(value)}`)
  }
  return value.replace('.', ',')
}
