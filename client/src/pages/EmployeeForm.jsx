import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import Button from '../components/Button.jsx'
import FormField from '../components/FormField.jsx'
import SelectField from '../components/SelectField.jsx'
import Alert from '../components/Alert.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import PinModal from '../components/employees/PinModal.jsx'
import { employeesApi } from '../api/employees.js'
import { departmentsApi } from '../api/departments.js'
import { shiftsApi } from '../api/shifts.js'
import { getErrorMessage, getFieldErrors } from '../api/client.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatTime12, WEEKDAYS } from '../utils/format.js'
import { paiseToRupeesInput, rupeesToPaise } from '../utils/money.js'
import { todayIST } from '../utils/date.js'

const SALARY_TYPES = [
  { value: 'monthly', label: 'Monthly', per: 'per month' },
  { value: 'daily', label: 'Daily', per: 'per day' },
  { value: 'hourly', label: 'Hourly', per: 'per hour' },
]
const ROLE_SUGGESTIONS = ['Chef', 'Halwai', 'Helper', 'Counter Staff', 'Cashier', 'Packer', 'Cleaner', 'Delivery Boy', 'Manager']

function toForm(e) {
  return {
    name: e?.name ?? '',
    phone: e?.phone ?? '',
    joinDate: e?.joinDate ?? todayIST(),
    departmentId: e?.departmentId ?? '',
    roleTitle: e?.roleTitle ?? '',
    shiftId: e?.shiftId ?? '',
    salaryType: e?.salary?.type ?? 'monthly',
    amount: paiseToRupeesInput(e?.salary?.amountPaise),
    overtimeMultiplier: String(e?.salary?.overtimeMultiplier ?? 1.5),
    weeklyOff: e?.salary?.weeklyOff ?? [0],
  }
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-soft sm:p-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading form">
      {[3, 3, 3].map((rows, i) => (
        <div key={i} className="space-y-4 rounded-2xl bg-surface p-6 shadow-soft">
          <div className="h-5 w-32 rounded bg-background-deep" />
          {Array.from({ length: rows }).map((_, j) => (
            <div key={j} className="h-10 rounded-xl bg-background-deep" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Loads what the form needs: departments, shifts and (when editing) the employee
function useFormData(id) {
  const fetcher = useCallback(async () => {
    const [departments, shifts, employee] = await Promise.all([
      departmentsApi.list(),
      shiftsApi.list(),
      id ? employeesApi.get(id) : Promise.resolve(null),
    ])
    return { departments, shifts, employee }
  }, [id])
  return useApi(fetcher)
}

export default function EmployeeForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const { data, loading, error, reload } = useFormData(id)

  const backTo = isEdit ? `/employees/${id}` : '/employees'
  const header = (
    <div className="mb-6">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-medium text-syrup-muted hover:text-syrup">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {isEdit ? 'Back to profile' : 'Back to employees'}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{isEdit ? 'Edit employee' : 'Add employee'}</h1>
    </div>
  )

  let body
  if (user?.role !== 'owner') {
    body = <EmptyState icon={Lock} title="Owners only" message="Only the shop owner can add or edit employees." />
  } else if (loading) {
    body = <FormSkeleton />
  } else if (error) {
    body = <ErrorState message={error} onRetry={reload} />
  } else if (!isEdit && (data.departments.length === 0 || data.shifts.length === 0)) {
    body = (
      <EmptyState
        title="Set up departments and shifts first"
        message="Every employee belongs to a department and works a shift."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {data.departments.length === 0 && (
              <Link to="/departments" className="rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong">
                Add a department
              </Link>
            )}
            {data.shifts.length === 0 && (
              <Link to="/shifts" className="rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong">
                Add a shift
              </Link>
            )}
          </div>
        }
      />
    )
  } else {
    body = <EmployeeFormFields key={id || 'new'} {...data} />
  }

  return (
    <div className="mx-auto max-w-3xl">
      {header}
      {body}
    </div>
  )
}

function EmployeeFormFields({ departments, shifts, employee }) {
  const isEdit = Boolean(employee)
  const navigate = useNavigate()
  const [form, setForm] = useState(() => toForm(employee))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  // { employee, pin } after a successful create; the PIN lives only here
  const [created, setCreated] = useState(null)

  // Server error keys for fields whose form name differs
  const ERROR_KEY = { amount: 'salary.amountPaise', overtimeMultiplier: 'salary.overtimeMultiplier', salaryType: 'salary.type', weeklyOff: 'salary.weeklyOff' }
  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    // Clear a field's error as soon as it's edited
    const key = ERROR_KEY[field] || field
    setFieldErrors((errs) => {
      if (!(key in errs)) return errs
      const { [key]: _removed, ...rest } = errs
      return rest
    })
  }
  const update = (e) => set(e.target.name, e.target.value)
  const toggleDay = (day) =>
    set('weeklyOff', form.weeklyOff.includes(day) ? form.weeklyOff.filter((d) => d !== day) : [...form.weeklyOff, day].sort())

  // Keep an archived department selectable for an employee already in it
  const departmentOptions = [...departments]
  if (employee?.department && !departments.some((d) => d._id === employee.departmentId)) {
    departmentOptions.push({ ...employee.department, name: `${employee.department.name} (archived)` })
  }

  const per = SALARY_TYPES.find((t) => t.value === form.salaryType)?.per

  function buildPayload(amountPaise) {
    const salary = {
      type: form.salaryType,
      amountPaise,
      overtimeMultiplier: form.overtimeMultiplier === '' ? undefined : Number(form.overtimeMultiplier),
      weeklyOff: form.weeklyOff,
    }
    const fields = {
      name: form.name,
      phone: form.phone,
      departmentId: form.departmentId || undefined,
      roleTitle: form.roleTitle,
      shiftId: form.shiftId || undefined,
      joinDate: form.joinDate,
    }
    if (!isEdit) return { ...fields, salary }

    // Edit: send only what changed (unchanged salary => no audit log entry)
    const changes = {}
    for (const [key, value] of Object.entries(fields)) {
      if (value !== employee[key]) changes[key] = value
    }
    const salaryChanges = {}
    for (const [key, value] of Object.entries(salary)) {
      if (JSON.stringify(value) !== JSON.stringify(employee.salary[key])) salaryChanges[key] = value
    }
    if (Object.keys(salaryChanges).length) changes.salary = salaryChanges
    return changes
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amountPaise = rupeesToPaise(form.amount)
    if (amountPaise === null || amountPaise <= 0) {
      setFieldErrors({ 'salary.amountPaise': 'Enter an amount like 18000 or 18000.50' })
      return
    }
    setFieldErrors({})

    const payload = buildPayload(amountPaise)
    if (isEdit && Object.keys(payload).length === 0) {
      navigate(`/employees/${employee._id}`)
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        await employeesApi.update(employee._id, payload)
        navigate(`/employees/${employee._id}`, { state: { justSaved: true } })
      } else {
        setCreated(await employeesApi.create(payload))
      }
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="animate-page-in space-y-4">
        {error && <Alert>{error}</Alert>}

        <Section title="Personal details">
          <FormField label="Full name" name="name" autoComplete="off" value={form.name} onChange={update} error={fieldErrors.name} autoFocus={!isEdit} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Mobile number"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="98765 43210"
              value={form.phone}
              onChange={update}
              error={fieldErrors.phone}
            />
            <FormField label="Join date" name="joinDate" type="date" value={form.joinDate} onChange={update} error={fieldErrors.joinDate} />
          </div>
        </Section>

        <Section title="Work">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Department" name="departmentId" value={form.departmentId} onChange={update} error={fieldErrors.departmentId}>
              <option value="">Select department</option>
              {departmentOptions.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
            <div>
              <FormField
                label="Role"
                name="roleTitle"
                list="role-suggestions"
                placeholder="e.g. Chef, Helper"
                autoComplete="off"
                value={form.roleTitle}
                onChange={update}
                error={fieldErrors.roleTitle}
              />
              <datalist id="role-suggestions">
                {ROLE_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>
          <SelectField label="Shift" name="shiftId" value={form.shiftId} onChange={update} error={fieldErrors.shiftId}>
            <option value="">Select shift</option>
            {shifts.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({formatTime12(s.startTime)} – {formatTime12(s.endTime)}
                {s.crossesMidnight ? ', next day' : ''})
              </option>
            ))}
          </SelectField>
        </Section>

        <Section title="Salary">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Paid</legend>
            <div className="inline-flex rounded-xl bg-background p-1" role="radiogroup">
              {SALARY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={form.salaryType === t.value}
                  onClick={() => set('salaryType', t.value)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    form.salaryType === t.value ? 'bg-surface text-syrup shadow-soft' : 'text-syrup-muted hover:text-syrup'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {fieldErrors['salary.type'] && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{fieldErrors['salary.type']}</p>}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="salary-amount" className="mb-1.5 block text-sm font-medium">
                Amount ({per})
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-syrup-muted" aria-hidden="true">
                  ₹
                </span>
                <input
                  id="salary-amount"
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="18000"
                  value={form.amount}
                  onChange={update}
                  aria-invalid={Boolean(fieldErrors['salary.amountPaise'])}
                  aria-describedby={fieldErrors['salary.amountPaise'] ? 'salary-amount-error' : undefined}
                  className={`w-full rounded-xl border bg-background/40 py-2.5 pl-8 pr-3.5 text-sm outline-none transition focus:bg-surface focus:ring-2 ${
                    fieldErrors['salary.amountPaise'] ? 'border-primary focus:ring-primary/30' : 'border-border focus:border-primary focus:ring-primary/20'
                  }`}
                />
              </div>
              {fieldErrors['salary.amountPaise'] && (
                <p id="salary-amount-error" className="mt-1.5 animate-error-in text-xs text-primary-ink">
                  {fieldErrors['salary.amountPaise']}
                </p>
              )}
            </div>
            <FormField
              label="Overtime multiplier"
              name="overtimeMultiplier"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="1"
              max="3"
              value={form.overtimeMultiplier}
              onChange={update}
              error={fieldErrors['salary.overtimeMultiplier']}
            />
          </div>
          <p className="-mt-2 text-xs text-syrup-muted">Overtime hours are paid at this multiple of the normal hourly rate (e.g. 1.5×).</p>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Weekly off</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, i) => {
                const on = form.weeklyOff.includes(i)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(i)}
                    className={`w-14 rounded-xl border py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      on ? 'border-primary bg-primary-tint text-primary-ink' : 'border-border bg-surface text-syrup-muted hover:bg-background'
                    }`}
                  >
                    <span aria-hidden="true">{day.slice(0, 3)}</span>
                    <span className="sr-only">{day}</span>
                  </button>
                )
              })}
            </div>
            {fieldErrors['salary.weeklyOff'] && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{fieldErrors['salary.weeklyOff']}</p>}
          </fieldset>
        </Section>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => navigate(isEdit ? `/employees/${employee._id}` : '/employees')} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Add employee'}
          </Button>
        </div>
      </form>

      {created && (
        <PinModal
          employee={created.employee}
          pin={created.pin}
          onDone={() => navigate(`/employees/${created.employee._id}`, { replace: true })}
        />
      )}
    </>
  )
}
