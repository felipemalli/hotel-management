import { DescriptionList } from '@/components/ui'
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
            // O fator é exibido como veio: convertê-lo em porcentagem seria
            // aritmética, e a doutrina do dinheiro vale para o fator também.
            label: 'Multa de checkout tardio',
            value: `${formatDecimalBR(policy.late_fee_factor)} × a diária do dia da saída`,
          },
          { label: 'Check-in abre às', value: policy.checkin_opens },
          { label: 'Limite de checkout', value: policy.checkout_limit },
          {
            // A linha do bootstrap carrega uma data-sentinela (2000-01-01) que
            // não significa nada na tela; `created_by` nulo a distingue, porque
            // publicação pela API sempre tem ator.
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
