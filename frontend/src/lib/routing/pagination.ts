export const PAGE_PARAM = 'page'

export const FIRST_PAGE = 1

export function pageFromSearchParams(params: URLSearchParams): number {
  const raw = params.get(PAGE_PARAM)
  if (raw === null || !/^\d+$/.test(raw)) return FIRST_PAGE
  const page = Number.parseInt(raw, 10)
  return page >= FIRST_PAGE ? page : FIRST_PAGE
}

// A primeira página não aparece na URL.
export function withPage(params: URLSearchParams, page: number): URLSearchParams {
  const next = new URLSearchParams(params)
  if (page <= FIRST_PAGE) next.delete(PAGE_PARAM)
  else next.set(PAGE_PARAM, String(page))
  return next
}
