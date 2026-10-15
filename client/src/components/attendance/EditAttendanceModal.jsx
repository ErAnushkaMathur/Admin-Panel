import { useId, useState } from 'react'
import { Moon } from 'lucide-react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import FormField from '../FormField.jsx'
import SelectField from '../SelectField.jsx'
import { attendanceApi } from '../../api/attendance.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { formatDate, formatTime12 } from '../../utils/format.js'
import { toTimeInputIST } from '../../utils/date.js'
import { MANUAL_STATUS_OPTIONS, STATUS_META } from './statuses.js'

const MIN_REASON = 5

/**
 * Manual attendance correction (SPEC 4.7). Edits an existing record (PATCH) or creates one for a day
 * without a record (POST /attendance/manual). A reason is always required; the server audit-logs it.
 * `row`: { attendanceId, employee: { _id, name, employeeCode }, date, shift, punchIn, punchOut, manualStatus }
 */
export default function EditAttendanceModal({ row, onClose, onSaved }) {
  const isCreate = !row.attendanceId
  const reasonId = useId()
  const initial = {
    punchIn: toTimeInputIST(row.punchIn),
    punchOut: toTimeInputIST(row.punchOut),
    status: row.manualStatus ?? '',
  }
  const [form, setForm] = useState({ ...initial, reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setFieldErrors((errs) => ({ ...errs, [field]: undefined }))
  }
  const outNextDay = form.punchIn && form.punchOut && form.punchOut <= form.punchIn
  const reasonTooShort = form.reason.trim().length < MIN_REASON

  function buildPayload() {
    const reason = form.reason.trim()
    if (isCreate) {
      return {
        employeeId: row.employee._id,
        date: row.date,
        ...(form.punchIn && { punchIn: form.punchIn }),
        ...(form.punchOut && { punchOut: form.punchOut }),
        ...(form.status && { status: form.status }),
        reason,
      }
    }
    // Only send what changed; '' means "cleared"
    const changes = {}
    for (const field of ['punchIn', 'punchOut', 'status']) {
      if (form[field] !== initial[field]) changes[field] = form[field] || null
    }
    return { ...changes, reason }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (reasonTooShort) {
      setFieldErrors({ reason: `Please give a reason (at least ${MIN_REASON} characters)` })
      return
    }
    const payload = buildPayload()
    if (!isCreate && Object.keys(payload).length === 1) {
      setError('Change a punch time or the status first.')
      return
    }
    setSaving(true)
    try {
      if (isCreate) await attendanceApi.createManual(payload)
      else await attendanceApi.update(row.attendanceId, payload)
      onSaved()
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      setError(Object.keys(fields).length ? '' : getErrorMessage(err))
      setSaving(false)
    }
  }

  const shift = row.shift
  return (
    <Modal
      open
      title={isCreate ? 'Add attendance' : 'Edit attendance'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="attendance-edit-form" loading={saving}>
            {isCreate ? 'Add record' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="attendance-edit-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="rounded-xl bg-background px-3.5 py-3 text-sm">
          <p className="font-semibold">
            {row.employee.name} <span className="font-mono font-normal text-syrup-muted">#{row.employee.employeeCode}</span>
          </p>
          <p className="text-syrup-muted">
            {formatDate(row.date)}
            {shift && ` · ${shift.name ?? 'Shift'} ${formatTime12(shift.startTime)} – ${formatTime12(shift.endTime)}`}
          </p>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Punch in" name="punchIn" type="time" value={form.punchIn} onChange={set('punchIn')} error={fieldErrors.punchIn} />
          <FormField label="Punch out" name="punchOut" type="time" value={form.punchOut} onChange={set('punchOut')} error={fieldErrors.punchOut} />
        </div>
        {(outNextDay || shift?.crossesMidnight) && (
          <p className="-mt-2 flex items-start gap-1.5 text-xs text-syrup-muted">
            <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {shift?.crossesMidnight
              ? 'Night shift: times after midnight count as the next morning of this shift.'
              : 'Punch-out is earlier than punch-in, so it will be saved on the next day.'}
          </p>
        )}

        <SelectField label="Status" name="status" value={form.status} onChange={set('status')} error={fieldErrors.status}>
          <option value="">Automatic (from punch times)</option>
          {MANUAL_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              Mark as {STATUS_META[s].label.toLowerCase()}
            </option>
          ))}
        </SelectField>

        <div>
          <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium">
            Reason <span className="text-primary-ink">(required)</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            rows={3}
            maxLength={500}
            value={form.reason}
            onChange={set('reason')}
            placeholder="e.g. Phone battery died, confirmed she left at 4 PM"
            aria-invalid={Boolean(fieldErrors.reason)}
            aria-describedby={`${reasonId}-help`}
            className={`w-full resize-none rounded-xl border bg-background/40 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-syrup-muted focus:bg-surface focus:ring-2 ${
              fieldErrors.reason ? 'border-primary focus:ring-primary/30' : 'border-border focus:border-primary focus:ring-primary/20'
            }`}
          />
          <p id={`${reasonId}-help`} className={`mt-1 text-xs ${fieldErrors.reason ? 'text-primary-ink' : 'text-syrup-muted'}`}>
            {fieldErrors.reason || 'Saved in the audit log with your name.'}
          </p>
        </div>
      </form>
    </Modal>
  )
}
