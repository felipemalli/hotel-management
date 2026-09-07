import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'

import { Alert, FormField } from '@/components/common'
import { Button, Input, Typography } from '@/components/ui'
import type { Credentials } from '@/features/auth/api'
import { useLogin } from '@/features/auth/hooks'
import { credentialsSchema } from '@/features/auth/schemas'
import { useAuth } from '@/features/auth/useAuth'
import { isLocallyPresented } from '@/lib/api/queryClient'
import { errorMessage } from '@/lib/errors/errors'
import { applyServerErrors } from '@/lib/forms/forms'

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
        // Código que a política global manda ao toast não se repete aqui.
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
        <Typography as="h1" variant="pageTitle">
          Gestão de Hóspedes
        </Typography>
        <Typography as="p" variant="body" tone="muted" className="mt-1">
          Acesso do atendente.
        </Typography>

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
          {rootError ? <Alert tone="error">{rootError}</Alert> : null}
          <FormField label="Usuário" error={errors.username?.message}>
            {(control) => (
              <Input
                autoComplete="username"
                placeholder="atendente"
                {...control}
                {...register('username')}
              />
            )}
          </FormField>
          <FormField label="Senha" error={errors.password?.message}>
            {(control) => (
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...control}
                {...register('password')}
              />
            )}
          </FormField>
          <Button type="submit" disabled={signIn.isPending}>
            {signIn.isPending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </main>
  )
}
