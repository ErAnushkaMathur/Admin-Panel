import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import TodayTab from '../components/attendance/TodayTab.jsx'
import MonthlyTab from '../components/attendance/MonthlyTab.jsx'
import ExceptionsTab from '../components/attendance/ExceptionsTab.jsx'
import { departmentsApi } from '../api/departments.js'
import { useApi } from '../hooks/useApi.js'

const TABS = [
  { key: 'today', label: 'Today', component: TodayTab },
  { key: 'monthly', label: 'Monthly', component: MonthlyTab },
  { key: 'exceptions', label: 'Exceptions', component: ExceptionsTab },
]

export default function Attendance() {
  // Tab and filters live in the URL so refresh/Back keep them
  const [params, setSearchParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0]

  const setParams = useCallback(
    (changes) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(changes)) {
            if (v) next.set(k, v)
            else next.delete(k)
          }
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  const fetchDepartments = useCallback(() => departmentsApi.list(), [])
  const { data: departments } = useApi(fetchDepartments)

  const Tab = tab.component
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Who's in, the month at a glance, and anything that needs fixing" />

      <div role="tablist" aria-label="Attendance views" className="mb-5 inline-flex rounded-xl bg-background-deep p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={t.key === tab.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setParams({ tab: t.key === 'today' ? '' : t.key })}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              t.key === tab.key ? 'bg-surface text-syrup shadow-soft' : 'text-syrup-muted hover:text-syrup'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab.key}`} aria-labelledby={`tab-${tab.key}`}>
        <Tab params={params} setParams={setParams} departments={departments ?? []} />
      </div>
    </div>
  )
}
