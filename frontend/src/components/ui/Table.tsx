import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

/**
 * Primitivos de tabela (SPEC 5.1). Wrappers finos de proposito: a semantica
 * HTML (`table`/`thead`/`th scope`) fica intacta para leitor de tela e para os
 * queries por `role` dos testes.
 */

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
}

export function TR({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>
}

export function TH({ children, className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

export function TD({ children, className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 align-middle text-slate-800 ${className}`} {...props}>
      {children}
    </td>
  )
}
