export const ROUTES = {
  login: '/login',
  home: '/',
  reservations: '/reservas',
  reservation: (id: number) => `/reservas/${id}`,
  rooms: '/quartos',
  pricing: '/tarifas',
} as const
