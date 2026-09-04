// Paginação do DRF: a página é um parâmetro da URL, para recarregar, voltar e
// compartilhar preservarem a consulta.
export const PAGE_PARAM = 'page'

export const FIRST_PAGE = 1

// `parseInt` é legítimo aqui: número de página é contagem, não dinheiro. Valor
// fora do formato cai na primeira página em silêncio — um `?page=abc` digitado
// à mão não merece uma tela de erro.
export function pageFromSearchParams(params: URLSearchParams): number {
  const raw = params.get(PAGE_PARAM)
  if (raw === null || !/^\d+$/.test(raw)) return FIRST_PAGE
  const page = Number.parseInt(raw, 10)
  return page >= FIRST_PAGE ? page : FIRST_PAGE
}

// A primeira página não aparece na URL: `/quartos` e não `/quartos?page=1`.
export function withPage(params: URLSearchParams, page: number): URLSearchParams {
  const next = new URLSearchParams(params)
  if (page <= FIRST_PAGE) next.delete(PAGE_PARAM)
  else next.set(PAGE_PARAM, String(page))
  return next
}
