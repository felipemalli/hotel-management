import type { SVGProps } from 'react'

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M5.5 5.5l9 9" />
      <path d="M14.5 5.5l-9 9" />
    </svg>
  )
}
