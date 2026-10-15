import { useId, useState } from 'react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import FormField from '../FormField.jsx'
import SelectField from '../SelectField.jsx'
import { leavesApi } from '../../api/leaves.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { todayIST } from '../../utils/date.js'
import { LEAVE_TYPES } from './leaveMeta.js'

const MODES = {
  request: {
    title: 'Record leave request',
    submit: 'Save request',
    note: 'It stays pending until you or a manager approves it.',
    save: leavesApi.request,
  },
  onBehalf: {
    title: 'Add approved leave',
    submit: 'Add leave',
    note: 'Approved immediately and recorded in the audit log under your name.',
    save: leavesApi.addOnBehalf,
  },
}

// mode: 'request' (pending) | 'onBehalf' (owner only, approved at once)
export default function LeaveFormModal({ mode, employees, onClose, onSaved }) {
  const config = MODES[mode]
  const reasonId = useId()
  const today = todayIST()
  const [form, setForm] = useState({ employeeId: '', fromDate: today, toDate: today, type: 'paid', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const set = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value }
      // Keep the end date from falling before the start date while picking
      if (field === 'fromDate' && value && next.toDate < value) next.toDate = value
      return next
    })
    setFieldErrors((errs) => ({ ...errs, [field]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.employeeId) {
      setFieldErrors({ employeeId: 'Pick an employee' })
      return
    }
    setSaving(true)
    try {
      const saved = await config.save({ ...form, reason: form.reason.trim() })
      onSaved(saved)
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      // Overlap errors also mark the start date; show the full sentence on top too
      const isOverlap = err.response?.data?.error?.code === 'LEAVE_OVERLAP'
      setError(isOverlap || Object.keys(fields).length === 0 ? getErrorMessage(err) : '')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={config.title}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="leave-form" loading={saving}>
            {config.submit}
          </Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="rounded-xl bg-background px-3.5 py-2.5 text-sm text-syrup-soft">{config.note}</p>
        {error && <Alert>{error}</Alert>}

        <SelectField label="Employee" name="employeeId" value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} error={fieldErrors.employeeId}>
          <option value="">Select employee</option>
          {employees.map((emp) => (
            <option key={emp._id} value={emp._id}>
              {emp.name} (#{emp.employeeCode})
            </option>
          ))}
        </SelectField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="From" name="fromDate" type="date" value={form.fromDate} onChange={(e) => set('fromDate', e.target.value)} error={fieldErrors.fromDate} />
          <FormField label="To" name="toDate" type="date" min={form.fromDate} value={form.toDate} onChange={(e) => set('toDate', e.target.value)} error={fieldErrors.toDate} />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Type</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {Object.entries(LEAVE_TYPES).map(([value, meta]) => {
              const selected = form.type === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set('type', value)}
                  className={`rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selected ? 'border-primary bg-primary-tint' : 'border-border hover:bg-background'
                  }`}
                >
                  <span className="block text-sm font-semibold">{meta.label}</span>
                  <span className="block text-xs text-syrup-muted">{meta.hint}</span>
                </button>
              )
            })}
          </div>
          {fieldErrors.type && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{fieldErrors.type}</p>}
        </fieldset>

        <div>
          <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium">
            Reason <span className="font-normal text-syrup-muted">(optional)</span>
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={500}
            value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="e.g. Sister's wedding"
            className="w-full resize-none rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-sm outline-none placeholder:text-syrup-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </form>
    </Modal>
  )
}
