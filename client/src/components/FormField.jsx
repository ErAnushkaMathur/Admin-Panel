import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function FormField({ label, error, type = 'text', ...inputProps }) {
  const id = useId()
  const errorId = `${id}-error`
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && showPassword ? 'text' : type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-xl border bg-background/40 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-syrup-muted focus:bg-surface focus:ring-2 ${
            isPassword ? 'pr-11' : ''
          } ${error ? 'border-primary focus:ring-primary/30' : 'border-border focus:border-primary focus:ring-primary/20'}`}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-syrup-faint hover:text-syrup-muted"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 animate-error-in text-xs text-primary-ink">
          {error}
        </p>
      )}
    </div>
  )
}
