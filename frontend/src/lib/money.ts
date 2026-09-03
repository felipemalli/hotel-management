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
