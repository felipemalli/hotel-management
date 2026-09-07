export function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
}

export function formatYesNo(value: boolean): 'Sim' | 'Não' {
  return value ? 'Sim' : 'Não'
}
