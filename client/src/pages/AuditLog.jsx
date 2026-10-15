import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, History, Lock, SearchX } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import FormField from '../components/FormField.jsx'
import SelectField from '../components/SelectField.jsx'
import AuditEntry from '../components/auditLog/AuditEntry.jsx'
import { auditLogsApi } from '../api/auditLogs.js'
import { employeesApi } from '../api/employees.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { todayIST } from '../utils/date.js'

const PAGE_SIZE = 50

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading audit log">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl bg-surface p-5 shadow-soft">
          <div className="h-10 w-10 rounded-xl bg-background-deep" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 rounded bg-background-deep" />
            <div className="h-3 w-1/4 rounded bg-background-deep" />
            <div className="h-12 rounded-xl bg-background-deep" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AuditLog() {
  const { user } = useAuth()
  if (user?.role !== 'owner') {
    return (
      <div>
        <PageHeader title="Audit log" />
        <EmptyState icon={Lock} title="Owners only" message="Only the shop owner can see the audit log." />
      </div>
    )
  }
  return <AuditLogContent />
}

function AuditLogContent() {
  const today = todayIST()
  // Filters live in the URL so refresh/Back keep them
  const [params, setSearchParams] = useSearchParams()
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const employeeId = params.get('employee') || ''
  const type = params.get('type') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const setParams = useCallback(
    (changes) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(changes)) {
            if (v && !(k === 'page' && v === 1)) next.set(k, v)
            else next.delete(k)
          }
          // Any filter change goes back to page 1
          if (!('page' in changes)) next.delete('page')
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  const fetcher = useCallback(
    () => auditLogsApi.list({ from, to, employeeId, type, page, limit: PAGE_SIZE }),
    [from, to, employeeId, type, page],
  )
  const { data, loading, error, reload, refreshing } = useApi(fetcher)

  const fetchEmployees = useCallback(() => employeesApi.list({ status: 'all', limit: 100 }), [])
  const { data: employeeData } = useApi(fetchEmployees)

  const hasFilters = Boolean(from || to || employeeId || type)
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  let content
  if (loading) content = <ListSkeleton />
  else if (error) content = <ErrorState message={error} onRetry={reload} />
  else if (data.rows.length === 0 && !hasFilters) {
    content = (
      <EmptyState
        icon={History}
        title="No changes recorded yet"
        message="Salary changes and manual attendance edits will appear here, with who made them and why."
      />
    )
  } else if (data.rows.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No entries match"
        message="Try a wider date range or clear the filters."
        action={
          <Button variant="secondary" onClick={() => setParams({ from: '', to: '', employee: '', type: '' })}>
            Clear filters
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        <ul className="space-y-3">
          {data.rows.map((entry, i) => (
            <AuditEntry key={entry._id} entry={entry} index={i} />
          ))}
        </ul>
        {lastPage > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            <p className="text-syrup-muted">
              Page {page} of {lastPage}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => setParams({ page: page - 1 })}>
                Newer
              </Button>
              <Button variant="secondary" disabled={page >= lastPage} onClick={() => setParams({ page: page + 1 })}>
                Older
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </>
    )
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Audit log"
        subtitle={
          data
            ? `${data.total} ${data.total === 1 ? 'change' : 'changes'}${hasFilters ? ' match your filters' : ' recorded'}`
            : 'Salary changes and manual attendance edits'
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="From" name="from" type="date" max={to || today} value={from} onChange={(e) => setParams({ from: e.target.value })} />
        <FormField label="To" name="to" type="date" min={from || undefined} max={today} value={to} onChange={(e) => setParams({ to: e.target.value })} />
        <SelectField label="Employee" value={employeeId} onChange={(e) => setParams({ employee: e.target.value })}>
          <option value="">All employees</option>
          {(employeeData?.employees ?? []).map((e) => (
            <option key={e._id} value={e._id}>
              {e.name} (#{e.employeeCode}){e.isActive ? '' : ' – inactive'}
            </option>
          ))}
        </SelectField>
        <SelectField label="Type of change" value={type} onChange={(e) => setParams({ type: e.target.value })}>
          <option value="">All changes</option>
          {(data?.actionTypes ?? []).map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </SelectField>
      </div>

      <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        {content}
      </div>
    </div>
  )
}
