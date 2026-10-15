import { useState } from 'react'
import { Check, KeyRound } from 'lucide-react'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import FormField from '../FormField.jsx'
import { authApi } from '../../api/auth.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

// Any signed-in user changes their own password. Other devices are signed out; this one stays in.
export default function ChangePasswordCard() {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [done, setDone] = useState(false)

  const update = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setDone(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.newPassword !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords don't match" })
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      await authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(EMPTY)
      setDone(true)
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      if (!Object.keys(fields).length) setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-soft sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
        Change password
      </h2>
      <p className="mt-1 text-sm text-syrup-muted">You&apos;ll stay signed in here. Any other phone or computer using your account is signed out.</p>
      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4 sm:max-w-sm" aria-label="Change password">
        {error && <Alert>{error}</Alert>}
        {done && (
          <p className="flex items-center gap-1.5 rounded-xl bg-present-tint px-3.5 py-3 text-sm text-present-ink" role="status">
            <Check className="h-4 w-4" aria-hidden="true" />
            Password changed
          </p>
        )}
        <FormField label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={form.currentPassword} onChange={update} error={fieldErrors.currentPassword} />
        <FormField label="New password" name="newPassword" type="password" autoComplete="new-password" value={form.newPassword} onChange={update} error={fieldErrors.newPassword} />
        <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update} error={fieldErrors.confirmPassword} />
        <p className="text-xs text-syrup-muted">At least 8 characters.</p>
        <Button type="submit" loading={saving} disabled={!form.currentPassword || !form.newPassword || !form.confirmPassword}>
          Change password
        </Button>
      </form>
    </section>
  )
}
