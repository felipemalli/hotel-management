import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState } from '@/components/common'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Button, Checkbox, Dialog, FieldLabel } from '@/components/ui'
import { useIsAdmin } from '@/features/auth/hooks'
import { RoomActions } from '@/features/rooms/components/RoomActions'
import { RoomCapacityDialog } from '@/features/rooms/components/RoomCapacityDialog'
import { RoomDeactivateDialog } from '@/features/rooms/components/RoomDeactivateDialog'
import { RoomForm } from '@/features/rooms/RoomForm'
import { RoomsTable } from '@/features/rooms/RoomsTable'
import type { Room } from '@/features/rooms/types'
import { returnFocusToContent } from '@/lib/a11y/focus'
import { errorMessage } from '@/lib/errors/errors'
import { notifySuccess } from '@/lib/notify/toast'
import { pageFromSearchParams, withPage } from '@/lib/routing/pagination'

type RoomsDialog =
  { kind: 'create' } | { kind: 'capacity'; room: Room } | { kind: 'deactivate'; room: Room } | null

// O nome do parâmetro é o da API: quem lê a URL e quem lê o contrato veem a
// mesma palavra, e `is_active=false` é o que AMPLIA a listagem no servidor.
const INACTIVE_PARAM = 'is_active'

export function RoomsPage() {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<RoomsDialog>(null)

  const includeInactive = searchParams.get(INACTIVE_PARAM) === 'false'
  const page = pageFromSearchParams(searchParams)

  function close() {
    setDialog(null)
  }

  function toggleInactive(checked: boolean) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (checked) next.set(INACTIVE_PARAM, 'false')
      else next.delete(INACTIVE_PARAM)
      // Filtro novo, primeira página: a página 3 do recorte anterior não
      // significa nada no recorte novo.
      return withPage(next, 1)
    })
  }

  return (
    <section aria-labelledby="quartos-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="quartos-titulo" className="text-xl font-semibold text-slate-900">
          Quartos
        </h2>
        {isAdmin ? (
          <Button onClick={() => setDialog({ kind: 'create' })}>Novo quarto</Button>
        ) : null}
      </div>

      <FieldLabel htmlFor="rooms-include-inactive" className="flex-row items-center">
        <Checkbox
          id="rooms-include-inactive"
          checked={includeInactive}
          onCheckedChange={toggleInactive}
        />
        Mostrar desativados
      </FieldLabel>

      <ErrorBoundary
        scope="rooms-table"
        fallback={({ error, resetErrorBoundary }) => (
          <ErrorState message={errorMessage(error)} onRetry={resetErrorBoundary} />
        )}
      >
        <RoomsTable
          includeInactive={includeInactive}
          page={page}
          onPageChange={(next) => setSearchParams((previous) => withPage(previous, next))}
          renderActions={
            isAdmin
              ? (room) => (
                  <RoomActions
                    room={room}
                    onEditCapacity={(chosen) => setDialog({ kind: 'capacity', room: chosen })}
                    onRequestDeactivate={(chosen) =>
                      setDialog({ kind: 'deactivate', room: chosen })
                    }
                  />
                )
              : undefined
          }
        />
      </ErrorBoundary>

      <Dialog
        open={dialog?.kind === 'create'}
        title="Novo quarto"
        description="Número único (até 10 caracteres) e capacidade em pessoas."
        onClose={close}
      >
        <RoomForm
          onCancel={close}
          onSuccess={(room) => {
            close()
            notifySuccess(`Quarto ${room.number} cadastrado.`)
          }}
        />
      </Dialog>

      {dialog?.kind === 'capacity' ? (
        <RoomCapacityDialog
          room={dialog.room}
          onClose={close}
          onUpdated={(room) => {
            close()
            notifySuccess(`Capacidade do quarto ${room.number} atualizada para ${room.capacity}.`)
          }}
        />
      ) : null}

      {dialog?.kind === 'deactivate' ? (
        <RoomDeactivateDialog
          room={dialog.room}
          onClose={close}
          onDeactivated={(room) => {
            // A linha some da listagem padrão junto com a desativação: sem um
            // alvo vivo, o foco cairia no `<body>`.
            returnFocusToContent()
            close()
            notifySuccess(`Quarto ${room.number} desativado.`)
          }}
        />
      ) : null}
    </section>
  )
}
