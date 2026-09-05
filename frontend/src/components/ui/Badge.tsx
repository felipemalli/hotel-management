import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'border-border bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'border-red-200 bg-red-50 text-red-800 focus-visible:ring-destructive/20 dark:border-transparent dark:bg-destructive/20 dark:text-red-400 dark:focus-visible:ring-destructive/40 [a]:hover:bg-red-100 dark:[a]:hover:bg-destructive/30',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-transparent dark:bg-emerald-500/20 dark:text-emerald-400 [a]:hover:bg-emerald-100 dark:[a]:hover:bg-emerald-500/30',
        warning:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-transparent dark:bg-amber-500/20 dark:text-amber-400 [a]:hover:bg-amber-100 dark:[a]:hover:bg-amber-500/30',
        info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-transparent dark:bg-blue-500/20 dark:text-blue-400 [a]:hover:bg-blue-100 dark:[a]:hover:bg-blue-500/30',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }
