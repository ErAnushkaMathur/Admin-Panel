import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import FormField from '../components/FormField.jsx'
import SubmitButton from '../components/SubmitButton.jsx'
import Alert from '../components/Alert.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getErrorMessage, getFieldErrors } from '../api/client.js'

const initialForm = { businessName: '', name: '', email: '', password: '', confirmPassword: '' }

export default function Register() {
  const { register } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    // UX-only check; the backend validates everything else
    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' })
      return
    }
    setFieldErrors({})
    setSubmitting(true)
    try {
      const { confirmPassword: _, ...data } = form
      await register(data)
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      setError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your shop account"
      subtitle="You'll be the owner of this business"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-ink hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FormField
          label="Shop name"
          name="businessName"
          autoComplete="organization"
          placeholder="e.g. Sharma Sweets"
          required
          value={form.businessName}
          onChange={update}
          error={fieldErrors.businessName}
        />
        <FormField
          label="Your name"
          name="name"
          autoComplete="name"
          required
          value={form.name}
          onChange={update}
          error={fieldErrors.name}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update}
          error={fieldErrors.email}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          value={form.password}
          onChange={update}
          error={fieldErrors.password}
        />
        <FormField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={update}
          error={fieldErrors.confirmPassword}
        />
        <SubmitButton loading={submitting} loadingText="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
