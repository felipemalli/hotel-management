export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-card px-4 py-10 text-center text-sm text-muted-foreground ring-1 ring-border">
      {message}
    </div>
  )
}
