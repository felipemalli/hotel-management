import { Banknote, BedDouble, CalendarCheck, ConciergeBell } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { ErrorState } from '@/components/common'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Typography } from '@/components/ui'
import { useCurrentUser } from '@/features/auth/hooks'
import { useAuth } from '@/features/auth/useAuth'
import { MAIN_CONTENT_ID } from '@/lib/a11y/focus'
import { errorMessage } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { ROUTES } from '@/lib/routing/routes'

import { PageFallback } from '../PageFallback'
import { SessionMenu } from '../SessionMenu'

const HOTEL_NAME = 'Hotel Vila Marés'

// end só na recepção: /reservas/7 ainda é "Reservas".
const NAV_GROUPS = [
  {
    label: 'OPERAÇÃO',
    items: [
      { to: ROUTES.home, label: 'Hóspedes', end: true, icon: ConciergeBell },
      { to: ROUTES.reservations, label: 'Reservas', end: false, icon: CalendarCheck },
    ],
  },
  {
    label: 'CADASTROS',
    items: [
      { to: ROUTES.rooms, label: 'Quartos', end: false, icon: BedDouble },
      { to: ROUTES.pricing, label: 'Tarifas', end: false, icon: Banknote },
    ],
  },
] as const

function navClassName({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  ].join(' ')
}

export function AppLayout() {
  const { signOut } = useAuth()
  const { data: user } = useCurrentUser()
  const { pathname } = useLocation()

  function onSignOut() {
    signOut()
    toastStore.clear()
  }

  const displayName = user?.username ?? 'atendente'

  return (
    <div className="flex min-h-screen bg-[#FAFAFA]">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Ir para o conteúdo
      </a>

      <aside className="sticky top-0 flex h-screen w-64 flex-none flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2.5 px-4 pt-4.5 pb-3.5">
          <div className="flex size-7.5 flex-none items-center justify-center rounded-lg bg-primary">
            <div className="size-2.75 rotate-45 rounded-sm border-2 border-primary-foreground" />
          </div>
          <div className="flex min-w-0 flex-col gap-px">
            <Typography as="h1" variant="title" className="font-display leading-none">
              Aurelia
            </Typography>
            <Typography
              as="span"
              variant="mono"
              className="leading-none tracking-[0.12em] text-muted-foreground uppercase"
            >
              Hotel PMS
            </Typography>
          </div>
        </div>

        <div className="px-4 pb-4">
          <Typography as="p" variant="label" className="truncate">
            {HOTEL_NAME}
          </Typography>
        </div>

        <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <Typography
                as="p"
                variant="mono"
                tone="mutedLight"
                className="px-2.5 pt-1.5 pb-2 tracking-widest"
              >
                {group.label}
              </Typography>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navClassName}>
                    <item.icon className="size-4 opacity-60" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-3 border-t border-sidebar-border p-3">
          <nav aria-label="Sessão">
            <SessionMenu
              username={displayName}
              isAdmin={user?.role === 'ADMIN'}
              onSignOut={onSignOut}
            />
          </nav>
        </div>
      </aside>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col focus:outline-none"
      >
        {/* Boundary por página: uma quebra na tela deixa a barra lateral de pé. */}
        <ErrorBoundary
          scope="page"
          resetKeys={[pathname]}
          fallback={({ error, resetErrorBoundary }) => (
            <div className="p-8">
              <ErrorState message={errorMessage(error)} onRetry={resetErrorBoundary} />
            </div>
          )}
        >
          <Suspense fallback={<PageFallback />}>
            <div className="flex flex-1 flex-col gap-4 p-6 sm:p-8">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
