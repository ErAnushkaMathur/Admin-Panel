import { CircleAlert, RotateCcw } from 'lucide-react'
import Button from './Button.jsx'

export default function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl bg-surface px-6 py-14 text-center shadow-soft">
      <CircleAlert className="h-10 w-10 text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">Couldn't load this page</h2>
      <p className="mt-1 max-w-sm text-sm text-syrup-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" icon={RotateCcw} onClick={onRetry} className="mt-6">
          Try again
        </Button>
      )}
    </div>
  )
}
