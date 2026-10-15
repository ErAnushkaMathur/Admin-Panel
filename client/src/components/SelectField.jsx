import { useId } from 'react'
import { ChevronDown } from 'lucide-react'

// Styled native <select> matching FormField. `label` can be visually hidden with `hideLabel`.
export default function SelectField({ label, hideLabel = false, error, children, className = '', ...selectProps }) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium'}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`w-full appearance-none rounded-xl border bg-surface py-2.5 pl-3.5 pr-10 text-sm outline-none transition focus:ring-2 ${
            error ? 'border-primary focus:ring-primary/30' : 'border-border focus:border-primary focus:ring-primary/20'
          }`}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-syrup-muted"
          aria-hidden="true"
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 animate-error-in text-xs text-primary-ink">
          {error}
        </p>
      )}
    </div>
  )
}
