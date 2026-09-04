// As raízes moram aqui, e não nas features, para `guests` e `reservations` não
// se importarem em ciclo: cada feature deriva suas chaves a partir delas.
export const GUESTS_ROOT = ['guests'] as const
export const RESERVATIONS_ROOT = ['reservations'] as const
export const ROOMS_ROOT = ['rooms'] as const
export const PRICING_ROOT = ['pricing-policies'] as const

// Fora da invalidação cruzada: o papel do usuário não muda por ação desta UI, e
// o cache inteiro é descartado no sign-out.
export const AUTH_ROOT = ['auth'] as const
