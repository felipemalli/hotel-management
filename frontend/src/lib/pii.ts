/**
 * Formatacao de documento e telefone para exibicao (SPEC 5.3/F1).
 *
 * A API guarda o valor ja normalizado (D9): documento alfanumerico maiusculo,
 * telefone so digitos. Aqui so se veste o que cabe numa mascara conhecida;
 * passaporte e demais tamanhos saem crus — nao se inventa formato.
 *
 *   formatDocument('12345678901') -> '123.456.789-01'
 *   formatDocument('AB123456')    -> 'AB123456'
 *   formatPhone('21988887777')    -> '(21) 98888-7777'
 *   formatPhone('2133334444')     -> '(21) 3333-4444'
 */

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
