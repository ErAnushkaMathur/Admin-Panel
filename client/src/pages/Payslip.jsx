import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Lock, Printer } from 'lucide-react'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import { PAYROLL_STATUSES, RATE_SUFFIX, SALARY_TYPES, dayCounts, deductionLines, monthLabel } from '../components/payroll/payrollMeta.js'
import { payrollApi } from '../api/payroll.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDate, formatDuration, formatRupees } from '../utils/format.js'

// Printable payslip, outside the app shell so "Print / Save as PDF" gives a clean page.
// Every number comes from the stored payroll snapshot (golden rules 1 and 5).
export default function Payslip() {
  const { user } = useAuth()
  return (
    <div className="min-h-screen bg-background px-4 py-6 print:bg-surface print:p-0 sm:py-10">
      <div className="mx-auto max-w-2xl">
        {user?.role === 'owner' ? (
          <PayslipContent />
        ) : (
          <EmptyState icon={Lock} title="Owners only" message="Only the shop owner can see payslips." />
        )}
      </div>
    </div>
  )
}

function Line({ label, value, strong = false, negative = false }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-syrup-soft'}>{label}</dt>
      <dd className={`whitespace-nowrap ${negative ? 'text-primary-ink' : ''}`}>
        {negative ? '− ' : ''}
        {formatRupees(value)}
      </dd>
    </div>
  )
}

function PayslipContent() {
  const { id } = useParams()
  const fetcher = useCallback(() => payrollApi.payslip(id), [id])
  const { data, loading, error, reload } = useApi(fetcher)

  const toolbar = (
    <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
      <Link to={data ? `/payroll?month=${data.payroll.month}` : '/payroll'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-syrup-soft hover:text-primary-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to payroll
      </Link>
      {data && (
        <Button icon={Printer} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      )}
    </div>
  )

  if (loading) {
    return (
      <>
        {toolbar}
        <div className="h-[36rem] animate-pulse rounded-2xl bg-surface shadow-soft" aria-busy="true" aria-label="Loading payslip" />
      </>
    )
  }
  if (error) {
    return (
      <>
        {toolbar}
        <ErrorState message={error} onRetry={reload} />
      </>
    )
  }

  const { business, payroll } = data
  const s = payroll.snapshot
  const deductions = deductionLines(s)
  const isDraft = payroll.status === 'draft'

  return (
    <>
      {toolbar}
      <article className="rounded-2xl bg-surface p-6 shadow-soft print:rounded-none print:p-0 print:shadow-none sm:p-8" data-testid="payslip">
        {isDraft && (
          <p className="mb-4 rounded-xl bg-amber-tint px-3 py-2 text-center text-sm font-semibold text-amber-ink">
            DRAFT: not final. Numbers can still change until the month is finalized.
          </p>
        )}
        <header className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-semibold">{business.name}</p>
            <h1 className="text-2xl font-semibold">Payslip · {monthLabel(payroll.month)}</h1>
          </div>
          <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${PAYROLL_STATUSES[payroll.status]?.pill}`}>
            {PAYROLL_STATUSES[payroll.status]?.label}
            {payroll.paidDate && ` · ${formatDate(payroll.paidDate)}`}
          </span>
        </header>

        <section className="grid gap-x-6 gap-y-1 border-b border-border py-4 text-sm sm:grid-cols-2">
          <p>
            <span className="text-syrup-muted">Employee: </span>
            <span className="font-semibold">{payroll.employee.name}</span> <span className="font-mono text-syrup-muted">#{payroll.employee.employeeCode}</span>
          </p>
          <p>
            <span className="text-syrup-muted">Role: </span>
            {payroll.employee.roleTitle}
            {payroll.employee.departmentName && `, ${payroll.employee.departmentName}`}
          </p>
          <p>
            <span className="text-syrup-muted">Salary: </span>
            {formatRupees(s.salaryAmountPaise)} {RATE_SUFFIX[s.salaryType]} ({SALARY_TYPES[s.salaryType]})
          </p>
          <p>
            <span className="text-syrup-muted">Working days: </span>
            {s.workingDays}
            {s.salaryType === 'monthly' && s.perDayPaise != null && ` · ${formatRupees(s.perDayPaise)} per day`}
          </p>
        </section>

        <section className="border-b border-border py-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-syrup-muted">Attendance</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {dayCounts(s).map(([label, n]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-syrup-soft">{label}</dt>
                <dd className="font-semibold">{n}</dd>
              </div>
            ))}
            {s.salaryType === 'hourly' && (
              <div className="flex justify-between gap-2">
                <dt className="text-syrup-soft">Hours worked</dt>
                <dd className="font-semibold">{formatDuration(s.workedMinutes)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-syrup-soft">Overtime</dt>
              <dd className="font-semibold">{s.overtimeMinutes ? formatDuration(s.overtimeMinutes) : '0'}</dd>
            </div>
          </dl>
        </section>

        <section className="grid gap-6 border-b border-border py-4 text-sm sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-syrup-muted">Earnings</h2>
            <dl className="divide-y divide-border">
              <Line label="Base pay" value={s.basePaise} />
              <Line label={s.overtimeMinutes ? `Overtime (${formatDuration(s.overtimeMinutes)} × ${s.overtimeMultiplier})` : 'Overtime'} value={s.overtimePaise} />
              <Line label="Bonus" value={s.bonusPaise} />
            </dl>
          </div>
          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-syrup-muted">Deductions</h2>
            <dl className="divide-y divide-border">
              {deductions.length === 0 && <Line label="Attendance deductions" value={0} />}
              {deductions.map(([label, paise]) => (
                <Line key={label} label={label} value={paise} negative />
              ))}
              <Line label="Salary advance" value={s.advancePaise} negative={s.advancePaise > 0} />
            </dl>
          </div>
        </section>

        <section className="flex items-center justify-between py-4">
          <p className="text-lg font-semibold">Net pay</p>
          <p className="text-3xl font-semibold" data-testid="payslip-net">
            {formatRupees(s.netPaise)}
          </p>
        </section>
        {s.unrecoveredAdvancePaise > 0 && (
          <p className="text-sm text-primary-ink">{formatRupees(s.unrecoveredAdvancePaise)} of the advance could not be recovered this month.</p>
        )}
        {isDraft && s.countedThrough && (
          <p className="text-sm text-syrup-muted">Attendance counted up to {formatDate(s.countedThrough)}.</p>
        )}
        <footer className="mt-4 border-t border-border pt-3 text-xs text-syrup-muted">
          Computer-generated payslip. Worked out from attendance and approved leave. Money shown in ₹.
        </footer>
      </article>
    </>
  )
}
