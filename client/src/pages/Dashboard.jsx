import { useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarOff, Clock, IndianRupee, UserCheck, UserPlus, UserX, Users } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import {
  AttendanceDonut,
  DepartmentAttendance,
  KpiCard,
  SalaryOverview,
  StaffTable,
  UpcomingPayments,
  UpsellBanner,
} from '../components/dashboard/Widgets.jsx'
import { CountUp, StaggerGroup } from '../components/dashboard/motion.jsx'
import { dashboardApi } from '../api/dashboard.js'
import { useApi } from '../hooks/useApi.js'
import { formatDate, formatRupees } from '../utils/format.js'
import { formatTimeIST } from '../utils/date.js'

const REFRESH_MS = 60_000
const PERIODS = ['week', 'month', 'year']

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface shadow-soft" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 rounded-2xl bg-surface shadow-soft" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-2xl bg-surface shadow-soft lg:col-span-2" />
        <div className="h-80 rounded-2xl bg-surface shadow-soft" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [params, setSearchParams] = useSearchParams()
  const period = PERIODS.includes(params.get('period')) ? params.get('period') : 'month'
  const setPeriod = (p) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p === 'month') next.delete('period')
        else next.set('period', p)
        return next
      },
      { replace: true },
    )

  const fetcher = useCallback(() => dashboardApi.summary(period), [period])
  const { data, loading, error, reload } = useApi(fetcher)

  // SPEC 4.10: auto-refresh every 60s (reloads keep the current data on screen)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [reload])

  const header = (
    <PageHeader
      title="Dashboard"
      subtitle={data ? `${formatDate(data.today)} · updated ${formatTimeIST(data.generatedAt)}, refreshes every minute` : 'Today at your shop'}
    />
  )

  if (loading) {
    return (
      <div>
        {header}
        <Skeleton />
      </div>
    )
  }
  if (error && !data) {
    return (
      <div>
        {header}
        <ErrorState message={error} onRetry={reload} />
      </div>
    )
  }

  const { kpis, salary } = data
  if (kpis.totalStaff === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Users}
          title="No staff yet"
          message="Add your employees and their shifts. Attendance, payroll and this dashboard fill in as they start punching in."
          action={
            <Link to="/employees/new" className="inline-flex items-center gap-2 rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-primary-strong">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add employee
            </Link>
          }
        />
        {data.showUpsell && (
          <div className="mt-4">
            <UpsellBanner />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {header}

      <StaggerGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard testId="kpi-total" icon={Users} label="Total active staff" value={<CountUp value={kpis.totalStaff} />} tone="bg-syrup text-background" />
        <KpiCard
          testId="kpi-present"
          icon={UserCheck}
          label="Present today"
          value={
            <>
              <CountUp value={kpis.presentToday} />/{kpis.totalStaff}
            </>
          }
          hint={`${kpis.presentPercent}% came in (incl. late & half day)`}
          tone="bg-present-tint text-present-ink"
        />
        <KpiCard
          testId="kpi-leave"
          icon={CalendarOff}
          label="On leave"
          value={<CountUp value={kpis.onLeaveToday} />}
          hint={
            kpis.pendingLeaveRequests ? (
              <Link to="/leaves" className="font-semibold text-primary-ink">
                {kpis.pendingLeaveRequests} pending {kpis.pendingLeaveRequests === 1 ? 'request' : 'requests'}
              </Link>
            ) : (
              'No pending requests'
            )
          }
          tone="bg-leave-tint text-leave-ink"
        />
        <KpiCard testId="kpi-late" icon={Clock} label="Late arrivals" value={<CountUp value={kpis.lateToday} />} tone="bg-amber-tint text-amber-ink" />
        <KpiCard testId="kpi-absent" icon={UserX} label="Absent today" value={<CountUp value={kpis.absentToday} />} tone="bg-primary-tint text-primary-ink" />
        {salary && (
          <KpiCard
            testId="kpi-salary"
            icon={IndianRupee}
            label="Est. monthly payment"
            value={<CountUp value={salary.estMonthlyPaymentPaise} format={formatRupees} step={100} />}
            hint="Full month at current salaries"
            tone="bg-background-deep text-syrup-soft"
          />
        )}
      </StaggerGroup>

      <StaggerGroup className={`grid gap-4 ${salary ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <AttendanceDonut overview={data.attendanceOverview} period={period} onPeriodChange={setPeriod} />
        {salary && <SalaryOverview salary={salary} />}
        <DepartmentAttendance departments={data.departments} />
      </StaggerGroup>

      <StaggerGroup className={`grid gap-4 ${salary ? 'lg:grid-cols-3' : ''}`}>
        <StaffTable staff={data.staff} className={salary ? 'lg:col-span-2' : ''} />
        {salary && <UpcomingPayments payments={salary.upcomingPayments} />}
      </StaggerGroup>

      {data.showUpsell && <UpsellBanner />}
    </div>
  )
}
