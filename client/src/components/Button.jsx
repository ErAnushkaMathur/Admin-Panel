import { LoaderCircle } from 'lucide-react'

const VARIANTS = {
  primary: 'bg-primary-strong text-white hover:bg-primary-strong shadow-soft',
  secondary: 'bg-surface text-syrup ring-1 ring-border hover:bg-background-deep',
  ghost: 'text-syrup-soft hover:bg-background-deep',
  danger: 'bg-primary-strong text-white hover:bg-primary-ink',
}

export default function Button({ variant = 'primary', loading = false, icon: Icon, children, className = '', ...props }) {
  return (
    <button
      type="button"
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-150 enabled:active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  )
}
