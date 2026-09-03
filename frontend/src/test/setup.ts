import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem `globals`, o auto-cleanup do RTL nao se registra: e este arquivo que
// desmonta a arvore entre casos.
afterEach(cleanup)
