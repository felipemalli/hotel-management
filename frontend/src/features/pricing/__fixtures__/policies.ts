import type { PricingPolicy } from '../types'

// Espelho de `backend/hotel/migrations/0005_pricingpolicy`: os literais do
// briefing e a nota do bootstrap. `created_by` nulo é a marca da implantação —
// nenhuma publicação pela API pode ter ator nulo.
export const BOOTSTRAP_POLICY: PricingPolicy = {
  id: 1,
  weekday_rate: '120.00',
  weekend_rate: '180.00',
  weekday_park: '15.00',
  weekend_park: '20.00',
  late_fee_factor: '0.5000',
  checkin_opens: '14:00',
  checkout_limit: '12:00',
  effective_from: '2000-01-01T00:00:00Z',
  note: 'tarifa do briefing (bootstrap)',
  created_at: '2026-09-01T08:00:00-03:00',
  created_by: null,
}

export const HIGH_SEASON_POLICY: PricingPolicy = {
  id: 2,
  weekday_rate: '150.00',
  weekend_rate: '220.00',
  weekday_park: '15.00',
  weekend_park: '25.00',
  late_fee_factor: '0.2500',
  checkin_opens: '15:00',
  checkout_limit: '11:00',
  effective_from: '2026-09-03T10:00:00-03:00',
  // Nota vazia de propósito: cobre o ramo do travessão no cartão.
  note: '',
  created_at: '2026-09-03T10:00:00-03:00',
  created_by: { id: 2, username: 'admin' },
}
