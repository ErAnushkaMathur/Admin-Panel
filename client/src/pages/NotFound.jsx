import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-syrup-muted">The page you're looking for doesn't exist.</p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong"
      >
        Go to dashboard
      </Link>
    </div>
  )
}
