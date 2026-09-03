import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  ErrorBoundary as ReactErrorBoundary,
  type FallbackProps,
  type OnErrorCallback,
} from 'react-error-boundary'

import { errorLogger } from '@/lib/errorLogger'

import { ErrorFallback } from './ErrorFallback'

export interface ErrorBoundaryProps {
  scope: string
  children: ReactNode
  fallback?: (props: FallbackProps) => ReactNode
  resetKeys?: unknown[]
}

export function ErrorBoundary({ scope, children, fallback, resetKeys }: ErrorBoundaryProps) {
  const queryErrors = useQueryErrorResetBoundary()

  const onError: OnErrorCallback = (error, info) => {
    errorLogger.capture(error, { scope, componentStack: info.componentStack })
  }

  return (
    <ReactErrorBoundary
      fallbackRender={fallback ?? ErrorFallback}
      onError={onError}
      // Sem isto o retry remonta a árvore e a query cai no mesmo erro em cache.
      onReset={() => queryErrors.reset()}
      resetKeys={resetKeys}
    >
      {children}
    </ReactErrorBoundary>
  )
}
