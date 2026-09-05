import { BrowserRouter } from 'react-router-dom'

import { AppProviders } from './providers'
import { AppRoutes } from './router'
import { SessionGate } from './SessionGate'

export function App() {
  return (
    <AppProviders>
      <SessionGate>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </SessionGate>
    </AppProviders>
  )
}
