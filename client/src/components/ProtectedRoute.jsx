import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import AppSkeleton from './AppSkeleton.jsx'
import ServerErrorScreen from './ServerErrorScreen.jsx'

// Renders child routes only for logged-in users; otherwise redirects to /login and remembers where they were going
export default function ProtectedRoute() {
  const { status, retry } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AppSkeleton />
  if (status === 'error') return <ServerErrorScreen onRetry={retry} />
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
