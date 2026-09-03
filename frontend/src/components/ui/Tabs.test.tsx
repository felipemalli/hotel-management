import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { GUEST_TABS, type GuestTab } from '@/features/guests/GuestTable'

import { Tabs } from './Tabs'
import { tabPanelId } from './tabIds'

/**
 * Acabamento de teclado das abas (Workstream E) sobre as tres listagens da
 * SPEC 5.3/F1. As abas reais sao importadas de `GUEST_TABS` para o teste nao
 * inventar um conjunto que a app nao tem.
 */

function TabsFixture() {
  const [value, setValue] = useState<GuestTab>('todos')
  return (
    <>
      <button type="button">Antes das abas</button>
      <Tabs items={GUEST_TABS} value={value} onChange={setValue} label="Listagens de hóspedes" />
      <div id={tabPanelId(value)} role="tabpanel">
        Painel de {value}
      </div>
      <button type="button">Depois das abas</button>
    </>
  )
}

describe('Tabs', () => {
  it('expoe as tres listagens da SPEC 5.3/F1 com a ativa detectavel', () => {
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

    // Circular: da ultima, a seta direita volta para a primeira.
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
