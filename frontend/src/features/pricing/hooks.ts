import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { DEFAULT_STALE_TIME_MS } from '@/lib/api/queryClient'
import { PRICING_ROOT } from '@/lib/api/queryKeys'
import { useInvalidateServerState } from '@/lib/api/useInvalidateServerState'

import { createPolicy, fetchCurrentPolicy, fetchPolicies } from './api'
import type { CreatePolicyPayload, PricingPolicy } from './types'

export const pricingKeys = {
  current: [...PRICING_ROOT, 'current'] as const,
  list: (page: number) => [...PRICING_ROOT, 'list', { page }] as const,
}

export function useCurrentPolicy() {
  return useQuery({
    queryKey: pricingKeys.current,
    queryFn: fetchCurrentPolicy,
    staleTime: DEFAULT_STALE_TIME_MS,
  })
}

export function usePolicies(page: number) {
  return useQuery({
    queryKey: pricingKeys.list(page),
    queryFn: () => fetchPolicies(page),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  })
}

export function useCreatePolicy(options?: { onSuccess?: (policy: PricingPolicy) => void }) {
  const invalidateServerState = useInvalidateServerState()

  return useMutation({
    mutationFn: (payload: CreatePolicyPayload) => createPolicy(payload),
    onSuccess: (policy) => {
      invalidateServerState()
      options?.onSuccess?.(policy)
    },
  })
}
