/**
 * Ids deterministicos que ligam aba e painel (`aria-controls` /
 * `aria-labelledby`).
 *
 * Modulo proprio, e nao export do `Tabs.tsx`: quem renderiza o painel nao
 * precisa importar o componente das abas para nomear o proprio container.
 */

export function tabId(value: string): string {
  return `tab-${value}`
}

export function tabPanelId(value: string): string {
  return `tabpanel-${value}`
}
