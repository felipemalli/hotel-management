/**
 * Tipos do contrato da IA opcional (SPEC 7.1).
 *
 * `ParsedGuestFields` tem exatamente as chaves do `CreateGuestPayload` porque
 * o resultado da extracao **so preenche o formulario**: nada e persistido pela
 * IA, o atendente revisa e submete (human-in-the-loop).
 */

export interface AiStatus {
  enabled: boolean
}

export interface ParsedGuestFields {
  full_name: string
  document: string
  phone: string
}
