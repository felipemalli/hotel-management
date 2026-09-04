import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { ErrorState } from '@/components/common'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Badge, Button, Typography } from '@/components/ui'
import { useIsAdmin } from '@/features/auth/hooks'
import { useAuth } from '@/features/auth/useAuth'
import { MAIN_CONTENT_ID } from '@/lib/a11y/focus'
import { errorMessage } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { ROUTES } from '@/lib/routing/routes'

import { PageFallback } from './PageFallback'

// `end` só na recepção: as demais precisam continuar ativas nas suas subrotas
// (`/reservas/7` ainda é "Reservas").
const NAV_ITEMS = [
  { to: ROUTES.home, label: 'Recepção', end: true },
  { to: ROUTES.reservations, label: 'Reservas', end: false },
  { to: ROUTES.rooms, label: 'Quartos', end: false },
  { to: ROUTES.pricing, label: 'Tarifas', end: false },
] as const

function navClassName({ isActive }: { isActive: boolean }): string {
  return [
    'rounded-md px-3 py-1.5 text-sm font-medium transition motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900',
  ].join(' ')
}

export function AppLayout() {
  const { username, signOut } = useAuth()
  const isAdmin = useIsAdmin()
  const { pathname } = useLocation()

  function onSignOut() {
    signOut()
    toastStore.clear()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Ir para o conteúdo
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <Typography as="h1" variant="title">
              Gestão de Hóspedes
            </Typography>
            <nav aria-label="Principal" className="flex flex-wrap gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClassName}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <nav aria-label="Sessão" className="flex items-center gap-3">
            <Typography as="p" variant="caption" className="flex items-center gap-2">
              <Typography as="span" variant="caption" weight="medium" className="text-foreground">
                {username ?? 'atendente'}
              </Typography>
              {isAdmin ? <Badge variant="info">admin</Badge> : null}
            </Typography>
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              Sair
            </Button>
          </nav>
        </div>
      </header>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 focus:outline-none"
      >
        {/* Boundary por página: uma quebra na tela deixa o cabeçalho e o menu de
            pé, e o atendente sai dela pelo menu em vez de recarregar tudo. */}
        <ErrorBoundary
          scope="page"
          resetKeys={[pathname]}
          fallback={({ error, resetErrorBoundary }) => (
            <ErrorState message={errorMessage(error)} onRetry={resetErrorBoundary} />
          )}
        >
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
