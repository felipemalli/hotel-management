import { Typography } from '@/components/ui'

export function IrisEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex size-8.5 items-center justify-center rounded-full border-2 border-border"
      >
        <span className="size-2.25 rounded-full bg-muted-foreground/40" />
      </span>
      <Typography as="p" variant="body" tone="muted" className="max-w-[46ch]">
        A Íris lê reservas, quartos, hóspedes e a tarifa vigente. Pergunte em linguagem natural —
        quando houver algo a fazer, ela oferece a ação.
      </Typography>
    </div>
  )
}
