import { render, screen } from '@testing-library/react'
import type { SVGProps } from 'react'
import { describe, expect, it } from 'vitest'

import { AlertIcon } from './AlertIcon'
import { CloseIcon } from './CloseIcon'
import { RefreshIcon } from './RefreshIcon'
import { SpinnerIcon } from './SpinnerIcon'

const ICONS: [string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element][] = [
  ['AlertIcon', AlertIcon],
  ['CloseIcon', CloseIcon],
  ['RefreshIcon', RefreshIcon],
  ['SpinnerIcon', SpinnerIcon],
]

describe('icons', () => {
  for (const [name, Icon] of ICONS) {
    it(`${name} e decorativo e herda a cor do texto`, () => {
      render(<Icon data-testid="icon" />)

      const icon = screen.getByTestId('icon')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('focusable', 'false')
      expect(icon).toHaveAttribute('stroke', 'currentColor')
    })

    it(`${name} deixa as props do chamador vencerem os padroes`, () => {
      render(
        <Icon
          data-testid="icon"
          className="size-4"
          role="img"
          aria-label="Aviso"
          aria-hidden={undefined}
        />,
      )

      const icon = screen.getByTestId('icon')
      expect(icon).toHaveClass('size-4')
      expect(icon).toHaveAccessibleName('Aviso')
    })
  }
})
