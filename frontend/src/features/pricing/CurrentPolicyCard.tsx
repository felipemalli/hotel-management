import { Typography } from '@/components/ui'
import { formatISODateTime } from '@/lib/format/dates'
import { formatBRL, formatDecimalBR } from '@/lib/format/money'

import type { PricingPolicy } from './types'

interface PolicyGroupItem {
  label: string
  value: string
}

function PolicyGroup({ title, items }: { title: string; items: readonly PolicyGroupItem[] }) {
  return (
    <div className="flex flex-col gap-3.5 border-border p-5 not-last:border-b sm:border-b-0 sm:not-last:border-r">
      <Typography as="p" variant="mono" className="tracking-widest text-muted-foreground">
        {title}
      </Typography>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-3">
            <Typography as="span" variant="body" tone="muted">
              {item.label}
            </Typography>
            <Typography as="span" variant="mono" weight="medium" className="text-right">
              {item.value}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CurrentPolicyCard({ policy }: { policy: PricingPolicy }) {
  const vigenteDesde =
    policy.created_by === null
      ? 'a implantação (tarifa do briefing)'
      : formatISODateTime(policy.effective_from)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <PolicyGroup
          title="DIÁRIAS"
          items={[
            { label: 'Seg – Sex', value: formatBRL(policy.weekday_rate) },
            { label: 'Sáb – Dom', value: formatBRL(policy.weekend_rate) },
          ]}
        />
        <PolicyGroup
          title="VAGA DE GARAGEM"
          items={[
            { label: 'Seg – Sex', value: formatBRL(policy.weekday_park) },
            { label: 'Sáb – Dom', value: formatBRL(policy.weekend_park) },
          ]}
        />
        <PolicyGroup
          title="HORÁRIOS E MULTA"
          items={[
            { label: 'Check-in abre às', value: policy.checkin_opens },
            { label: 'Limite de checkout', value: policy.checkout_limit },
            {
              // Fator como veio: converter em % seria aritmética.
              label: 'Fator da multa',
              value: `${formatDecimalBR(policy.late_fee_factor)} × a diária do dia da saída`,
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border bg-muted/40 px-5 py-3">
        <Typography as="p" variant="caption">
          Vigente desde{' '}
          <Typography as="span" variant="caption" className="text-foreground">
            {vigenteDesde}
          </Typography>{' '}
          · publicada por{' '}
          <Typography as="span" variant="caption" className="text-foreground">
            {policy.created_by?.username ?? 'sistema'}
          </Typography>
        </Typography>
        <Typography as="p" variant="caption">
          Nota:{' '}
          <Typography as="span" variant="caption" className="text-foreground">
            {policy.note === '' ? '—' : policy.note}
          </Typography>
        </Typography>
      </div>
    </div>
  )
}
