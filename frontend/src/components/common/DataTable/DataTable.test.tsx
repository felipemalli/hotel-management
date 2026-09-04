import { createColumnHelper } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DataTable } from './DataTable'
import { type dataTableFeatures } from './features'

interface Fruit {
  id: string
  name: string
  count: number
}

const FRUITS: Fruit[] = [
  { id: 'apple', name: 'Maçã', count: 3 },
  { id: 'pear', name: 'Pera', count: 5 },
]

const helper = createColumnHelper<typeof dataTableFeatures, Fruit>()
const columns = helper.columns([
  helper.accessor('name', { header: 'Nome' }),
  helper.accessor('count', { header: 'Quantidade', meta: { align: 'end' } }),
])

describe('DataTable', () => {
  it('usa o caption como nome acessível da tabela', () => {
    render(
      <DataTable
        columns={columns}
        data={FRUITS}
        caption="Frutas em estoque"
        getRowId={(fruit) => fruit.id}
      />,
    )

    expect(screen.getByRole('table', { name: 'Frutas em estoque' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Pera' })).toBeInTheDocument()
  })

  it('mostra o vazio sem renderizar a tabela', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        caption="Frutas em estoque"
        getRowId={(fruit) => fruit.id}
        emptyMessage="Nenhuma fruta cadastrada"
      />,
    )

    expect(screen.getByText('Nenhuma fruta cadastrada')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('anuncia o carregamento sem renderizar a tabela', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        caption="Frutas em estoque"
        getRowId={(fruit) => fruit.id}
        isLoading
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
