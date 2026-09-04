const MONEY = /^(-?)(\d+)\.(\d{2})$/
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

function groupThousands(digits: string): string {
  return digits.replace(THOUSANDS, '.')
}

export function formatBRL(value: string): string {
  const parts = MONEY.exec(value)
  if (!parts) throw new TypeError(`Valor monetário fora do contrato: ${JSON.stringify(value)}`)

  const [, sign = '', reais = '', centavos = ''] = parts
  return `R$ ${sign}${groupThousands(reais)},${centavos}`
}

// Nunca arredonda: fração maior que `places` é inválida (arredondar é aritmética).
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

export function formatDecimalBR(value: string): string {
  if (!DECIMAL.test(value)) {
    throw new TypeError(`Valor decimal fora do contrato: ${JSON.stringify(value)}`)
  }
  return value.replace('.', ',')
}
