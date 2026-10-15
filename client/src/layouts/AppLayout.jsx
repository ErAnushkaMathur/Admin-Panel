import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import AppMotion from '../components/motion/AppMotion.jsx'
import { useAuth } from '../hooks/useAuth.js'

const COLLAPSED_KEY = 'sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export default function AppLayout() {
  const { business } = useAuth()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close the drawer on Escape (nav links close it on click)
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Desktop: the sidebar's own button collapses/expands it (remembered across visits)
  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      } catch {
        // storage unavailable; preference just won't persist
      }
      return !c
    })
  }

  return (
    <AppMotion>
      <div className="flex min-h-screen">
        <Sidebar
          businessName={business?.name}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onToggleCollapsed={toggleCollapsed}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMobileNav={() => setMobileOpen(true)} mobileNavOpen={mobileOpen} />
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AppMotion>
  )
}
