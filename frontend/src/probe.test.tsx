import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Popover } from '@base-ui/react/popover'
import { describe, expect, it } from 'vitest'

describe('probe popover', () => {
  it('popover abre em jsdom', async () => {
    const user = userEvent.setup()
    render(
      <Popover.Root>
        <Popover.Trigger>abrir</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup>conteudo do popover</Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>,
    )
    await user.click(screen.getByRole('button', { name: 'abrir' }))
    expect(await screen.findByText('conteudo do popover')).toBeInTheDocument()
  }, 10000)
})
