import { useEffect, useId } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'

// Accessible dialog: Escape and backdrop click close it (unless `busy`), body scroll is locked.
// `dismissible={false}` hides the X and ignores Escape/backdrop, so it closes only via footer buttons.
// Fades and slides in on open. To animate the close too, render it inside <AnimatePresence> at the
// call site. With prefers-reduced-motion it appears and disappears without movement.
export default function Modal({ open, title, onClose, busy = false, dismissible = true, children, footer }) {
  const titleId = useId()
  const canDismiss = dismissible && !busy
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && canDismiss && onClose()
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, canDismiss, onClose])

  if (!open) return null

  const panel = reduce
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: 'easeOut' } },
        exit: { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15, ease: 'easeIn' } },
      }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <m.div
        className="absolute inset-0 bg-syrup/50"
        onClick={() => canDismiss && onClose()}
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.18 } }}
        exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
      />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-soft sm:max-w-lg sm:rounded-2xl"
        {...panel}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1.5 text-syrup-muted transition duration-150 hover:bg-background-deep enabled:active:scale-90 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
      </m.div>
    </div>
  )
}
