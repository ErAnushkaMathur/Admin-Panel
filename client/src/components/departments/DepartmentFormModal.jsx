import { useState } from 'react'
import { Check } from 'lucide-react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import FormField from '../FormField.jsx'
import Alert from '../Alert.jsx'
import { departmentsApi } from '../../api/departments.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { departmentColors, DEPARTMENT_ICONS } from '../../utils/departmentIcons.js'

// Add (department = null) or edit a department. Mount with a `key` so the form resets per department.
export default function DepartmentFormModal({ department, onClose, onSaved }) {
  const isEdit = Boolean(department)
  const [palette] = useState(departmentColors)
  const [form, setForm] = useState(
    isEdit ? { name: department.name, color: department.color, icon: department.icon } : { name: '', color: palette[0].value, icon: 'users' },
  )
  // A department saved with an older colour keeps it as an extra choice
  const savedColor = isEdit && !palette.some((c) => c.value === department.color.toLowerCase()) ? [{ value: department.color, label: 'Current' }] : []
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      if (isEdit) await departmentsApi.update(department._id, form)
      else await departmentsApi.create(form)
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
      title={isEdit ? 'Edit department' : 'Add department'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="department-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Add department'}
          </Button>
        </>
      }
    >
      <form id="department-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <FormField
          label="Name"
          name="name"
          placeholder="e.g. Kitchen, Counter, Delivery"
          autoFocus
          maxLength={60}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={fieldErrors.name}
        />

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {[...savedColor, ...palette].map(({ value, label }) => {
              const selected = form.color === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  title={label}
                  onClick={() => set('color', value)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-syrup focus-visible:ring-offset-2 ${
                    selected ? 'ring-2 ring-syrup ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: value }}
                >
                  {selected && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          {fieldErrors.color && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{fieldErrors.color}</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Icon</legend>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {Object.entries(DEPARTMENT_ICONS).map(([key, { icon: Icon, label }]) => {
              const selected = form.icon === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set('icon', key)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selected ? 'border-primary bg-primary-tint text-primary-ink' : 'border-border text-syrup-muted hover:bg-background'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" style={selected ? { color: form.color } : undefined} />
                  {label}
                </button>
              )
            })}
          </div>
          {fieldErrors.icon && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{fieldErrors.icon}</p>}
        </fieldset>
      </form>
    </Modal>
  )
}
