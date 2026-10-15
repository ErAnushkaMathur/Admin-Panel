import { CircleAlert } from 'lucide-react'

export default function ServerErrorScreen({ onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 text-center shadow-soft">
        <CircleAlert className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">Can't reach the server</h1>
        <p className="mt-1 text-sm text-syrup-muted">Check your connection and try again.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 w-full rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
