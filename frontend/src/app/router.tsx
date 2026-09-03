import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'

import { DashboardPage } from './DashboardPage'
import { ROUTES } from './routes'

export function AppRoutes() {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary scope="route" resetKeys={[pathname]}>
      <Routes>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route
          path={ROUTES.home}
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
