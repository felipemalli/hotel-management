// A API entrega documento e telefone já normalizados. Um tamanho que não casa
// com máscara conhecida (passaporte, por exemplo) sai cru: não se inventa
// formato em cima de um valor que o hotel vai ler em voz alta.
export function formatDocument(value: string): string {
  if (/^\d{11}$/.test(value)) {
    return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`
  }
  return value
}

export function formatPhone(value: string): string {
  if (/^\d{11}$/.test(value)) {
    return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`
  }
  if (/^\d{10}$/.test(value)) {
    return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`
  }
  return value
}
