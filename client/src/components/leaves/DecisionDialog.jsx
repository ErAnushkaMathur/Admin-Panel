import { useId, useState } from 'react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import { leavesApi } from '../../api/leaves.js'
import { getErrorMessage } from '../../api/client.js'
import { formatDateRange } from '../../utils/format.js'
import { LEAVE_TYPES } from './leaveMeta.js'

// Approve or reject a pending leave, with an optional note (saved in the audit log)
export default function DecisionDialog({ leave, decision, onClose, onDone }) {
  const noteId = useId()
  const approving = decision === 'approve'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      await (approving ? leavesApi.approve : leavesApi.reject)(leave._id, note.trim() || undefined)
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={approving ? 'Approve leave?' : 'Reject leave?'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={approving ? 'primary' : 'danger'} onClick={handleConfirm} loading={busy}>
            {approving ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Alert>{error}</Alert>}
        <div className="rounded-xl bg-background px-3.5 py-3">
          <p className="font-semibold">
            {leave.employee.name} <span className="font-mono font-normal text-syrup-muted">#{leave.employee.employeeCode}</span>
          </p>
          <p className="text-syrup-soft">
            {formatDateRange(leave.fromDate, leave.toDate)} · {leave.days} {leave.days === 1 ? 'day' : 'days'} ·{' '}
            {LEAVE_TYPES[leave.type]?.label ?? leave.type} leave
          </p>
          {leave.reason && <p className="mt-1 text-syrup-muted">“{leave.reason}”</p>}
        </div>
        {approving && <p className="text-syrup-soft">These days will show as On leave in Attendance (unless they actually punch in).</p>}
        <div>
          <label htmlFor={noteId} className="mb-1.5 block font-medium">
            Note <span className="font-normal text-syrup-muted">(optional, saved in the audit log)</span>
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={approving ? 'e.g. Enjoy the function' : 'e.g. Short staffed during Diwali rush'}
            className="w-full resize-none rounded-xl border border-border bg-background/40 px-3.5 py-2.5 outline-none placeholder:text-syrup-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
    </Modal>
  )
}
