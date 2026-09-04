import { DescriptionList } from '@/components/common'
import { formatISODateTime } from '@/lib/format/dates'
import { formatBRL, formatDecimalBR } from '@/lib/format/money'

import type { PricingPolicy } from './types'

export function CurrentPolicyCard({ policy }: { policy: PricingPolicy }) {
  return (
    <div className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
      <DescriptionList
        items={[
          { label: 'Diária (seg–sex)', value: formatBRL(policy.weekday_rate) },
          { label: 'Diária (sáb–dom)', value: formatBRL(policy.weekend_rate) },
          { label: 'Vaga (seg–sex)', value: formatBRL(policy.weekday_park) },
          { label: 'Vaga (sáb–dom)', value: formatBRL(policy.weekend_park) },
          {
            // Fator como veio: converter em % seria aritmética.
            label: 'Multa de checkout tardio',
            value: `${formatDecimalBR(policy.late_fee_factor)} × a diária do dia da saída`,
          },
          { label: 'Check-in abre às', value: policy.checkin_opens },
          { label: 'Limite de checkout', value: policy.checkout_limit },
          {
            // Bootstrap usa data-sentinela 2000-01-01; created_by nulo a distingue.
            label: 'Vigente desde',
            value:
              policy.created_by === null
                ? 'a implantação (tarifa do briefing)'
                : formatISODateTime(policy.effective_from),
          },
          { label: 'Publicada por', value: policy.created_by?.username ?? 'sistema' },
          { label: 'Nota', value: policy.note === '' ? '—' : policy.note },
        ]}
      />
    </div>
  )
}
