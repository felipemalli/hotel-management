import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRUNO, DAVI, EVA } from '@/features/guests/__fixtures__/guests'
import { fetchGuests } from '@/features/guests/api'
import type { GuestRef } from '@/features/reservations/types'
import { ApiError } from '@/lib/errors/errors'
import { SEARCH_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedValue'
import { page } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { CompanionPicker } from './CompanionPicker'

vi.mock('@/features/guests/api')

const EVA_REF: GuestRef = { id: EVA.id, full_name: EVA.full_name }

// `waitFor` do RTL não reconhece fake timers do vitest (procura o global `jest`).
async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function setup(value: GuestRef[] = [], error?: string) {
  const onChange = vi.fn()
  renderWithProviders(
    <CompanionPicker holderId={BRUNO.id} value={value} onChange={onChange} error={error} />,
  )
  return { onChange }
}

async function search(text: string) {
  fireEvent.change(screen.getByLabelText('Buscar acompanhante'), { target: { value: text } })
  await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS)
  await advanceTimersAndFlush(0)
}

describe('CompanionPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchGuests).mockResolvedValue(page([EVA, DAVI]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('nao consulta a API enquanto a busca esta vazia', async () => {
    setup()

    await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS * 2)

    expect(fetchGuests).not.toHaveBeenCalled()
    expect(screen.getByText(/Nenhum acompanhante/)).toBeInTheDocument()
  })

  it('busca com o mesmo debounce da tabela e omite o titular', async () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300)
    vi.mocked(fetchGuests).mockResolvedValue(page([BRUNO, EVA]))
    setup()

    fireEvent.change(screen.getByLabelText('Buscar acompanhante'), { target: { value: 'lima' } })
    await advanceTimersAndFlush(SEARCH_DEBOUNCE_MS - 1)
    expect(fetchGuests).not.toHaveBeenCalled()

    await advanceTimersAndFlush(1)
    await advanceTimersAndFlush(0)

    expect(fetchGuests).toHaveBeenLastCalledWith('lima', 1)
    expect(screen.getByRole('option', { name: /Eva Lima/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Bruno Lima/ })).not.toBeInTheDocument()
  })

  // Combobox (Base UI) trava em jsdom se aberto via clique — a interação real
  // é provada no e2e. Aqui, seleção por teclado, que não trava.
  it('adiciona ao selecionar, limpa a busca e devolve o conjunto novo', async () => {
    const { onChange } = setup()

    await search('eva')
    const input = screen.getByLabelText('Buscar acompanhante')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith([EVA_REF])
    expect(screen.getByLabelText('Buscar acompanhante')).toHaveValue('')
  })

  it('mostra os escolhidos como etiquetas removiveis', () => {
    const { onChange } = setup([EVA_REF])

    const chosen = screen.getByRole('list', { name: 'Acompanhantes escolhidos' })
    expect(within(chosen).getByText('Eva Lima')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remover Eva Lima' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('nao oferece de novo quem ja esta na lista', async () => {
    setup([EVA_REF])

    await search('a')

    expect(screen.getByRole('option', { name: /Davi Rocha/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Eva Lima/ })).not.toBeInTheDocument()
  })

  it('avisa quando a busca nao encontra ninguem', async () => {
    vi.mocked(fetchGuests).mockResolvedValue(page([]))
    setup()

    await search('zzz')

    expect(screen.getByText('Nenhum hóspede encontrado.')).toBeInTheDocument()
  })

  it('anuncia a busca em andamento', async () => {
    vi.mocked(fetchGuests).mockReturnValue(new Promise(() => undefined))
    setup()

    await search('eva')

    expect(screen.getByRole('status')).toHaveTextContent('Buscando…')
  })

  it('mostra a falha da busca com a mensagem do transporte', async () => {
    vi.mocked(fetchGuests).mockRejectedValue(
      new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 }),
    )
    setup()

    await search('eva')

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor.')
  })

  it('expoe sob o grupo o erro que o servidor devolveu', () => {
    setup([], 'Quarto 101 comporta 2 pessoas.')

    expect(screen.getByRole('alert')).toHaveTextContent('Quarto 101 comporta 2 pessoas.')
  })
})
