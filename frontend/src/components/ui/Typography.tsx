import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithoutRef, ElementType } from 'react'

import { cn } from '@/lib/utils'

const typographyVariants = cva('', {
  variants: {
    variant: {
      pageTitle: 'font-display text-xl font-semibold tracking-tight text-foreground',
      title: 'font-display text-lg font-semibold tracking-tight text-foreground',
      sectionTitle: 'font-display text-base font-semibold text-foreground',
      cardTitle: 'font-display text-sm font-semibold text-foreground',
      body: 'text-sm text-foreground',
      label: 'text-sm font-medium text-foreground',
      caption: 'text-xs text-muted-foreground',
      overline: 'text-xs font-semibold tracking-wide text-muted-foreground uppercase',
      mono: 'font-mono text-xs text-foreground',
    },
    tone: {
      default: '',
      muted: 'text-muted-foreground',
      mutedLight: 'text-muted-foreground/70',
      destructive: 'text-destructive',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
    },
  },
  defaultVariants: {
    variant: 'body',
    tone: 'default',
  },
})

type TypographyElement =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'p'
  | 'span'
  | 'dt'
  | 'dd'
  | 'legend'
  | 'label'
  | 'caption'
  | 'strong'
  | 'small'
  | 'li'

export type TypographyProps<T extends TypographyElement> = {
  as: T
} & VariantProps<typeof typographyVariants> &
  ComponentPropsWithoutRef<T>

function Typography<T extends TypographyElement>({
  as,
  variant,
  tone,
  weight,
  className,
  ...props
}: TypographyProps<T>) {
  const Component = as as ElementType
  return (
    <Component
      data-slot="typography"
      className={cn(typographyVariants({ variant, tone, weight }), className)}
      {...props}
    />
  )
}

export { Typography, typographyVariants }
