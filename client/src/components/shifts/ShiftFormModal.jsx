import { useState } from 'react'
import { Moon } from 'lucide-react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import FormField from '../FormField.jsx'
import Alert from '../Alert.jsx'
import { shiftsApi } from '../../api/shifts.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { useAuth } from '../../hooks/useAuth.js'

const EMPTY = { name: '', startTime: '09:00', endTime: '18:00' }

// Add (shift = null) or edit a shift. Mount with a `key` so the form resets per shift.
export default function ShiftFormModal({ shift, onClose, onSaved }) {
  const isEdit = Boolean(shift)
  // New shifts start from the shop's default grace (Settings)
  const { business } = useAuth()
  const defaultGrace = business?.attendanceSettings?.defaultGraceMinutes ?? 10
  const [form, setForm] = useState(
    isEdit
      ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, graceMinutes: String(shift.graceMinutes) }
      : { ...EMPTY, graceMinutes: String(defaultGrace) },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  // Display hint only; the server decides crossesMidnight
  const endsNextDay = form.startTime && form.endTime && form.endTime < form.startTime

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    const payload = {
      ...form,
      graceMinutes: form.graceMinutes === '' ? undefined : Number(form.graceMinutes),
    }
    try {
      if (isEdit) await shiftsApi.update(shift._id, payload)
      else await shiftsApi.create(payload)
      onSaved()
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      setError(Object.keys(fields).length ? '' : getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Edit shift' : 'Add shift'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="shift-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Add shift'}
          </Button>
        </>
      }
    >
      <form id="shift-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FormField
          label="Name"
          name="name"
          placeholder="e.g. Morning, Evening, Full Day"
          autoFocus
          maxLength={60}
          value={form.name}
          onChange={update}
          error={fieldErrors.name}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Start time"
            name="startTime"
            type="time"
            value={form.startTime}
            onChange={update}
            error={fieldErrors.startTime}
          />
          <FormField
            label="End time"
            name="endTime"
            type="time"
            value={form.endTime}
            onChange={update}
            error={fieldErrors.endTime}
          />
        </div>
        {endsNextDay && (
          <div className="flex items-start gap-2 rounded-xl bg-background-deep px-3.5 py-3 text-sm text-syrup-soft">
            <Moon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>This shift ends the next day. Attendance counts on the date the shift starts.</span>
          </div>
        )}
        <FormField
          label="Grace minutes"
          name="graceMinutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={180}
          value={form.graceMinutes}
          onChange={update}
          error={fieldErrors.graceMinutes}
        />
        <p className="-mt-2 text-xs text-syrup-muted">Staff arriving within this many minutes of the start time are not marked late.</p>
      </form>
    </Modal>
  )
}
