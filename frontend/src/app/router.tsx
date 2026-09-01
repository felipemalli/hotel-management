import { Navigate, Route, Routes } from 'react-router-dom'

import { LoginPage } from '@/features/auth/LoginPage'

import { DashboardPage } from './DashboardPage'
import { ProtectedRoute } from './ProtectedRoute'

/**
 * Rotas (SPEC 5.1): `/login` e `/` (dashboard unico com abas). O briefing nao
 * justifica mais paginas — abas cobrem as tres listagens da SPEC 4.3.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
