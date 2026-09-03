import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { errorMessage, fieldErrors, isApiErrorCode } from '@/lib/errors'

import { useAuth } from './useAuth'

export function LoginPage() {
  const { isAuthenticated, signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFields({})
    setSubmitting(true)
    try {
      await signIn({ username, password })
    } catch (cause) {
      setFields(fieldErrors(cause))
      setError(
        isApiErrorCode(cause, 'NOT_AUTHENTICATED')
          ? 'Usuário ou senha inválidos.'
          : isApiErrorCode(cause, 'VALIDATION_ERROR')
            ? 'Informe usuário e senha.'
            : errorMessage(cause),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Gestão de Hóspedes</h1>
        <p className="mt-1 text-sm text-slate-600">Acesso do atendente.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Usuário"
            name="username"
            autoComplete="username"
            value={username}
            error={fields.username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            label="Senha"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            error={fields.password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </main>
  )
}
