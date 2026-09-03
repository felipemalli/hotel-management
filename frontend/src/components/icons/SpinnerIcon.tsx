import type { SVGProps } from 'react'

export function SpinnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="10" cy="10" r="7.5" opacity="0.25" />
      <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" />
    </svg>
  )
}
