import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DescriptionList } from './DescriptionList'

describe('DescriptionList', () => {
  it('emparelha rotulo e valor na ordem recebida', () => {
    render(
      <DescriptionList
        items={[
          { label: 'Quarto', value: '101' },
          { label: 'Vaga', value: 'Sim' },
        ]}
      />,
    )

    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Quarto', 'Vaga'])
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      '101',
      'Sim',
    ])
  })

  it('aceita um no como valor, e nao so texto', () => {
    render(<DescriptionList items={[{ label: 'Titular', value: <strong>Ana Souza</strong> }]} />)

    expect(screen.getByText('Ana Souza').tagName).toBe('STRONG')
  })
})
