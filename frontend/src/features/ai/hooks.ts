/**
 * Query e mutation da IA opcional (SPEC 7).
 *
 * `useAiStatus` e a consulta unica da SPEC 7.1: `staleTime: Infinity` porque a
 * presenca da chave e configuracao de processo, nao estado de negocio — ela
 * nao muda no meio do turno do atendente. Chave fora das raizes `["guests"]` /
 * `["reservations"]` de proposito: a invalidacao cruzada da SPEC 5.2 nao deve
 * arrastar esta consulta.
 *
 * Erro da mutation cai no handler global (toast, SPEC 8.2/E): `AI_DISABLED` e
 * `AI_UPSTREAM_ERROR` nao sao erro de campo, e o formulario continua
 * preenchivel a mao — a IA e conveniencia, nunca caminho unico.
 */

import { useMutation, useQuery } from '@tanstack/react-query'

import { fetchAiStatus, parseGuestText } from './api'
import type { ParsedGuestFields } from './types'

export const aiKeys = {
  status: ['ai', 'status'] as const,
}

export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: fetchAiStatus,
    staleTime: Infinity,
  })
}

export function useParseGuestText(options?: { onSuccess?: (fields: ParsedGuestFields) => void }) {
  return useMutation({
    mutationFn: (text: string) => parseGuestText(text),
    onSuccess: options?.onSuccess,
  })
}
