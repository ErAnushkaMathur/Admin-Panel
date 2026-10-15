import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarOff, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, SearchX, X } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import FormField from '../components/FormField.jsx'
import SelectField from '../components/SelectField.jsx'
import EmployeeAvatar from '../components/employees/EmployeeAvatar.jsx'
import LeaveFormModal from '../components/leaves/LeaveFormModal.jsx'
import DecisionDialog from '../components/leaves/DecisionDialog.jsx'
import { LEAVE_STATUSES, LEAVE_TYPES, STATUS_TABS } from '../components/leaves/leaveMeta.js'
import { leavesApi } from '../api/leaves.js'
import { employeesApi } from '../api/employees.js'
import { AnimatePresence } from 'framer-motion'
import { useApi } from '../hooks/useApi.js'
import { rowFadeIn, useFlash } from '../hooks/useFlash.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDateRange } from '../utils/format.js'

const PAGE_SIZE = 50

function Pill({ meta, fallback }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta?.pill ?? 'bg-background-deep'}`}>
      {meta?.label ?? fallback}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl bg-surface p-5 shadow-soft" aria-busy="true" aria-label="Loading leave">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-9 w-9 rounded-full bg-background-deep" />
          <div className="h-4 flex-[2] rounded bg-background-deep" />
          <div className="hidden h-4 flex-1 rounded bg-background-deep md:block" />
          <div className="h-8 w-24 rounded-xl bg-background-deep" />
        </div>
      ))}
    </div>
  )
}

function DecisionInfo({ leave }) {
  if (leave.status === 'pending') return <span className="text-xs text-syrup-muted">Recorded by {leave.requestedBy?.name ?? '—'}</span>
  return (
    <span className="text-xs text-syrup-muted">
      {leave.addedByOwner ? 'Added' : leave.status === 'approved' ? 'Approved' : 'Rejected'} by {leave.decidedBy?.name ?? '—'}
      {leave.decisionNote && <span className="block italic">“{leave.decisionNote}”</span>}
    </span>
  )
}

export default function Leaves() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [params, setSearchParams] = useSearchParams()
  const status = params.get('status') || 'pending'
  const employeeId = params.get('employee') || ''
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  // 'request' | 'onBehalf' | null
  const [formMode, setFormMode] = useState(null)
  // { leave, decision: 'approve' | 'reject' } | null
  const [deciding, setDeciding] = useState(null)

  const setParams = useCallback(
    (changes) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(changes)) {
            const isDefault = (k === 'status' && v === 'pending') || (k === 'page' && v === 1)
            if (v && !isDefault) next.set(k, v)
            else next.delete(k)
          }
          if (!('page' in changes)) next.delete('page')
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  const fetcher = useCallback(
    () => leavesApi.list({ status, employeeId, from, to, page, limit: PAGE_SIZE }),
    [status, employeeId, from, to, page],
  )
  const { data, loading, error, reload, refreshing } = useApi(fetcher)
  const [flashId, flash] = useFlash()

  const fetchEmployees = useCallback(() => employeesApi.list({ status: 'all', limit: 100 }), [])
  const { data: employeeData } = useApi(fetchEmployees)
  const allEmployees = employeeData?.employees ?? []
  const activeEmployees = allEmployees.filter((e) => e.isActive)

  // `changedId`: the leave just added/decided, flashed if it's still in the list
  const afterChange = (changedId) => {
    if (changedId) flash(changedId)
    setFormMode(null)
    setDeciding(null)
    reload()
  }

  const hasFilters = Boolean(employeeId || from || to)
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const actions = (
    <>
      <Button variant="secondary" icon={Plus} onClick={() => setFormMode('request')}>
        Record request
      </Button>
      {isOwner && (
        <Button icon={CalendarPlus} onClick={() => setFormMode('onBehalf')}>
          Add approved leave
        </Button>
      )}
    </>
  )

  const decideButtons = (leave) =>
    leave.status === 'pending' && (
      <div className="flex gap-2">
        <Button className="px-3 py-1.5" icon={Check} onClick={() => setDeciding({ leave, decision: 'approve' })} aria-label={`Approve leave for ${leave.employee.name}`}>
          Approve
        </Button>
        <Button variant="secondary" className="px-3 py-1.5" icon={X} onClick={() => setDeciding({ leave, decision: 'reject' })} aria-label={`Reject leave for ${leave.employee.name}`}>
          Reject
        </Button>
      </div>
    )

  let content
  if (loading) content = <Skeleton />
  else if (error) content = <ErrorState message={error} onRetry={reload} />
  else if (data.rows.length === 0 && hasFilters) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No leave matches"
        message="Try another employee or date range."
        action={
          <Button variant="secondary" onClick={() => setParams({ employee: '', from: '', to: '' })}>
            Clear filters
          </Button>
        }
      />
    )
  } else if (data.rows.length === 0) {
    const messages = {
      pending: ['No pending requests', 'When staff ask for leave, record the request here and approve or reject it.'],
      approved: ['No approved leave', 'Approved leave shows as On leave in Attendance.'],
      rejected: ['No rejected leave', ''],
      all: ['No leave yet', 'Record a request, or add approved leave on behalf of an employee.'],
    }
    const [title, message] = messages[status]
    content = <EmptyState icon={CalendarOff} title={title} message={message} action={status === 'pending' || status === 'all' ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null} />
  } else {
    content = (
      <>
        <div className="hidden overflow-x-auto rounded-2xl bg-surface shadow-soft lg:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-syrup-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Employee</th>
                <th scope="col" className="px-4 py-3 font-semibold">Dates</th>
                <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                <th scope="col" className="px-4 py-3 font-semibold">Reason</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((l, i) => (
                <tr
                  key={l._id}
                  className={`align-top transition-colors hover:bg-background/40 ${rowFadeIn(i).className} ${flashId === l._id ? 'flash-row' : ''}`}
                  style={rowFadeIn(i).style}
                  data-testid="leave-row"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={l.employee.name} color={l.employee.department?.color} />
                      <div>
                        <Link to={`/employees/${l.employee._id}`} className="font-semibold hover:text-primary-ink">
                          {l.employee.name}
                        </Link>
                        <p className="font-mono text-xs text-syrup-muted">#{l.employee.employeeCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDateRange(l.fromDate, l.toDate)}
                    <span className="block text-xs text-syrup-muted">
                      {l.days} {l.days === 1 ? 'day' : 'days'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Pill meta={LEAVE_TYPES[l.type]} fallback={l.type} /></td>
                  <td className="max-w-56 px-4 py-3 text-syrup-soft">{l.reason || <span className="text-syrup-muted">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <Pill meta={LEAVE_STATUSES[l.status]} fallback={l.status} />
                      <DecisionInfo leave={l} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{decideButtons(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 lg:hidden">
          {data.rows.map((l, i) => (
            <li
              key={l._id}
              className={`rounded-2xl bg-surface p-4 shadow-soft ${rowFadeIn(i).className} ${flashId === l._id ? 'flash-card' : ''}`}
              style={rowFadeIn(i).style}
              data-testid="leave-card"
            >
              <div className="flex items-start gap-3">
                <EmployeeAvatar name={l.employee.name} color={l.employee.department?.color} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/employees/${l.employee._id}`} className="truncate font-semibold">
                      {l.employee.name}
                    </Link>
                    <Pill meta={LEAVE_STATUSES[l.status]} fallback={l.status} />
                  </div>
                  <p className="text-sm">
                    {formatDateRange(l.fromDate, l.toDate)} · {l.days} {l.days === 1 ? 'day' : 'days'}{' '}
                    <Pill meta={LEAVE_TYPES[l.type]} fallback={l.type} />
                  </p>
                  {l.reason && <p className="text-sm text-syrup-soft">“{l.reason}”</p>}
                  <DecisionInfo leave={l} />
                  {l.status === 'pending' && <div className="pt-2">{decideButtons(l)}</div>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {lastPage > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            <p className="text-syrup-muted">
              Page {page} of {lastPage}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => setParams({ page: page - 1 })}>
                Previous
              </Button>
              <Button variant="secondary" disabled={page >= lastPage} onClick={() => setParams({ page: page + 1 })}>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </>
    )
  }

  return (
    <div>
      <PageHeader title="Leave management" subtitle="Record requests, approve or reject them, and add leave on behalf of staff" actions={actions} />

      <div role="tablist" aria-label="Leave status" className="mb-4 inline-flex flex-wrap rounded-xl bg-background-deep p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={status === tab.key}
            onClick={() => setParams({ status: tab.key })}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              status === tab.key ? 'bg-surface text-syrup shadow-soft' : 'text-syrup-muted hover:text-syrup'
            }`}
          >
            {tab.label}
            {data?.counts && (
              <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tab.key === 'pending' && data.counts.pending ? 'bg-primary-strong text-white' : 'bg-background'}`}>
                {data.counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SelectField label="Employee" value={employeeId} onChange={(e) => setParams({ employee: e.target.value })}>
          <option value="">All employees</option>
          {allEmployees.map((e) => (
            <option key={e._id} value={e._id}>
              {e.name} (#{e.employeeCode}){e.isActive ? '' : ' – inactive'}
            </option>
          ))}
        </SelectField>
        <FormField label="From" name="from" type="date" max={to || undefined} value={from} onChange={(e) => setParams({ from: e.target.value })} />
        <FormField label="To" name="to" type="date" min={from || undefined} value={to} onChange={(e) => setParams({ to: e.target.value })} />
      </div>

      <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        {content}
      </div>

      <AnimatePresence>
        {formMode && (
          <LeaveFormModal key="form" mode={formMode} employees={activeEmployees} onClose={() => setFormMode(null)} onSaved={(leave) => afterChange(leave?._id)} />
        )}
        {deciding && (
          <DecisionDialog
            key="decide"
            leave={deciding.leave}
            decision={deciding.decision}
            onClose={() => setDeciding(null)}
            onDone={() => afterChange(deciding.leave._id)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
