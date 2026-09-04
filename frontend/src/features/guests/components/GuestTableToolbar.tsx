import { FormField } from '@/components/common'
import { Input, Tabs } from '@/components/ui'

import { GUEST_TAB_ITEMS, type GuestTab } from '../tabs'

export interface GuestTableToolbarProps {
  tab: GuestTab
  onTabChange: (tab: GuestTab) => void
  search: string
  onSearchChange: (search: string) => void
  updating: boolean
}

export function GuestTableToolbar({
  tab,
  onTabChange,
  search,
  onSearchChange,
  updating,
}: GuestTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <Tabs
          items={GUEST_TAB_ITEMS}
          value={tab}
          onChange={onTabChange}
          label="Listagens de hóspedes"
        />
        {updating ? <span className="text-xs text-slate-500">Atualizando…</span> : null}
      </div>

      {tab === 'all' ? (
        <div className="w-full sm:w-80">
          <FormField
            label="Buscar hóspede"
            hint="Nome, documento ou telefone — busca por fragmento."
          >
            {(control) => (
              <Input
                type="search"
                placeholder="Nome, documento ou telefone"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                {...control}
              />
            )}
          </FormField>
        </div>
      ) : null}
    </div>
  )
}
