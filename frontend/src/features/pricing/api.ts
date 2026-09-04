import { apiClient, type Paginated, parseResponse } from '@/lib/apiClient'

import { pricingPolicyPageSchema, pricingPolicySchema } from './schemas'
import type { CreatePolicyPayload, PricingPolicy } from './types'

export async function fetchPolicies(page: number): Promise<Paginated<PricingPolicy>> {
  const response = await apiClient.get<unknown>('/pricing-policies/', {
    params: page > 1 ? { page } : undefined,
  })
  return parseResponse(pricingPolicyPageSchema, response)
}

// Rota de objeto único, fora da paginação: é a política que rege agora.
export async function fetchCurrentPolicy(): Promise<PricingPolicy> {
  const response = await apiClient.get<unknown>('/pricing-policies/current/')
  return parseResponse(pricingPolicySchema, response)
}

export async function createPolicy(payload: CreatePolicyPayload): Promise<PricingPolicy> {
  const response = await apiClient.post<unknown>('/pricing-policies/', payload)
  return parseResponse(pricingPolicySchema, response)
}
