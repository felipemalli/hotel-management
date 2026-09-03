import type { Paginated } from '@/lib/apiClient'

export function page<T>(results: T[]): Paginated<T> {
  return { count: results.length, next: null, previous: null, results }
}

export function elementAt(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements[index]
  if (!element) {
    throw new Error(`Nenhum elemento na posicao ${index} de uma lista de ${elements.length}.`)
  }
  return element
}
