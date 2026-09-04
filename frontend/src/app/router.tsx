import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { ROUTES } from '@/lib/routing/routes'
import { LoginPage } from '@/pages/LoginPage'

import { AppLayout } from './layout/AppLayout'

const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const ReservationsPage = lazy(() =>
  import('@/pages/ReservationsPage').then((module) => ({ default: module.ReservationsPage })),
)
const PricingPage = lazy(() =>
  import('@/pages/PricingPage').then((module) => ({ default: module.PricingPage })),
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

        {/* Layout: header/menu sobrevivem à troca de página. */}
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
          <Route path={ROUTES.pricing} element={<PricingPage />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
