import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { tabPanelId } from './tabIds'
import { Tabs } from './Tabs'

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'in-hotel', label: 'No hotel' },
  { id: 'pending-checkin', label: 'Check-in pendente' },
] as const

type TabId = (typeof TABS)[number]['id']

function TabsFixture() {
  const [value, setValue] = useState<TabId>('all')
  return (
    <>
      <button type="button">Antes das abas</button>
      <Tabs items={TABS} value={value} onChange={setValue} label="Listagens de hóspedes" />
      <div id={tabPanelId(value)} role="tabpanel">
        Painel de {value}
      </div>
      <button type="button">Depois das abas</button>
    </>
  )
}

describe('Tabs', () => {
  it('expoe as tres listagens com a aba ativa detectavel por ARIA', () => {
    render(<TabsFixture />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Todos',
      'No hotel',
      'Check-in pendente',
    ])
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute(
      'aria-controls',
      screen.getByRole('tabpanel').id,
    )
  })

  it('troca de aba com as setas e leva o foco junto', async () => {
    const user = userEvent.setup()
    render(<TabsFixture />)

    screen.getByRole('tab', { name: 'Todos' }).focus()

    await user.keyboard('{ArrowRight}')
    const inHotel = screen.getByRole('tab', { name: 'No hotel' })
    expect(inHotel).toHaveFocus()
    expect(inHotel).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel de in-hotel')

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Check-in pendente' })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Check-in pendente' })).toHaveFocus()

    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveFocus()
  })

  it('e uma unica parada de Tab (roving tabindex), nao tres', async () => {
    const user = userEvent.setup()
    render(<TabsFixture />)

    screen.getByRole('button', { name: 'Antes das abas' }).focus()

    await user.tab()
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Depois das abas' })).toHaveFocus()
  })
})
