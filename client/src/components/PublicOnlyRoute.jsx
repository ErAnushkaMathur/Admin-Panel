import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

// Login/Register: logged-in users are sent back to where they came from (or the dashboard)
export default function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'authenticated') {
    const to = location.state?.from?.pathname || '/dashboard'
    return <Navigate to={to} replace />
  }
  // While the session is being checked, show the form anyway; it redirects if a session is found
  return <Outlet />
}
