// As raízes moram aqui, e não nas features, para `guests` e `reservations` não
// se importarem em ciclo: cada feature deriva suas chaves a partir delas.
export const GUESTS_ROOT = ['guests'] as const
export const RESERVATIONS_ROOT = ['reservations'] as const
