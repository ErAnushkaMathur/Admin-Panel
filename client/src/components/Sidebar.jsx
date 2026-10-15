import { NavLink } from 'react-router-dom'
import { CakeSlice, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS } from '../utils/navItems.js'
import { useAuth } from '../hooks/useAuth.js'

// collapsed: desktop icon-only mode, toggled by the button next to the business name.
// mobileOpen: drawer state below the lg breakpoint (opened from the top bar, closed with the X).
export default function Sidebar({ businessName, collapsed, mobileOpen, onCloseMobile, onToggleCollapsed }) {
  const { user } = useAuth()
  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || user?.role === 'owner')
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-syrup/50 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-syrup text-syrup-subtle transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
        aria-label="Main navigation"
      >
        <div className={`flex h-16 shrink-0 items-center gap-3 px-5 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-strong text-white ${collapsed ? 'lg:hidden' : ''}`}>
            <CakeSlice className="h-5 w-5" aria-hidden="true" />
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-base font-semibold text-white ${collapsed ? 'lg:hidden' : ''}`}
            title={businessName}
          >
            {businessName}
          </span>
          {/* Desktop: collapse / expand (the only header item while collapsed) */}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden shrink-0 rounded-lg p-1.5 text-syrup-subtle transition duration-150 hover:bg-syrup-soft hover:text-white active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-controls="app-sidebar"
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          {/* Phones: close the drawer */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-syrup-faint hover:bg-syrup-soft hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onCloseMobile}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      collapsed ? 'lg:justify-center lg:px-0' : ''
                    } ${isActive ? 'bg-primary-strong text-white shadow-soft' : 'hover:bg-syrup-soft hover:text-white'}`
                  }
                >
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                  <span className={collapsed ? 'lg:sr-only' : ''}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}
