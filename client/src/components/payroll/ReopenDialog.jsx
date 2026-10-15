import { useId, useState } from 'react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import { payrollApi } from '../../api/payroll.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { monthLabel } from './payrollMeta.js'

// Owner only: finalized (unpaid) rows go back to draft. The reason goes in the audit log.
export default function ReopenDialog({ month, finalizedCount, paidCount, onClose, onDone }) {
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    if (reason.trim().length < 3) {
      setFieldError('Write a short reason')
      return
    }
    setBusy(true)
    setError('')
    try {
      await payrollApi.reopen(month, reason.trim())
      onDone()
    } catch (err) {
      setFieldError(getFieldErrors(err).reason ?? '')
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`Reopen ${monthLabel(month)}?`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={busy}>
            Reopen
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Alert>{error}</Alert>}
        <p className="text-syrup-soft">
          {finalizedCount} finalized {finalizedCount === 1 ? 'salary goes' : 'salaries go'} back to draft so you can recalculate.
          {paidCount > 0 && ` ${paidCount} already paid ${paidCount === 1 ? 'stays' : 'stay'} locked.`} The finalized payslips are kept in
          history.
        </p>
        <div>
          <label htmlFor={reasonId} className="mb-1.5 block font-medium">
            Reason <span className="font-normal text-syrup-muted">(required, saved in the audit log)</span>
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setFieldError('')
            }}
            aria-invalid={Boolean(fieldError)}
            placeholder="e.g. Attendance for 12 Sept was corrected"
            className={`w-full resize-none rounded-xl border bg-background/40 px-3.5 py-2.5 outline-none placeholder:text-syrup-muted focus:bg-surface focus:ring-2 ${
              fieldError ? 'border-primary focus:ring-primary/30' : 'border-border focus:border-primary focus:ring-primary/20'
            }`}
          />
          {fieldError && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{fieldError}</p>}
        </div>
      </div>
    </Modal>
  )
}
