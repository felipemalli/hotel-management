import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Dialog } from './Dialog'

/**
 * Acabamento de acessibilidade do modal (Workstream E): o que sustenta o
 * `aria-modal="true"` dos fluxos F2 e F3 — foco entra, circula, e volta.
 */

function DialogFixture({ onClose = () => {} }: { onClose?: () => void }) {
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

    // Do ultimo controle o Tab volta ao primeiro, nunca para a tela atras.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Imprimir' })).toHaveFocus()

    // E Shift+Tab fecha o ciclo no sentido oposto.
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

/**
 * O pai re-renderiza (um refetch de listagem, por exemplo) e passa um
 * `onClose` novo, porque na pratica ele e uma arrow inline. Se o efeito de
 * foco depender dessa identidade, ele roda de novo e joga o cursor de volta
 * ao painel — no meio da digitacao do atendente.
 *
 * O re-render entra por `rerender`, nao por clique: clicar move o foco por
 * conta propria e mascararia justamente o que se quer medir.
 */
function FormInDialog() {
  return (
    <Dialog open title="Novo hóspede" onClose={() => {}}>
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

    // Cada render de `FormInDialog` cria um `onClose` de identidade nova.
    rerender(<FormInDialog />)

    expect(screen.getByLabelText('Nome')).toHaveFocus()
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana')
  })
})
