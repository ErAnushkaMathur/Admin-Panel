import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import FormField from '../components/FormField.jsx'
import SubmitButton from '../components/SubmitButton.jsx'
import Alert from '../components/Alert.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getErrorMessage, getFieldErrors } from '../api/client.js'

// Put a real account from your database here
const DEMO_CREDENTIALS = { email: 'shankarsweets@gmail.com', password: '12345678' }

export default function Login() {
  const { login, sessionExpired } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      await login(form)
      // PublicOnlyRoute redirects once the session is set
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  async function handleDemoLogin() {
    setError('')
    setFieldErrors({})
    setDemoLoading(true)
    try {
      await login(DEMO_CREDENTIALS)
    } catch (err) {
      setError(getErrorMessage(err))
      setDemoLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage your staff"
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-primary-ink hover:underline">
            Create your shop account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {sessionExpired && !error && <Alert variant="info">Your session expired. Please log in again.</Alert>}
        {error && <Alert>{error}</Alert>}
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
          autoComplete="current-password"
          required
          value={form.password}
          onChange={update}
          error={fieldErrors.password}
        />
        <SubmitButton loading={submitting} loadingText="Logging in…">
          Log in
        </SubmitButton>
      </form>

      {/* Demo login card, directly below the Log in button */}
<div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
  <p className="mb-3 text-sm text-gray-600">Just want to look around?</p>
  <SubmitButton type="button" onClick={handleDemoLogin} loading={demoLoading} loadingText="Signing in…">
    Demo Login
  </SubmitButton>
</div>
    </AuthLayout>
  )
}