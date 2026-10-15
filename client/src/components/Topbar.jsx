import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Menu, Search } from 'lucide-react'
import UserMenu from './UserMenu.jsx'

// The desktop collapse toggle lives in the sidebar. On phones the sidebar is an off-screen drawer,
// so this bar keeps a button to open it (the drawer has its own close button).
export default function Topbar({ onOpenMobileNav, mobileNavOpen }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  // Staff search: opens the Employees list filtered by name, code, role or phone
  function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/employees?q=${encodeURIComponent(q)}` : '/employees')
    // The term now lives in the Employees page's own search box
    setQuery('')
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-xl p-2 text-syrup-soft transition duration-150 hover:bg-background-deep active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        aria-label="Open menu"
        aria-controls="app-sidebar"
        aria-expanded={mobileNavOpen}
      >
        <Menu className="h-5 w-5" />
      </button>

      <form role="search" onSubmit={handleSearch} className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-syrup-faint" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search staff…"
          aria-label="Search staff"
          maxLength={60}
          className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        {/* Badge count (pending leaves + missing checkouts) will come from the backend in Phases 3–5 */}
        <button
          type="button"
          className="relative rounded-xl p-2 text-syrup-soft transition duration-150 hover:bg-background-deep active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
        <UserMenu />
      </div>
    </header>
  )
}
