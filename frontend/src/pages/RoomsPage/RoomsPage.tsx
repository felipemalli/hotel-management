import { PlusIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, PageHeader, SearchField } from '@/components/common'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Switch,
} from '@/components/ui'
import { useIsAdmin } from '@/features/auth/hooks'
import { RoomActions } from '@/features/rooms/components/RoomActions'
import { RoomCapacityDialog } from '@/features/rooms/components/RoomCapacityDialog'
import { RoomDeactivateDialog } from '@/features/rooms/components/RoomDeactivateDialog'
import { RoomsTable } from '@/features/rooms/components/RoomsTable'
import { RoomForm } from '@/features/rooms/RoomForm'
import type { Room } from '@/features/rooms/types'
import { errorMessage } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { useDialogState } from '@/lib/hooks/useDialogState'
import { whenClosed } from '@/lib/hooks/useDismissibleOpen'
import { notifySuccess } from '@/lib/notify/toast'
import { pageFromSearchParams, withPage } from '@/lib/routing/pagination'

type RoomsDialog =
  { kind: 'create' } | { kind: 'capacity'; room: Room } | { kind: 'deactivate'; room: Room }

// is_active=false AMPLIA a listagem no servidor (nome da API, não da tela).
const INACTIVE_PARAM = 'is_active'

export function RoomsPage() {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()
  const { current: dialog, open, close } = useDialogState<RoomsDialog>()
  const [roomQuery, setRoomQuery] = useState('')
  const debouncedRoomQuery = useDebouncedValue(roomQuery, SEARCH_DEBOUNCE_MS)

  const includeInactive = searchParams.get(INACTIVE_PARAM) === 'false'
  const page = pageFromSearchParams(searchParams)

  function toggleInactive(checked: boolean) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (checked) next.set(INACTIVE_PARAM, 'false')
      else next.delete(INACTIVE_PARAM)
      // Filtro novo volta à página 1: a página 3 do recorte anterior não vale.
      return withPage(next, 1)
    })
  }

  function changeRoomQuery(value: string) {
    setRoomQuery(value)
    setSearchParams((previous) => withPage(previous, 1))
  }

  // Referência estável: senão a linha remonta debaixo do diálogo e perde o foco.
  const renderRoomActions = useCallback(
    (room: Room) => (
      <RoomActions
        room={room}
        onEditCapacity={(chosen) => open({ kind: 'capacity', room: chosen })}
        onRequestDeactivate={(chosen) => open({ kind: 'deactivate', room: chosen })}
      />
    ),
    [open],
  )

  return (
    <section aria-labelledby="quartos-titulo" className="flex flex-col gap-4">
      <PageHeader
        title="Quartos"
        titleId="quartos-titulo"
        description="Cadastro de unidades, capacidade e disponibilidade operacional."
        actions={
          isAdmin ? (
            <Button onClick={() => open({ kind: 'create' })}>
              <PlusIcon className="size-4" aria-hidden="true" />
              Novo quarto
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <SearchField
          label="Buscar quarto"
          placeholder="Número do quarto"
          value={roomQuery}
          onChange={changeRoomQuery}
          className="w-full sm:w-72"
        />

        <FieldLabel htmlFor="rooms-include-inactive" className="flex-row items-center gap-2.5">
          <Switch
            id="rooms-include-inactive"
            checked={includeInactive}
            onCheckedChange={toggleInactive}
          />
          Mostrar desativados
        </FieldLabel>
      </div>

      <ErrorBoundary
        scope="rooms-table"
        fallback={({ error, resetErrorBoundary }) => (
          <ErrorState message={errorMessage(error)} onRetry={resetErrorBoundary} />
        )}
      >
        <RoomsTable
          includeInactive={includeInactive}
          page={page}
          search={debouncedRoomQuery}
          onPageChange={(next) => setSearchParams((previous) => withPage(previous, next))}
          renderActions={isAdmin ? renderRoomActions : undefined}
        />
      </ErrorBoundary>

      <Dialog open={dialog?.kind === 'create'} onOpenChange={whenClosed(close)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo quarto</DialogTitle>
            <DialogDescription>
              Número único (até 10 caracteres) e capacidade em pessoas.
            </DialogDescription>
          </DialogHeader>
          <RoomForm
            onCancel={close}
            onSuccess={(room) => {
              close()
              notifySuccess(`Quarto ${room.number} cadastrado.`)
            }}
          />
        </DialogContent>
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
            close()
            notifySuccess(`Quarto ${room.number} desativado.`)
          }}
        />
      ) : null}
    </section>
  )
}
