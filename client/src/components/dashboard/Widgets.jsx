import { Link } from 'react-router-dom'
import { ArrowRight, Building2, CalendarDays, Crown, Wallet } from 'lucide-react'
import StatusPill from '../attendance/StatusPill.jsx'
import EmployeeAvatar from '../employees/EmployeeAvatar.jsx'
import { STATUS_META } from '../attendance/statuses.js'
import { formatRupees, formatDate, formatTime12 } from '../../utils/format.js'
import { formatTimeIST } from '../../utils/date.js'
import { monthLabel } from '../payroll/payrollMeta.js'
import { m, useReducedMotion } from 'framer-motion'
import { AnimatedBar, StaggerItem } from './motion.jsx'
import { cssVar } from '../../utils/theme.js'

// Display-only widgets: every number arrives ready from GET /dashboard/summary (golden rule 1).

export function Card({ title, action, children, className = '' }) {
  return (
    <StaggerItem as="section" className={`flex min-w-0 flex-col rounded-2xl bg-surface p-5 shadow-soft ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </StaggerItem>
  )
}

function CardEmpty({ icon: Icon, children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-syrup-muted">
      <Icon className="h-8 w-8 text-syrup-faint" aria-hidden="true" />
      {children}
    </div>
  )
}

export function KpiCard({ icon: Icon, label, value, hint, tone = 'bg-primary-tint text-primary-ink', testId }) {
  return (
    <StaggerItem className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-soft" data-testid={testId}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-syrup-muted">{label}</p>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-syrup-muted">{hint}</p>}
      </div>
    </StaggerItem>
  )
}

// Donut segment colours: the status tokens. Late uses its 3:1 step because raw late/amber is too
// light for a mark on a card; the others pass 3:1 as they are.
const DONUT_COLORS = {
  present: cssVar('present'),
  late: cssVar('late-strong'),
  half_day: cssVar('half'),
  absent: cssVar('absent'),
  on_leave: cssVar('leave'),
}
const PERIOD_LABELS = { week: 'Weekly', month: 'Monthly', year: 'Yearly' }
const RADIUS = 15.9155 // circumference = 100, so dash lengths are the server's percentages

export function AttendanceDonut({ overview, period, onPeriodChange }) {
  const reduce = useReducedMotion()
  const toggle = (
    <div role="tablist" aria-label="Period" className="inline-flex rounded-lg bg-background-deep p-0.5 text-xs">
      {Object.entries(PERIOD_LABELS).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={period === key}
          onClick={() => onPeriodChange(key)}
          className={`rounded-md px-2.5 py-1 font-semibold ${period === key ? 'bg-surface shadow-soft' : 'text-syrup-muted hover:text-syrup'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
  return (
    <Card title="Attendance overview" action={toggle}>
      {overview.total === 0 ? (
        <CardEmpty icon={CalendarDays}>No attendance recorded in this period yet.</CardEmpty>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
          <div className="relative h-40 w-40 shrink-0">
            <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" role="img" aria-label={`${overview.cameInPercent}% came in`}>
              <circle cx="21" cy="21" r={RADIUS} fill="none" style={{ stroke: cssVar('border') }} strokeWidth="5" />
              {overview.segments
                .filter((s) => s.count > 0)
                .map((s) => (
                  // Each segment draws in from its start; switching period morphs to the new share
                  <m.circle
                    key={s.status}
                    cx="21"
                    cy="21"
                    r={RADIUS}
                    fill="none"
                    style={{ stroke: DONUT_COLORS[s.status] }}
                    strokeWidth="5"
                    initial={reduce ? false : { strokeDasharray: '0 100' }}
                    animate={{ strokeDasharray: `${s.percent} 100`, strokeDashoffset: -s.offsetPercent }}
                    transition={reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeOut', delay: 0.2 }}
                  />
                ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold" data-testid="donut-percent">
                {overview.cameInPercent}%
              </span>
              <span className="text-xs text-syrup-muted">came in</span>
            </div>
          </div>
          <div className="w-full space-y-1.5 text-sm">
            {overview.segments.map((s) => (
              <div key={s.status} className="flex items-center justify-between gap-3" data-testid="donut-legend">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[s.status] }} aria-hidden="true" />
                  {STATUS_META[s.status].label}
                </span>
                <span className="whitespace-nowrap font-semibold">
                  {s.count} <span className="font-normal text-syrup-muted">({s.percent}%)</span>
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Total staff-days</span>
              <span data-testid="donut-total">{overview.total}</span>
            </div>
            {overview.weeklyOff > 0 && <p className="text-xs text-syrup-muted">Not counted: {overview.weeklyOff} weekly-off days</p>}
          </div>
        </div>
      )}
    </Card>
  )
}

export function SalaryOverview({ salary }) {
  const o = salary.salaryOverview
  const line = (label, paise, sign = '') => (
    <div className="flex justify-between py-2">
      <dt className="text-syrup-soft">{label}</dt>
      <dd className="font-semibold">
        {sign}
        {formatRupees(paise)}
      </dd>
    </div>
  )
  return (
    <Card
      title="Salary overview"
      action={
        <Link to="/payroll" className="text-sm font-semibold text-primary-ink hover:text-primary-ink">
          Payroll
        </Link>
      }
    >
      <p className="mb-2 text-xs text-syrup-muted">{monthLabel(salary.salaryMonth)} so far, from attendance up to today</p>
      <dl className="divide-y divide-border text-sm">
        {line('Basic', o.basicPaise)}
        {line('Overtime', o.overtimePaise, '+ ')}
        {line('Deductions', o.deductionsPaise, '− ')}
        <div className="flex justify-between pt-3 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-semibold" data-testid="salary-total">
            {formatRupees(o.totalPaise)}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

export function DepartmentAttendance({ departments }) {
  return (
    <Card title="Department attendance" action={<span className="text-xs text-syrup-muted">Today</span>}>
      {departments.length === 0 ? (
        <CardEmpty icon={Building2}>No departments with staff yet.</CardEmpty>
      ) : (
        <ul className="space-y-3">
          {departments.map((d) => (
            <li key={d.departmentId ?? 'none'} data-testid="dept-row">
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{d.name}</span>
                <span className="text-syrup-muted">
                  <span className="font-semibold text-syrup">{d.cameIn}</span>/{d.total}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-background-deep"
                role="progressbar"
                aria-label={`${d.name} attendance`}
                aria-valuenow={d.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <AnimatedBar percent={d.percent} color={d.color ?? cssVar('secondary-strong')} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function StaffTable({ staff, className = '' }) {
  const viewAll = (
    <Link to="/attendance" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:text-primary-ink">
      View all ({staff.total}) <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  )
  return (
    <Card title="Staff attendance" action={viewAll} className={className}>
      {staff.rows.length === 0 ? (
        <CardEmpty icon={CalendarDays}>No active staff yet.</CardEmpty>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-syrup-muted">
              <tr>
                <th scope="col" className="px-5 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2 font-semibold">Check-in</th>
                <th scope="col" className="px-5 py-2 font-semibold">Shift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.rows.map((r) => (
                <tr key={r.employee._id} data-testid="staff-row">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={r.employee.name} color={r.department?.color} />
                      <div className="min-w-0">
                        <Link to={`/employees/${r.employee._id}`} className="font-semibold hover:text-primary-ink">
                          {r.employee.name}
                        </Link>
                        <p className="truncate text-xs text-syrup-muted">{r.employee.roleTitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={r.status} lateMinutes={r.lateMinutes} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.checkIn ? formatTimeIST(r.checkIn) : <span className="text-syrup-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-syrup-soft">
                    {r.shift ? (
                      <>
                        {r.shift.name}
                        <span className="block text-xs text-syrup-muted">
                          {formatTime12(r.shift.startTime)} – {formatTime12(r.shift.endTime)}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function UpcomingPayments({ payments }) {
  return (
    <Card
      title="Upcoming salary payments"
      action={
        payments && (
          <Link to={`/payroll?month=${payments.month}`} className="text-sm font-semibold text-primary-ink hover:text-primary-ink">
            {monthLabel(payments.month)}
          </Link>
        )
      }
    >
      {!payments ? (
        <CardEmpty icon={Wallet}>
          Finalize a month in{' '}
          <Link to="/payroll" className="font-semibold text-primary-ink">
            Payroll
          </Link>{' '}
          to see payments here.
        </CardEmpty>
      ) : (
        <>
          <p className="mb-3 text-sm text-syrup-muted" data-testid="payments-summary">
            <span className="font-semibold text-syrup">{formatRupees(payments.pendingPaise)}</span> pending for {payments.pendingCount} ·{' '}
            {formatRupees(payments.paidPaise)} paid to {payments.paidCount}
          </p>
          <ul className="divide-y divide-border">
            {payments.rows.map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid="payment-row">
                <span className="min-w-0 truncate font-medium">{p.employee.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold">{formatRupees(p.netPaise)}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.status === 'paid' ? 'bg-present-tint text-present-ink' : 'bg-amber-tint text-amber-ink'}`}
                    title={p.paidDate ? `Paid on ${formatDate(p.paidDate)}` : undefined}
                  >
                    {p.status === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {payments.total > payments.rows.length && (
            <Link to={`/payroll?month=${payments.month}`} className="mt-2 inline-block text-sm font-semibold text-primary-ink">
              See all {payments.total}
            </Link>
          )}
        </>
      )}
    </Card>
  )
}

export function UpsellBanner() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-2xl bg-syrup p-5 text-background shadow-soft sm:flex-row sm:items-center sm:justify-between" data-testid="upsell">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-strong text-white">
          <Crown className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">Upgrade to Pro</p>
          <p className="text-sm text-syrup-subtle">AI insights, forecasts and more for growing shops.</p>
        </div>
      </div>
      <Link to="/settings" className="rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong">
        See plans
      </Link>
    </section>
  )
}
