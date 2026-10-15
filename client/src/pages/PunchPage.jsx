import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CakeSlice, CircleAlert, CircleCheck, Info, LoaderCircle, LogIn, LogOut } from 'lucide-react'
import { punchApi } from '../api/punch.js'
import { getErrorMessage } from '../api/client.js'
import { formatDuration } from '../utils/format.js'

const TZ = 'Asia/Kolkata'
const RESULT_SECONDS = 10 // result screen returns to the form on its own (shared shop phones)
const clockFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true })
const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' })

function readSavedCode(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}
function writeSavedCode(key, code) {
  try {
    if (code) localStorage.setItem(key, code)
    else localStorage.removeItem(key)
  } catch {
    // storage unavailable (private mode); remembering the code is only a convenience
  }
}

// Clock synced to the server (display only; the punch time is always decided by the server)
function useServerClock(serverTime) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    if (!serverTime) return
    const offset = new Date(serverTime).getTime() - Date.now()
    const tick = () => setNow(new Date(Date.now() + offset))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [serverTime])
  return now
}

function Shell({ businessName, now, children }) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-6 sm:justify-center">
      <div className="w-full max-w-sm">
        <header className="mb-5 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-syrup text-primary">
              <CakeSlice className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold">{businessName || 'Staff punch'}</span>
          </div>
          {now && (
            <div className="mt-4" aria-live="off">
              <p className="text-4xl font-bold tabular-nums tracking-tight">{clockFormat.format(now).toUpperCase()}</p>
              <p className="text-sm text-syrup-muted">{dateFormat.format(now)}</p>
            </div>
          )}
        </header>
        {children}
      </div>
    </main>
  )
}

const RESULT_STYLES = {
  in: { icon: LogIn, ring: 'bg-present-tint text-present-ink', title: 'Punched IN' },
  out: { icon: LogOut, ring: 'bg-primary-tint text-primary-ink', title: 'Punched OUT' },
  already_in: { icon: Info, ring: 'bg-amber-tint text-amber-ink', title: 'Already punched in' },
  already_done: { icon: CircleCheck, ring: 'bg-background-deep text-syrup-soft', title: 'All done for today' },
}

function ResultCard({ result, onDone }) {
  const [secondsLeft, setSecondsLeft] = useState(RESULT_SECONDS)
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (secondsLeft <= 0) onDone()
  }, [secondsLeft, onDone])

  const style = RESULT_STYLES[result.action] || RESULT_STYLES.already_done
  const Icon = style.icon
  // A real punch (IN or OUT) gets a checkmark that draws itself; pure CSS/SVG, no extra JS for low-end phones
  const punched = result.action === 'in' || result.action === 'out'
  return (
    <section className="animate-page-in rounded-3xl bg-surface p-6 text-center shadow-soft" role="status" aria-live="assertive">
      <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${style.ring} ${punched ? 'check-pop' : ''}`}>
        {punched ? (
          <svg viewBox="0 0 52 52" className="check-draw h-12 w-12" aria-hidden="true" data-testid="punch-check">
            <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M15 27 l7 7 l15 -15" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <Icon className="h-10 w-10" aria-hidden="true" />
        )}
      </span>
      <h1 className="mt-4 text-sm font-semibold uppercase tracking-wide text-syrup-muted">{style.title}</h1>
      <p className="mt-2 text-2xl font-bold leading-snug" data-testid="punch-message">
        {result.message}
      </p>
      {result.action === 'in' && result.lateMinutes > 0 && (
        <p className="mt-3 inline-block rounded-full bg-amber-tint px-3 py-1 text-sm font-medium text-amber-ink">
          {formatDuration(result.lateMinutes)} late
        </p>
      )}
      {result.action === 'out' && (
        <p className="mt-3 inline-block rounded-full bg-background-deep px-3 py-1 text-sm font-medium">
          Worked {formatDuration(result.workedMinutes)}
        </p>
      )}
      <button
        type="button"
        onClick={onDone}
        className="mt-6 h-12 w-full rounded-2xl bg-syrup text-base font-semibold text-white transition duration-150 active:scale-[0.98] active:bg-syrup-soft"
      >
        Done ({secondsLeft})
      </button>
    </section>
  )
}

export default function PunchPage() {
  const { businessToken } = useParams()
  const [searchParams] = useSearchParams()
  const source = searchParams.get('src') === 'qr' ? 'qr' : 'link'
  const storageKey = `punchCode:${businessToken}`

  // 'loading' | 'ready' | 'invalid' | 'error'
  const [pageState, setPageState] = useState('loading')
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [code, setCode] = useState(() => readSavedCode(storageKey))
  const [remember, setRemember] = useState(true)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const pinRef = useRef(null)
  const codeRef = useRef(null)

  const now = useServerClock(info?.serverTime)

  const loadInfo = useCallback(async () => {
    try {
      const data = await punchApi.info(businessToken)
      setInfo(data)
      setPageState('ready')
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 400) {
        setPageState('invalid')
      } else {
        setLoadError(getErrorMessage(err))
        setPageState('error')
      }
    }
  }, [businessToken])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Enter your employee code')
      codeRef.current?.focus()
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter your 4-digit PIN')
      pinRef.current?.focus()
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const data = await punchApi.punch({ businessToken, employeeCode: trimmed, pin, source })
      writeSavedCode(storageKey, remember ? trimmed : '')
      setResult(data)
    } catch (err) {
      if (err.response?.status === 404) setPageState('invalid')
      setError(getErrorMessage(err, 'Could not punch. Please try again.'))
      pinRef.current?.focus()
    } finally {
      // The PIN never stays on screen
      setPin('')
      setSubmitting(false)
    }
  }

  const backToForm = useCallback(() => {
    setResult(null)
    setError('')
  }, [])

  if (pageState === 'loading') {
    return (
      <Shell>
        <div className="animate-pulse space-y-4 rounded-3xl bg-surface p-6 shadow-soft" aria-busy="true" aria-label="Loading">
          <div className="h-12 rounded-2xl bg-background-deep" />
          <div className="h-12 rounded-2xl bg-background-deep" />
          <div className="h-14 rounded-2xl bg-background-deep" />
        </div>
      </Shell>
    )
  }

  if (pageState === 'invalid') {
    return (
      <Shell>
        <section className="rounded-3xl bg-surface p-6 text-center shadow-soft" role="alert">
          <CircleAlert className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-semibold">This punch link doesn't work</h1>
          <p className="mt-2 text-syrup-muted">It may have been replaced. Ask the shop owner for the new QR code.</p>
        </section>
      </Shell>
    )
  }

  if (pageState === 'error') {
    return (
      <Shell>
        <section className="rounded-3xl bg-surface p-6 text-center shadow-soft" role="alert">
          <CircleAlert className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-semibold">Can't connect</h1>
          <p className="mt-2 text-syrup-muted">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setPageState('loading')
              loadInfo()
            }}
            className="mt-5 h-12 w-full rounded-2xl bg-primary-strong text-base font-semibold text-white transition duration-150 active:scale-[0.98] active:bg-primary-ink"
          >
            Try again
          </button>
        </section>
      </Shell>
    )
  }

  return (
    <Shell businessName={info.businessName} now={now}>
      {result ? (
        <ResultCard result={result} onDone={backToForm} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-3xl bg-surface p-6 shadow-soft">
          <div>
            <label htmlFor="punch-code" className="mb-1.5 block text-sm font-semibold">
              Employee code
            </label>
            <input
              id="punch-code"
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={12}
              placeholder="e.g. 101"
              className="h-14 w-full rounded-2xl border border-border bg-background/40 px-4 text-center text-2xl font-semibold tracking-widest outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-syrup-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label htmlFor="punch-pin" className="mb-1.5 block text-sm font-semibold">
              PIN
            </label>
            <input
              id="punch-pin"
              ref={pinRef}
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
              className="h-14 w-full rounded-2xl border border-border bg-background/40 px-4 text-center text-3xl tracking-[0.6em] outline-none placeholder:text-syrup-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-primary-tint px-4 py-3 text-sm font-medium text-primary-ink">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-strong text-lg font-bold text-white shadow-soft transition duration-150 enabled:active:scale-[0.98] active:bg-primary-strong disabled:opacity-70"
          >
            {submitting && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
            {submitting ? 'Punching…' : 'Punch'}
          </button>

          <label className="flex items-center justify-center gap-2 text-sm text-syrup-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-primary-strong"
            />
            Remember my code on this phone
          </label>
        </form>
      )}
      <p className="mt-4 text-center text-xs text-syrup-muted">Time is recorded by the shop's server, not this phone.</p>
    </Shell>
  )
}
