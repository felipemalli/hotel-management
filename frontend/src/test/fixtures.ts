/**
 * `noUncheckedIndexedAccess` torna `elements[i]` opcional, e um indice fora da
 * lista e erro do proprio teste: falhamos aqui, dizendo a posicao, em vez de
 * deixar o RTL receber `undefined`.
 */
export function elementAt(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements[index]
  if (!element) {
    throw new Error(`Nenhum elemento na posicao ${index} de uma lista de ${elements.length}.`)
  }
  return element
}
