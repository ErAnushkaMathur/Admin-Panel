import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager' }

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default function UserMenu() {
  const { user, business, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef(null)

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    setLoggingOut(true)
    await logout().catch(() => {})
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-background-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary-ink">
          {initials(user?.name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-36 truncate text-sm font-semibold leading-tight">{user?.name}</span>
          <span className="block text-xs text-syrup-muted">{ROLE_LABELS[user?.role] || user?.role}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-syrup-muted sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 rounded-2xl bg-surface p-2 shadow-soft ring-1 ring-border">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-syrup-muted">{user?.email}</p>
            <p className="mt-1 truncate text-xs text-syrup-muted">
              {ROLE_LABELS[user?.role] || user?.role} · {business?.name}
            </p>
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-primary-ink hover:bg-primary-tint disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  )
}
