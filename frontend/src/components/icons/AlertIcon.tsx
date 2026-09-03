import type { SVGProps } from 'react'

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M10 2.75 1.75 17.25h16.5L10 2.75Z" />
      <path d="M10 7.75v4.5" />
      <path d="M10 14.75h.01" />
    </svg>
  )
}
