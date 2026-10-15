import { useId, useState } from 'react'
import { Building2, CalendarCheck, Check, Wallet } from 'lucide-react'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import FormField from '../FormField.jsx'
import { settingsApi } from '../../api/settings.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { formatDuration } from '../../utils/format.js'

// Half-day threshold choices: 30 min steps from 2 h to 8 h (the server accepts 30 min to 12 h)
const THRESHOLD_OPTIONS = Array.from({ length: 13 }, (_, i) => 120 + i * 30)

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-soft sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-syrup-muted">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

function Toggle({ checked, onChange, label, description, disabled }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-syrup-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-primary-strong' : 'bg-syrup-subtle'
        }`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Select({ label, hint, error, children, ...props }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className="w-full rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:max-w-xs"
        {...props}
      >
        {children}
      </select>
      {hint && !error && <p className="mt-1.5 text-xs text-syrup-muted">{hint}</p>}
      {error && <p className="mt-1.5 animate-error-in text-xs text-primary-ink">{error}</p>}
    </div>
  )
}

/**
 * Business profile, attendance rules and payroll rules in one form. Owners edit; managers see
 * the values read-only. Only changed fields are sent; the server validates and audit-logs them.
 */
export default function ShopSettingsForm({ data, canEdit, onSaved }) {
  // Last saved values: what the form is compared against and what Discard goes back to
  const [saved, setSaved] = useState(data.settings)
  const [form, setForm] = useState(data.settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [savedAt, setSavedAt] = useState(null)

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSavedAt(null)
  }
  // The fields that differ from what's saved (what PATCH should send)
  const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== saved[k]))
  const dirty = Object.keys(changes).length > 0
  const thresholdOptions = THRESHOLD_OPTIONS.includes(form.halfDayThresholdMinutes)
    ? THRESHOLD_OPTIONS
    : [...THRESHOLD_OPTIONS, form.halfDayThresholdMinutes].sort((a, b) => a - b)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      const result = await settingsApi.update(changes)
      setSaved(result.settings)
      setForm(result.settings)
      setSavedAt(Date.now())
      onSaved(result)
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Shop settings">
      {!canEdit && <Alert variant="info">Only the shop owner can change these settings.</Alert>}

      <Section icon={Building2} title="Business profile">
        <FormField
          label="Shop name"
          name="name"
          value={form.name}
          maxLength={120}
          onChange={(e) => set('name', e.target.value)}
          error={fieldErrors.name}
          disabled={!canEdit}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-medium">Timezone</p>
            <p className="rounded-xl bg-background px-3.5 py-2.5 text-sm" data-testid="timezone">
              India (IST, {data.timezone})
            </p>
            <p className="mt-1.5 text-xs text-syrup-muted">All punches, attendance days and payroll use Indian time.</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Plan</p>
            <p className="rounded-xl bg-background px-3.5 py-2.5 text-sm capitalize">{data.plan}</p>
          </div>
        </div>
      </Section>

      <Section icon={CalendarCheck} title="Attendance rules" description="Used by the Attendance page, Dashboard, Analytics and payroll.">
        <Select
          label="Half-day threshold"
          value={form.halfDayThresholdMinutes}
          onChange={(e) => set('halfDayThresholdMinutes', Number(e.target.value))}
          error={fieldErrors.halfDayThresholdMinutes}
          disabled={!canEdit}
          hint="Worked less than this after punching out counts as a half day. Applies to every day not yet finalized in payroll."
        >
          {thresholdOptions.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m)}
              {m === 240 ? ' (default)' : ''}
            </option>
          ))}
        </Select>
        <div className="sm:max-w-xs">
          <FormField
            label="Default grace (minutes)"
            name="defaultGraceMinutes"
            type="number"
            min={0}
            max={180}
            inputMode="numeric"
            value={form.defaultGraceMinutes}
            onChange={(e) => set('defaultGraceMinutes', e.target.value === '' ? '' : Number(e.target.value))}
            error={fieldErrors.defaultGraceMinutes}
            disabled={!canEdit}
          />
          <p className="mt-1.5 text-xs text-syrup-muted">Pre-filled when you add a shift. Existing shifts keep their own grace.</p>
        </div>
      </Section>

      <Section icon={Wallet} title="Payroll rules" description="Changes apply to months that aren't finalized yet. Finalized payslips never change.">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Working days for monthly salaries</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['actual', 'Actual days', 'Days in the month minus weekly offs (e.g. 26 in a 30-day month with Sundays off)'],
              ['fixed26', 'Fixed 26 days', 'One day’s pay is always the monthly salary ÷ 26'],
            ].map(([value, title, text]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-3 rounded-xl p-3.5 ring-1 transition ${
                  form.workingDaysPolicy === value ? 'bg-primary-tint/50 ring-primary' : 'ring-border hover:bg-background/60'
                } ${canEdit ? '' : 'pointer-events-none opacity-60'}`}
              >
                <input
                  type="radio"
                  name="workingDaysPolicy"
                  value={value}
                  checked={form.workingDaysPolicy === value}
                  onChange={() => set('workingDaysPolicy', value)}
                  disabled={!canEdit}
                  className="mt-0.5 accent-primary-strong"
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-syrup-muted">{text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Toggle
          label="Pay overtime"
          description="Minutes beyond the shift are paid at the hourly rate × each employee's overtime multiplier."
          checked={form.overtimeEnabled}
          onChange={(v) => set('overtimeEnabled', v)}
          disabled={!canEdit}
        />
        <div className="space-y-3">
          <Toggle
            label="Deduct for late arrivals"
            description="Cut half a day's pay for every few late days in a month."
            checked={form.lateRuleEnabled}
            onChange={(v) => set('lateRuleEnabled', v)}
            disabled={!canEdit}
          />
          {form.lateRuleEnabled && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-background px-3.5 py-3 text-sm">
              <span>Every</span>
              <input
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                aria-label="Late days per half-day cut"
                aria-invalid={Boolean(fieldErrors.lateRuleEvery)}
                value={form.lateRuleEvery}
                onChange={(e) => set('lateRuleEvery', e.target.value === '' ? '' : Number(e.target.value))}
                disabled={!canEdit}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span>late days = half a day&apos;s pay cut</span>
              {fieldErrors.lateRuleEvery && <p className="w-full text-xs text-primary-ink">{fieldErrors.lateRuleEvery}</p>}
            </div>
          )}
        </div>
      </Section>

      {canEdit && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-background/90 px-1 py-3 backdrop-blur">
          {error && (
            <div className="mr-auto">
              <Alert>{error}</Alert>
            </div>
          )}
          {savedAt && !dirty && (
            <span className="flex items-center gap-1 text-sm text-present-ink" role="status">
              <Check className="h-4 w-4" aria-hidden="true" />
              Saved
            </span>
          )}
          {dirty && (
            <Button variant="ghost" onClick={() => setForm(saved)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  )
}
