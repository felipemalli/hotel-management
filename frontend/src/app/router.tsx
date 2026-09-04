import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { ROUTES } from '@/lib/routes'

import { AppLayout } from './AppLayout'

// O login é o primeiro paint de quem chega sem sessão, então fica no bundle
// inicial; cada página autenticada vem num chunk próprio, carregado dentro do
// `ProtectedRoute` (o anônimo nunca baixa nenhum deles).
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const ReservationsPage = lazy(() =>
  import('@/pages/ReservationsPage').then((module) => ({ default: module.ReservationsPage })),
)
const RoomsPage = lazy(() =>
  import('@/pages/RoomsPage').then((module) => ({ default: module.RoomsPage })),
)
const ReservationDetailPage = lazy(() =>
  import('@/pages/ReservationDetailPage').then((module) => ({
    default: module.ReservationDetailPage,
  })),
)

export function AppRoutes() {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary scope="route" resetKeys={[pathname]}>
      <Routes>
        <Route path={ROUTES.login} element={<LoginPage />} />

        {/* Rota de layout: cabeçalho e menu pintam uma vez e sobrevivem à troca
            de página. É também o que a regra de camadas exige — uma página não
            pode importar `app/`, logo não pode envolver a si mesma no layout. */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path={ROUTES.home} element={<DashboardPage />} />
          <Route path={ROUTES.reservations} element={<ReservationsPage />} />
          <Route path={`${ROUTES.reservations}/:id`} element={<ReservationDetailPage />} />
          <Route path={ROUTES.rooms} element={<RoomsPage />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
