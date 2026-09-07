import { LogOutIcon } from 'lucide-react'

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Typography,
} from '@/components/ui'

export interface SessionMenuProps {
  username: string
  isAdmin: boolean
  onSignOut: () => void
}

export function SessionMenu({ username, isAdmin, onSignOut }: SessionMenuProps) {
  const initials = username.slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Menu da sessão"
            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-sidebar-accent/60"
          />
        }
      >
        <div className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials}
        </div>
        <div className="flex flex-wrap grow gap-2">
          <Typography as="p" variant="label" className="truncate">
            {username}
          </Typography>
          {isAdmin ? (
            <Badge variant="info" className="w-fit">
              admin
            </Badge>
          ) : null}
        </div>
        <LogOutIcon className="size-4 flex-none opacity-40" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onSignOut}>Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
