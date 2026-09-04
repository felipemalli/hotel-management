import { ChevronDownIcon } from 'lucide-react'

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui'

export interface SessionMenuProps {
  username: string
  isAdmin: boolean
  onSignOut: () => void
}

export function SessionMenu({ username, isAdmin, onSignOut }: SessionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="Menu da sessão" />}
      >
        {username}
        {isAdmin ? <Badge variant="info">admin</Badge> : null}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onSignOut}>Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
