import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { ROUTES } from '@/lib/routing/routes'
import { LoginPage } from '@/pages/LoginPage'

import { AppLayout } from './layout/AppLayout'

const GuestsPage = lazy(() =>
  import('@/pages/GuestsPage').then((module) => ({ default: module.GuestsPage })),
)
const ReservationsPage = lazy(() =>
  import('@/pages/ReservationsPage').then((module) => ({ default: module.ReservationsPage })),
)
const PricingPolicyPage = lazy(() =>
  import('@/pages/PricingPolicyPage').then((module) => ({ default: module.PricingPolicyPage })),
)
const RoomsPage = lazy(() =>
  import('@/pages/RoomsPage').then((module) => ({ default: module.RoomsPage })),
)
const IrisPage = lazy(() =>
  import('@/pages/IrisPage').then((module) => ({ default: module.IrisPage })),
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

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path={ROUTES.home} element={<GuestsPage />} />
          <Route path={ROUTES.iris} element={<IrisPage />} />
          <Route path={ROUTES.reservations} element={<ReservationsPage />} />
          <Route path={`${ROUTES.reservations}/:id`} element={<ReservationDetailPage />} />
          <Route path={ROUTES.rooms} element={<RoomsPage />} />
          <Route path={ROUTES.pricing} element={<PricingPolicyPage />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
