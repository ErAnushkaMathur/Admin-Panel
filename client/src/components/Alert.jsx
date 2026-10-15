import { CircleAlert, Info } from 'lucide-react'

const styles = {
  error: 'bg-primary-tint text-primary-ink',
  info: 'bg-background-deep text-syrup-soft',
}

export default function Alert({ variant = 'error', children }) {
  const Icon = variant === 'error' ? CircleAlert : Info
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`flex animate-error-in items-start gap-2 rounded-xl px-3.5 py-3 text-sm ${styles[variant]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
