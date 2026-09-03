import type { SVGProps } from 'react'

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
      <path d="M16.75 3.25v3.5h-3.5" />
    </svg>
  )
}
