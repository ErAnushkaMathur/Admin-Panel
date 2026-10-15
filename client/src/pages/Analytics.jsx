import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChartColumn, UserPlus } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import { BarList, ColumnChart, LineChart, TableView, TooltipRow } from '../components/analytics/charts.jsx'
import { cssVar } from '../utils/theme.js'

// The payroll chart's single series (same teal as the other charts)
const SERIES = cssVar('secondary-strong')
import { analyticsApi } from '../api/analytics.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { WEEKDAYS, formatDate, formatDuration, formatRupees } from '../utils/format.js'

const RANGES = [
  { key: '30d', label: 'Last 30 days', previous: 'previous 30 days' },
  { key: '90d', label: 'Last 90 days', previous: 'previous 90 days' },
  { key: '12m', label: 'Last 12 months', previous: 'previous 12 months' },
]
// The payroll chart is monthly: 12 months for the yearly view, otherwise 6
const PAYROLL_RANGE = { '30d': '6m', '90d': '6m', '12m': '12m' }

const dayMonth = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}
const monthShort = (ym, withYear = false) => {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'short', ...(withYear && { year: '2-digit' }), timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}
const bucketLabel = (p, bucket) => (bucket === 'month' ? monthShort(p.key) : dayMonth(p.key))
const bucketTitle = (p, bucket) => {
  if (bucket === 'month') return monthShort(p.key, true)
  if (bucket === 'week') return p.from === p.to ? formatDate(p.from) : `${dayMonth(p.from)} – ${dayMonth(p.to)}`
  return formatDate(p.key)
}
const changeText = (percent, previous) => {
  if (percent === null) return `None in the ${previous}`
  if (percent === 0) return `Same as the ${previous}`
  return `${percent > 0 ? '↑' : '↓'} ${Math.abs(percent)}% vs the ${previous}`
}

function Card({ title, subtitle, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-surface p-5 shadow-soft ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-syrup-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function StatTile({ label, value, hint, testId }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-soft" data-testid={testId}>
      <p className="text-sm text-syrup-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-syrup-muted">{hint}</p>}
    </div>
  )
}

function Quiet({ children }) {
  return <p className="py-8 text-center text-sm text-syrup-muted">{children}</p>
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading analytics">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface shadow-soft" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-surface shadow-soft" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-2xl bg-surface shadow-soft" />
        <div className="h-72 rounded-2xl bg-surface shadow-soft" />
      </div>
    </div>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [params, setSearchParams] = useSearchParams()
  const range = RANGES.some((r) => r.key === params.get('range')) ? params.get('range') : '30d'
  const rangeMeta = RANGES.find((r) => r.key === range)
  const setRange = (key) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (key === '30d') next.delete('range')
        else next.set('range', key)
        return next
      },
      { replace: true },
    )

  const fetchAttendance = useCallback(() => analyticsApi.attendance(range), [range])
  const attendance = useApi(fetchAttendance)
  const payrollRange = PAYROLL_RANGE[range]
  const fetchPayroll = useCallback(() => (isOwner ? analyticsApi.payroll(payrollRange) : Promise.resolve(null)), [isOwner, payrollRange])
  const payroll = useApi(fetchPayroll)

  const data = attendance.data
  // While a new range loads, keep the previous charts on screen, dimmed (no skeleton flash)
  const stale = Boolean(data && data.range !== range)

  const filters = (
    <div role="tablist" aria-label="Date range" className="inline-flex flex-wrap rounded-xl bg-background-deep p-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="tab"
          aria-selected={range === r.key}
          onClick={() => setRange(r.key)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            range === r.key ? 'bg-surface text-syrup shadow-soft' : 'text-syrup-muted hover:text-syrup'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )

  let content
  if (attendance.loading) content = <Skeleton />
  else if (attendance.error && !data) content = <ErrorState message={attendance.error} onRetry={attendance.reload} />
  else if (data.staff === 0) {
    content = (
      <EmptyState
        icon={ChartColumn}
        title="Nothing to analyse yet"
        message="Trends appear once you have staff punching in."
        action={
          <Link to="/employees/new" className="inline-flex items-center gap-2 rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-primary-strong">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add employee
          </Link>
        }
      />
    )
  } else {
    const { summary, trend, lateRanking, overtime, absentees, bucket } = data
    content = (
      <div className={`space-y-4 transition-opacity ${stale ? 'opacity-50' : ''}`} aria-busy={stale}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            testId="stat-came-in"
            label="Came in"
            value={`${summary.cameInPercent}%`}
            hint={`${summary.cameIn} of ${summary.total} staff-days (incl. late & half day)`}
          />
          <StatTile testId="stat-late" label="Late arrivals" value={summary.counts.late} hint="Days someone came in late" />
          <StatTile testId="stat-absent" label="Absences" value={summary.counts.absent} hint={`Plus ${summary.counts.on_leave} days on leave`} />
          <StatTile testId="stat-overtime" label="Overtime" value={formatDuration(overtime.totalMinutes)} hint={changeText(overtime.changePercent, rangeMeta.previous)} />
        </div>

        <Card title="Attendance trend" subtitle={`Share of staff who came in, ${bucket === 'day' ? 'per day' : bucket === 'week' ? 'per week' : 'per month'}`}>
          <LineChart
            label="Attendance trend: percentage of staff who came in"
            points={trend.map((p) => ({ ...p, value: p.cameInPercent }))}
            formatY={(v) => `${v}%`}
            formatX={(p) => bucketLabel(p, bucket)}
            tooltip={(p) => (
              <>
                <p className="mb-1 font-semibold text-syrup">{bucketTitle(p, bucket)}</p>
                {p.total === 0 ? (
                  <p className="text-syrup-muted">No working days</p>
                ) : (
                  <>
                    <TooltipRow label="Came in" value={`${p.cameInPercent}%`} strong />
                    <TooltipRow label="On time" value={p.counts.present} />
                    <TooltipRow label="Late" value={p.counts.late} />
                    <TooltipRow label="Half day" value={p.counts.half_day} />
                    <TooltipRow label="Absent" value={p.counts.absent} />
                    <TooltipRow label="On leave" value={p.counts.on_leave} />
                  </>
                )}
              </>
            )}
          />
          <TableView
            caption="Attendance trend"
            columns={[
              { key: 'period', label: bucket === 'day' ? 'Day' : bucket === 'week' ? 'Week' : 'Month' },
              { key: 'cameIn', label: 'Came in', align: 'right' },
              { key: 'present', label: 'On time', align: 'right' },
              { key: 'late', label: 'Late', align: 'right' },
              { key: 'half', label: 'Half day', align: 'right' },
              { key: 'absent', label: 'Absent', align: 'right' },
              { key: 'leave', label: 'On leave', align: 'right' },
            ]}
            rows={trend.map((p) => ({
              key: p.key,
              period: bucketTitle(p, bucket),
              cameIn: p.cameInPercent === null ? '—' : `${p.cameInPercent}%`,
              present: p.counts.present,
              late: p.counts.late,
              half: p.counts.half_day,
              absent: p.counts.absent,
              leave: p.counts.on_leave,
            }))}
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Late-arrival ranking" subtitle="Most late days first (a half day doesn't count as late)">
            {lateRanking.length === 0 ? (
              <Quiet>Nobody came in late in this period.</Quiet>
            ) : (
              <BarList
                testId="late-row"
                rows={lateRanking.map((r) => ({
                  key: r.employee._id,
                  label: r.employee.name,
                  sublabel: r.employee.department?.name,
                  value: r.lateDays,
                  valueText: `${r.lateDays} ${r.lateDays === 1 ? 'day' : 'days'} · avg ${formatDuration(r.averageLateMinutes)}`,
                  hint: `Late on ${r.latePercent}% of the ${r.cameInDays} days they came in`,
                }))}
              />
            )}
            {lateRanking.length > 0 && (
              <TableView
                caption="Late-arrival ranking"
                columns={[
                  { key: 'name', label: 'Employee' },
                  { key: 'days', label: 'Late days', align: 'right' },
                  { key: 'avg', label: 'Avg late', align: 'right' },
                  { key: 'rate', label: 'Of days in', align: 'right' },
                ]}
                rows={lateRanking.map((r) => ({
                  key: r.employee._id,
                  name: r.employee.name,
                  days: r.lateDays,
                  avg: formatDuration(r.averageLateMinutes),
                  rate: `${r.latePercent}%`,
                }))}
              />
            )}
          </Card>

          <Card title="Overtime by department" subtitle={`Hours beyond the shift, ${changeText(overtime.changePercent, rangeMeta.previous).toLowerCase()}`}>
            {overtime.totalMinutes === 0 ? (
              <Quiet>No overtime in this period.</Quiet>
            ) : (
              <BarList
                testId="overtime-row"
                rows={overtime.departments.map((d) => ({
                  key: d.departmentId ?? 'none',
                  label: d.name,
                  sublabel: `${d.employeesWithOvertime} ${d.employeesWithOvertime === 1 ? 'person' : 'people'}`,
                  value: d.minutes,
                  valueText: `${formatDuration(d.minutes)} · ${d.sharePercent}%`,
                  hint: changeText(d.changePercent, rangeMeta.previous),
                }))}
              />
            )}
            {overtime.totalMinutes > 0 && (
              <TableView
                caption="Overtime by department"
                columns={[
                  { key: 'name', label: 'Department' },
                  { key: 'now', label: 'This period', align: 'right' },
                  { key: 'before', label: 'Previous', align: 'right' },
                  { key: 'change', label: 'Change', align: 'right' },
                ]}
                rows={overtime.departments.map((d) => ({
                  key: d.departmentId ?? 'none',
                  name: d.name,
                  now: formatDuration(d.minutes),
                  before: formatDuration(d.previousMinutes),
                  change: d.changePercent === null ? '—' : `${d.changePercent > 0 ? '+' : ''}${d.changePercent}%`,
                }))}
              />
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Absences by weekday" subtitle="Share of due days with an absence (leave not included)">
            <ColumnChart
              label="Absence rate by weekday"
              bars={absentees.byWeekday.map((w) => ({ key: w.weekday, label: WEEKDAYS[w.weekday].slice(0, 3), value: w.dueDays ? w.absentPercent : null, ...w }))}
              formatY={(v) => `${v}%`}
              valueLabel={(b) => (b.value ? `${b.value}%` : '')}
              tooltip={(b) => (
                <>
                  <p className="mb-1 font-semibold text-syrup">{WEEKDAYS[b.weekday]}s</p>
                  {b.dueDays ? (
                    <>
                      <TooltipRow label="Absent" value={`${b.absentPercent}%`} strong />
                      <TooltipRow label="Absent days" value={`${b.absentDays} of ${b.dueDays}`} />
                    </>
                  ) : (
                    <p className="text-syrup-muted">Nobody was due</p>
                  )}
                </>
              )}
            />
            <TableView
              caption="Absences by weekday"
              columns={[
                { key: 'day', label: 'Weekday' },
                { key: 'absent', label: 'Absent days', align: 'right' },
                { key: 'due', label: 'Due days', align: 'right' },
                { key: 'rate', label: 'Rate', align: 'right' },
              ]}
              rows={absentees.byWeekday.map((w) => ({ key: w.weekday, day: WEEKDAYS[w.weekday], absent: w.absentDays, due: w.dueDays, rate: `${w.absentPercent}%` }))}
            />
          </Card>

          <Card title="Absentee patterns" subtitle="Staff who keep missing the same weekday (3+ times, half or more of those days)">
            {absentees.patterns.length === 0 ? (
              <Quiet>No repeat patterns in this period.</Quiet>
            ) : (
              <ul className="divide-y divide-border">
                {absentees.patterns.map((p) => (
                  <li key={`${p.employee._id}-${p.weekday}`} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid="pattern-row">
                    <span>
                      <Link to={`/employees/${p.employee._id}`} className="font-semibold hover:text-primary-ink">
                        {p.employee.name}
                      </Link>{' '}
                      was absent {p.absentDays} of {p.dueDays} {WEEKDAYS[p.weekday]}s
                    </span>
                    <span className="shrink-0 rounded-full bg-primary-tint px-2.5 py-0.5 text-xs font-semibold text-primary-ink">{p.absentPercent}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {isOwner && <PayrollCostCard state={payroll} />}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Staff analytics"
        subtitle={data ? `${formatDate(data.from)} – ${formatDate(data.to)} · ${data.staff} active staff` : 'Attendance, punctuality, overtime and payroll over time'}
      />
      <div className="mb-4">{filters}</div>
      {content}
    </div>
  )
}

function PayrollCostCard({ state }) {
  const { data, loading, error, reload } = state
  let body
  if (loading) body = <div className="h-56 animate-pulse rounded-xl bg-background-deep" aria-busy="true" aria-label="Loading payroll cost" />
  else if (error && !data) body = <ErrorState message={error} onRetry={reload} />
  else if (!data.months.some((m) => m.hasData)) body = <Quiet>No payroll calculated in these months yet.</Quiet>
  else {
    body = (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-syrup-soft" aria-label="Legend">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES }} aria-hidden="true" />
            Finalized
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm opacity-40" style={{ backgroundColor: SERIES }} aria-hidden="true" />
            Draft (can still change)
          </span>
          {data.finalMonths > 0 && (
            <span className="ml-auto text-syrup-muted">
              Avg finalized month <span className="font-semibold text-syrup">{formatRupees(data.averageFinalNetPaise)}</span>
            </span>
          )}
        </div>
        <ColumnChart
          label="Net payroll cost per month"
          bars={data.months.map((m) => ({ ...m, key: m.month, label: monthShort(m.month), value: m.hasData ? m.netPaise : null, faded: m.status !== 'final' }))}
          formatY={(v) => formatRupees(v)}
          tooltip={(m) => (
            <>
              <p className="mb-1 font-semibold text-syrup">
                {monthShort(m.month, true)}
                {m.status && m.status !== 'final' && <span className="ml-1 font-normal text-syrup-muted">({m.status === 'draft' ? 'draft' : 'partly final'})</span>}
              </p>
              {m.hasData ? (
                <>
                  <TooltipRow label="Net pay" value={formatRupees(m.netPaise)} strong />
                  <TooltipRow label="Base" value={formatRupees(m.basePaise)} />
                  <TooltipRow label="Overtime" value={formatRupees(m.overtimePaise)} />
                  <TooltipRow label="Deductions" value={formatRupees(m.deductionsPaise)} />
                  <TooltipRow label="Employees" value={m.employees} />
                </>
              ) : (
                <p className="text-syrup-muted">Not calculated</p>
              )}
            </>
          )}
        />
        <TableView
          caption="Payroll cost per month"
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'status', label: 'Status' },
            { key: 'base', label: 'Base', align: 'right' },
            { key: 'ot', label: 'Overtime', align: 'right' },
            { key: 'ded', label: 'Deductions', align: 'right' },
            { key: 'bonus', label: 'Bonus', align: 'right' },
            { key: 'adv', label: 'Advance', align: 'right' },
            { key: 'net', label: 'Net', align: 'right' },
          ]}
          rows={data.months.map((m) => ({
            key: m.month,
            month: monthShort(m.month, true),
            status: m.hasData ? { final: 'Finalized', draft: 'Draft', mixed: 'Partly final' }[m.status] : '—',
            base: m.hasData ? formatRupees(m.basePaise) : '—',
            ot: m.hasData ? formatRupees(m.overtimePaise) : '—',
            ded: m.hasData ? formatRupees(m.deductionsPaise) : '—',
            bonus: m.hasData ? formatRupees(m.bonusPaise) : '—',
            adv: m.hasData ? formatRupees(m.advancePaise) : '—',
            net: m.hasData ? formatRupees(m.netPaise) : '—',
          }))}
        />
      </>
    )
  }
  return (
    <Card title="Payroll cost trend" subtitle="Net pay per month, from saved payroll (finalized months never change)">
      {body}
    </Card>
  )
}
