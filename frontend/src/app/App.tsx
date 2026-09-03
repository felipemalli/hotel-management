import { BrowserRouter } from 'react-router-dom'

import { AppProviders } from './providers'
import { AppRoutes } from './router'

export function App() {
  return (
    <AppProviders>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  )
}
