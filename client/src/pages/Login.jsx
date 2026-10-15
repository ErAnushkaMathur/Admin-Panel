import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout.jsx'
import LoginHero from '../components/login/LoginHero.jsx'
import FormField from '../components/FormField.jsx'
import SubmitButton from '../components/SubmitButton.jsx'
import Alert from '../components/Alert.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getErrorMessage, getFieldErrors } from '../api/client.js'

export default function Login() {
  const { login, sessionExpired } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

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

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage your staff"
      aside={<LoginHero />}
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
    </AuthLayout>
  )
}
