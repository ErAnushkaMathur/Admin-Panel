import { useState } from 'react'
import { Check, Copy, KeyRound, TriangleAlert } from 'lucide-react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers / non-secure contexts
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  }
}

// Shows a freshly generated PIN exactly once. It can only be closed with the button,
// so a stray click or Escape can't lose it. The PIN lives only in the parent's state.
export default function PinModal({ employee, pin, reset = false, onDone }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (await copyText(pin)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Modal
      open
      dismissible={false}
      title={reset ? 'New PIN created' : 'Employee added'}
      onClose={onDone}
      footer={<Button onClick={onDone}>I've saved the PIN</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm text-syrup-soft">
          {reset ? 'The old PIN no longer works. ' : ''}
          <span className="font-semibold">{employee.name}</span> punches in with their employee code and this PIN.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-background p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-syrup-muted">Employee code</p>
            <p className="mt-1 text-3xl font-bold tracking-wider">{employee.employeeCode}</p>
          </div>
          <div className="rounded-2xl bg-primary-tint p-4 text-center">
            <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wide text-primary-ink">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              PIN
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-primary-ink" data-testid="pin-value">
              {pin}
            </p>
          </div>
        </div>

        <Button variant="secondary" icon={copied ? Check : Copy} onClick={handleCopy} className="w-full">
          {copied ? 'Copied!' : 'Copy PIN'}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'PIN copied to clipboard' : ''}
        </span>

        <div role="alert" className="flex items-start gap-2 rounded-xl bg-amber-tint px-3.5 py-3 text-sm text-amber-ink ring-1 ring-amber/40">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">This PIN won't be shown again.</span> Give it to {employee.name} now. If it's
            lost, use “Reset PIN” on their profile to create a new one.
          </p>
        </div>
      </div>
    </Modal>
  )
}
