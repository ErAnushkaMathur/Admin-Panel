import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

// Split into separate chunks so the public punch page (opened on low-end phones)
// downloads only what it needs, not the whole admin app.
const PunchPage = lazy(() => import('./pages/PunchPage.jsx'))
const AdminApp = lazy(() => import('./AdminApp.jsx'))

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <Routes>
        {/* Public punch page for employees: no login, no session check */}
        <Route path="/punch/:businessToken" element={<PunchPage />} />
        {/* Owner / manager app */}
        <Route path="*" element={<AdminApp />} />
      </Routes>
    </Suspense>
  )
}
