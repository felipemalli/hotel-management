import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'

import { PageFallback } from './PageFallback'
import { ROUTES } from './routes'

// O login é o primeiro paint de quem chega sem sessão, então fica no bundle
// inicial; o dashboard, que só existe depois da autenticação, vem em um chunk
// próprio carregado dentro do `ProtectedRoute` (o anônimo nunca o baixa).
const DashboardPage = lazy(() =>
  import('./DashboardPage').then((module) => ({ default: module.DashboardPage })),
)

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
              <Suspense fallback={<PageFallback />}>
                <DashboardPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
