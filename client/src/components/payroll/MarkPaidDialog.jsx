import { useState } from 'react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import FormField from '../FormField.jsx'
import { payrollApi } from '../../api/payroll.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { formatRupees } from '../../utils/format.js'
import { todayIST } from '../../utils/date.js'
import { monthLabel } from './payrollMeta.js'

export default function MarkPaidDialog({ row, onClose, onDone }) {
  const today = todayIST()
  const [paidDate, setPaidDate] = useState(today)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      await payrollApi.markPaid(row._id, paidDate)
      onDone()
    } catch (err) {
      setFieldError(getFieldErrors(err).paidDate ?? '')
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Mark salary as paid?"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={busy} disabled={!paidDate}>
            Mark paid
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Alert>{error}</Alert>}
        <div className="rounded-xl bg-background px-3.5 py-3">
          <p className="font-semibold">{row.employee.name}</p>
          <p className="text-syrup-soft">
            {monthLabel(row.month)} · <span className="font-semibold">{formatRupees(row.snapshot.netPaise)}</span>
          </p>
        </div>
        <FormField label="Paid on" type="date" max={today} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} error={fieldError} />
        <p className="text-syrup-muted">A paid salary can&apos;t be reopened. This is saved in the audit log.</p>
      </div>
    </Modal>
  )
}
