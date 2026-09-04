import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'

import { Alert } from '@/components/common'
import { Button, Input } from '@/components/ui'
import { isLocallyPresented } from '@/lib/api/queryClient'
import { errorMessage } from '@/lib/errors/errors'
import { applyServerErrors } from '@/lib/forms/forms'

import type { Credentials } from './api'
import { useLogin } from './hooks'
import { credentialsSchema } from './schemas'
import { useAuth } from './useAuth'

const FIELDS = ['username', 'password'] as const

export function LoginPage() {
  const { isAuthenticated } = useAuth()
  const signIn = useLogin()

  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { username: '', password: '' },
  })

  const submit = handleSubmit((credentials) => {
    signIn.mutate(credentials, {
      onError: (error) => {
        if (applyServerErrors(error, setError, FIELDS)) return
        // Um código que a política global manda ao toast não se repete aqui: o
        // formulário só apresenta o que é da sua alçada, como a credencial errada.
        if (!isLocallyPresented(error)) return
        setError('root.server', {
          type: 'server',
          message: errorMessage(error, { NOT_AUTHENTICATED: 'Usuário ou senha inválidos.' }),
        })
      },
    })
  })

  if (isAuthenticated) return <Navigate to="/" replace />

  const rootError = errors.root?.server?.message

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Gestão de Hóspedes</h1>
        <p className="mt-1 text-sm text-slate-600">Acesso do atendente.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
          {rootError ? <Alert tone="error">{rootError}</Alert> : null}
          <Input
            label="Usuário"
            autoComplete="username"
            error={errors.username?.message}
            {...register('username')}
          />
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" disabled={signIn.isPending}>
            {signIn.isPending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </main>
  )
}
