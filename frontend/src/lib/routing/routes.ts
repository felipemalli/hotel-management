// Constantes puras: moram em `lib` porque páginas e features precisam montar
// links (`/reservas/7`), e `app` é a única camada que nenhuma delas enxerga.
export const ROUTES = {
  login: '/login',
  home: '/',
  reservations: '/reservas',
  reservation: (id: number) => `/reservas/${id}`,
  rooms: '/quartos',
  pricing: '/tarifas',
} as const
