import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarOff, KeyRound, Lock, Moon, Pencil, Phone, UserCheck, UserX, Wallet } from 'lucide-react'
import Button from '../components/Button.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import StatusBadge from '../components/employees/StatusBadge.jsx'
import EmployeeAvatar from '../components/employees/EmployeeAvatar.jsx'
import PinModal from '../components/employees/PinModal.jsx'
import AttendanceCalendarPlaceholder from '../components/employees/AttendanceCalendarPlaceholder.jsx'
import { employeesApi } from '../api/employees.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDate, formatRupees, formatTime12, WEEKDAYS } from '../utils/format.js'

const PER = { monthly: 'per month', daily: 'per day', hourly: 'per hour' }
const TYPE_LABEL = { monthly: 'Monthly', daily: 'Daily', hourly: 'Hourly' }

function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={`rounded-2xl bg-surface p-5 shadow-soft ${className}`}>
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        {Icon && <Icon className="h-5 w-5 text-primary" aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-syrup-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading employee">
      <div className="flex items-center gap-4 rounded-2xl bg-surface p-6 shadow-soft">
        <div className="h-16 w-16 rounded-full bg-background-deep" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-background-deep" />
          <div className="h-4 w-32 rounded bg-background-deep" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-2xl bg-surface shadow-soft" />
        <div className="h-56 rounded-2xl bg-surface shadow-soft" />
      </div>
    </div>
  )
}

export default function EmployeeProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  // Arrived here right after saving an edit: flash the details card once (not again on refresh)
  const [justSaved] = useState(() => Boolean(location.state?.justSaved))
  useEffect(() => {
    if (location.state?.justSaved) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  const fetchEmployee = useCallback(() => employeesApi.get(id), [id])
  const { data: employee, loading, error, reload } = useApi(fetchEmployee)

  // 'reset-pin' | 'deactivate' | 'reactivate' | null
  const [confirm, setConfirm] = useState(null)
  // { employee, pin } after a reset; the PIN lives only here
  const [newPin, setNewPin] = useState(null)

  const backLink = (
    <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm font-medium text-syrup-muted hover:text-syrup">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Employees
    </Link>
  )

  if (loading) {
    return (
      <div>
        <div className="mb-4">{backLink}</div>
        <ProfileSkeleton />
      </div>
    )
  }
  if (error) {
    const notFound = error === 'Employee not found' || error === 'Validation failed'
    return (
      <div>
        <div className="mb-4">{backLink}</div>
        {notFound ? (
          <EmptyState title="Employee not found" message="They may have been removed, or the link is wrong." />
        ) : (
          <ErrorState message={error} onRetry={reload} />
        )}
      </div>
    )
  }

  const e = employee
  const { salary, shift, department } = e

  async function resetPin() {
    const result = await employeesApi.resetPin(e._id)
    setConfirm(null)
    setNewPin(result)
  }

  async function setActive(isActive) {
    await employeesApi.update(e._id, { isActive })
    setConfirm(null)
    await reload()
  }

  return (
    <div>
      <div className="mb-4">{backLink}</div>

      {/* Header */}
      <section
        className={`mb-4 flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-soft sm:flex-row sm:items-center sm:p-6 ${justSaved ? 'flash-card' : ''}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <EmployeeAvatar name={e.name} color={department?.color} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{e.name}</h1>
              <StatusBadge isActive={e.isActive} />
            </div>
            <p className="text-sm text-syrup-muted">
              <span className="font-mono">#{e.employeeCode}</span> · {e.roleTitle}
              {department && ` · ${department.name}`}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/employees/${e._id}/edit`)}>
              Edit
            </Button>
            <Button variant="secondary" icon={KeyRound} onClick={() => setConfirm('reset-pin')}>
              Reset PIN
            </Button>
            {e.isActive ? (
              <Button variant="ghost" icon={UserX} onClick={() => setConfirm('deactivate')}>
                Deactivate
              </Button>
            ) : (
              <Button variant="ghost" icon={UserCheck} onClick={() => setConfirm('reactivate')}>
                Reactivate
              </Button>
            )}
          </div>
        )}
      </section>

      {!e.isActive && (
        <p className="mb-4 rounded-xl bg-background-deep px-4 py-3 text-sm text-syrup-soft">
          This employee is inactive: they can't punch in and are hidden from active lists. Their history is kept.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Details">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Phone">
              <a href={`tel:+91${e.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary-ink">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {e.phone.slice(0, 5)} {e.phone.slice(5)}
              </a>
            </Detail>
            <Detail label="Employee code">
              <span className="font-mono">{e.employeeCode}</span>
            </Detail>
            <Detail label="Department">
              {department ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: department.color }} aria-hidden="true" />
                  {department.name}
                  {!department.isActive && <span className="text-xs text-syrup-muted">(archived)</span>}
                </span>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Role">{e.roleTitle}</Detail>
            <Detail label="Shift">
              {shift ? (
                <>
                  {shift.name}
                  <span className="block text-xs text-syrup-muted">
                    {formatTime12(shift.startTime)} – {formatTime12(shift.endTime)}
                    {shift.crossesMidnight && (
                      <span className="ml-1 inline-flex items-center gap-0.5">
                        <Moon className="h-3 w-3" aria-hidden="true" /> next day
                      </span>
                    )}
                  </span>
                </>
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Joined">{formatDate(e.joinDate)}</Detail>
          </dl>
        </Card>

        <Card title="Salary" icon={Wallet}>
          {salary ? (
            <>
              <p className="text-3xl font-bold">{formatRupees(salary.amountPaise)}</p>
              <p className="text-sm text-syrup-muted">
                {TYPE_LABEL[salary.type]} · {PER[salary.type]}
              </p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <Detail label="Overtime">{salary.overtimeMultiplier}× normal rate</Detail>
                <Detail label="Weekly off">
                  {salary.weeklyOff.length ? salary.weeklyOff.map((d) => WEEKDAYS[d]).join(', ') : 'None'}
                </Detail>
              </dl>
              <p className="mt-4 rounded-xl bg-background px-3 py-2 text-xs text-syrup-muted">
                This month's earned salary, overtime and deductions will appear here once payroll is set up.
              </p>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-background px-3 py-3 text-sm text-syrup-muted">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Salary details are visible to the owner only.
            </div>
          )}
        </Card>

        <AttendanceCalendarPlaceholder weeklyOff={salary?.weeklyOff} />

        <Card title="Leave history" icon={CalendarOff}>
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">No leave records yet</p>
            <p className="mt-1 text-xs text-syrup-muted">Approved and pending leaves will be listed here once leave management is set up.</p>
          </div>
        </Card>
      </div>

      {confirm === 'reset-pin' && (
        <ConfirmDialog title="Reset PIN?" confirmLabel="Reset PIN" onConfirm={resetPin} onClose={() => setConfirm(null)}>
          <p>
            A new PIN will be created for <span className="font-semibold">{e.name}</span>. Their current PIN stops working
            immediately.
          </p>
        </ConfirmDialog>
      )}
      {confirm === 'deactivate' && (
        <ConfirmDialog
          title="Deactivate employee?"
          confirmLabel="Deactivate"
          variant="danger"
          onConfirm={() => setActive(false)}
          onClose={() => setConfirm(null)}
        >
          <p>
            <span className="font-semibold">{e.name}</span> won't be able to punch in and will be hidden from active lists.
            Their attendance and payroll history is kept, and you can reactivate them later.
          </p>
        </ConfirmDialog>
      )}
      {confirm === 'reactivate' && (
        <ConfirmDialog title="Reactivate employee?" confirmLabel="Reactivate" onConfirm={() => setActive(true)} onClose={() => setConfirm(null)}>
          <p>
            <span className="font-semibold">{e.name}</span> will be able to punch in again with their existing code and PIN.
          </p>
        </ConfirmDialog>
      )}

      {newPin && <PinModal employee={newPin.employee} pin={newPin.pin} reset onDone={() => setNewPin(null)} />}
    </div>
  )
}
