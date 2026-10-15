import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import Alert from './Alert.jsx'
import { getErrorMessage } from '../api/client.js'

// Confirm-then-act dialog. `onConfirm` may be async; its error is shown inside the dialog.
export default function ConfirmDialog({ title, children, confirmLabel, variant = 'primary', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-syrup-soft">
        {error && <Alert>{error}</Alert>}
        {children}
      </div>
    </Modal>
  )
}
