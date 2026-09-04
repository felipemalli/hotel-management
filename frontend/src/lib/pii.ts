// A API entrega documento e telefone já normalizados. Um tamanho que não casa
// com máscara conhecida (passaporte, por exemplo) sai cru: não se inventa
// formato em cima de um valor que o hotel vai ler em voz alta.
export function formatDocument(value: string): string {
  if (/^\d{11}$/.test(value)) {
    return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`
  }
  return value
}

// O telefone chega em dígitos E.164 sem o `+` ("5521988887777"). O `+` volta na
// exibição porque é o que o atendente disca; os planos de numeração conhecidos
// ganham a máscara local, e o resto é agrupado mecanicamente — inventar
// separador para um país que não conhecemos erraria calado.
const BR_PHONE = /^55(\d{2})(\d{4,5})(\d{4})$/
const NANP_PHONE = /^1(\d{3})(\d{3})(\d{4})$/
const E164_DIGITS = /^(\d{1,7})(\d{4})(\d{4})$/

export function formatPhone(value: string): string {
  const br = BR_PHONE.exec(value)
  if (br) {
    const [, area = '', prefix = '', suffix = ''] = br
    return `+55 (${area}) ${prefix}-${suffix}`
  }

  const nanp = NANP_PHONE.exec(value)
  if (nanp) {
    const [, area = '', prefix = '', suffix = ''] = nanp
    return `+1 (${area}) ${prefix}-${suffix}`
  }

  const generic = E164_DIGITS.exec(value)
  if (generic) {
    const [, country = '', prefix = '', suffix = ''] = generic
    return `+${country} ${prefix}-${suffix}`
  }

  return value
}
