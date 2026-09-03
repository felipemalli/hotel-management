import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Dialog } from './Dialog'

function DialogFixture({ onClose = vi.fn() }: { onClose?: () => void }) {
  return (
    <>
      <button type="button">Fora do modal</button>
      <Dialog
        open
        title="Extrato de checkout"
        description="Ana Souza"
        onClose={onClose}
        footer={<button type="button">Fechar</button>}
      >
        <button type="button">Imprimir</button>
      </Dialog>
    </>
  )
}

function overlayOf(role: 'dialog' | 'alertdialog'): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access -- o overlay e `aria-hidden`, logo nao tem papel nem nome: o irmao do painel e o unico caminho ate ele.
  const overlay = screen.getByRole(role).previousElementSibling
  if (!(overlay instanceof HTMLElement)) throw new Error('painel sem overlay irmao')
  return overlay
}

describe('Dialog', () => {
  it('leva o foco para o painel ao abrir', () => {
    render(<DialogFixture />)
    expect(screen.getByRole('dialog', { name: 'Extrato de checkout' })).toHaveFocus()
  })

  it('mantem o Tab preso entre os controles do painel', async () => {
    const user = userEvent.setup()
    render(<DialogFixture />)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Imprimir' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Imprimir' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()

    expect(screen.getByRole('button', { name: 'Fora do modal' })).not.toHaveFocus()
  })

  it('fecha no Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogFixture onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renderiza fora da arvore do pai: a celula da tabela nao recorta o painel', () => {
    const { container } = render(
      <div className="overflow-x-auto">
        <DialogFixture />
      </div>,
    )

    const dialog = screen.getByRole('dialog')
    expect(container).not.toContainElement(dialog)
    expect(document.body).toContainElement(dialog)
  })

  it('fecha um dialog no clique do overlay, mas nao um alertdialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open title="Extrato de checkout" onClose={onClose}>
        <button type="button">Imprimir</button>
      </Dialog>,
    )

    await user.click(overlayOf('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <Dialog open role="alertdialog" title="Confirmar cancelamento" onClose={onClose}>
        <button type="button">Cancelar reserva</button>
      </Dialog>,
    )

    await user.click(overlayOf('alertdialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('devolve o foco ao elemento anterior quando fecha', async () => {
    const user = userEvent.setup()
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir extrato
          </button>
          <Dialog open={open} title="Extrato de checkout" onClose={() => setOpen(false)}>
            <button type="button">Imprimir</button>
          </Dialog>
        </>
      )
    }

    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Abrir extrato' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

// O re-render entra por `rerender`, e não por clique: clicar move o foco por
// conta própria e mascararia justamente o que se quer medir — que o efeito de
// foco do Dialog não reage a um `onClose` de identidade nova.
function FormInDialog() {
  return (
    <Dialog open title="Novo hóspede" onClose={vi.fn()}>
      <label htmlFor="nome">Nome</label>
      <input id="nome" />
    </Dialog>
  )
}

describe('Dialog e o re-render do pai', () => {
  it('nao rouba o foco do campo que esta sendo digitado', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FormInDialog />)

    const input = screen.getByLabelText('Nome')
    await user.click(input)
    await user.keyboard('Ana')
    expect(input).toHaveFocus()

    rerender(<FormInDialog />)

    expect(screen.getByLabelText('Nome')).toHaveFocus()
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana')
  })
})
