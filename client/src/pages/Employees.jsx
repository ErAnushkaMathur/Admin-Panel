import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Moon, Search, SearchX, UserPlus, Users } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import SelectField from '../components/SelectField.jsx'
import StatusBadge from '../components/employees/StatusBadge.jsx'
import EmployeeAvatar from '../components/employees/EmployeeAvatar.jsx'
import { employeesApi } from '../api/employees.js'
import { departmentsApi } from '../api/departments.js'
import { useApi } from '../hooks/useApi.js'
import { rowFadeIn } from '../hooks/useFlash.js'
import { useAuth } from '../hooks/useAuth.js'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { formatTime12 } from '../utils/format.js'

const PAGE_SIZE = 50

function formatPhone(p) {
  return p?.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p
}

function DepartmentLabel({ department }) {
  if (!department) return <span className="text-syrup-muted">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: department.color }} aria-hidden="true" />
      {department.name}
    </span>
  )
}

function ShiftLabel({ shift }) {
  if (!shift) return <span className="text-syrup-muted">—</span>
  return (
    <span>
      {shift.name}
      <span className="block text-xs text-syrup-muted">
        {formatTime12(shift.startTime)} – {formatTime12(shift.endTime)}
        {shift.crossesMidnight && <Moon className="ml-1 inline h-3 w-3" aria-label="ends next day" />}
      </span>
    </span>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface p-5 shadow-soft" aria-busy="true" aria-label="Loading employees">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
          <div className="h-9 w-9 rounded-full bg-background-deep" />
          <div className="h-4 flex-[2] rounded bg-background-deep" />
          <div className="hidden h-4 flex-1 rounded bg-background-deep md:block" />
          <div className="hidden h-4 flex-1 rounded bg-background-deep md:block" />
          <div className="h-4 w-16 rounded bg-background-deep" />
        </div>
      ))}
    </div>
  )
}

export default function Employees() {
  const { user } = useAuth()
  const canManage = user?.role === 'owner'
  const navigate = useNavigate()

  // Filters live in the URL so Back/refresh keep them
  const [params, setParams] = useSearchParams()
  const departmentId = params.get('dept') || ''
  const status = params.get('status') || 'all'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const urlQuery = params.get('q') || ''
  const [searchInput, setSearchInput] = useState(urlQuery)
  // A search that arrives through the URL (top-bar search, Back/Forward) replaces what's in the box.
  // Adjusted during render (not in an effect); our own debounced URL updates match the box already.
  const [seenQuery, setSeenQuery] = useState(urlQuery)
  if (urlQuery !== seenQuery) {
    setSeenQuery(urlQuery)
    if (urlQuery !== searchInput.trim()) setSearchInput(urlQuery)
  }
  const search = useDebouncedValue(searchInput.trim(), 300)

  const updateParams = useCallback(
    (changes) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value && !(key === 'status' && value === 'all') && !(key === 'page' && value === 1)) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Push the debounced search into the URL (and back to page 1) once it has caught up with the box.
  // While it still lags behind (e.g. right after the URL changed from the top bar or Back), pushing
  // it would write the old term back over the new one.
  const settled = search === searchInput.trim()
  useEffect(() => {
    if (settled && search !== urlQuery) updateParams({ q: search, page: 1 })
  }, [settled, search, urlQuery, updateParams])

  const fetchEmployees = useCallback(
    () =>
      employeesApi.list({
        ...(search && { search }),
        ...(departmentId && { departmentId }),
        status,
        page,
        limit: PAGE_SIZE,
      }),
    [search, departmentId, status, page],
  )
  const { data, loading, error, reload, refreshing } = useApi(fetchEmployees)

  const fetchDepartments = useCallback(() => departmentsApi.list(), [])
  const { data: departments } = useApi(fetchDepartments)

  const hasFilters = Boolean(search || departmentId || status !== 'all')
  const clearFilters = () => {
    setSearchInput('')
    updateParams({ q: '', dept: '', status: 'all', page: 1 })
  }

  const addButton = canManage && (
    <Button icon={UserPlus} onClick={() => navigate('/employees/new')}>
      Add employee
    </Button>
  )

  const employees = data?.employees ?? []
  const total = data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  let content
  if (loading) {
    content = <TableSkeleton />
  } else if (error) {
    content = <ErrorState message={error} onRetry={reload} />
  } else if (employees.length === 0 && !hasFilters) {
    content = (
      <EmptyState
        icon={Users}
        title="No employees yet"
        message="Add your staff to track attendance and payroll. Each employee gets a code and PIN to punch in."
        action={addButton}
      />
    )
  } else if (employees.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No employees match"
        message="Try a different search or clear the filters."
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-2xl bg-surface shadow-soft lg:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-syrup-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                <th scope="col" className="px-4 py-3 font-semibold">Department</th>
                <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                <th scope="col" className="px-4 py-3 font-semibold">Shift</th>
                <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e, i) => (
                <tr
                  key={e._id}
                  onClick={() => navigate(`/employees/${e._id}`)}
                  className={`cursor-pointer transition-colors hover:bg-background/50 ${rowFadeIn(i).className} ${e.isActive ? '' : 'text-syrup-muted'}`}
                  style={rowFadeIn(i).style}
                >
                  <td className="px-5 py-3">
                    <Link
                      to={`/employees/${e._id}`}
                      onClick={(ev) => ev.stopPropagation()}
                      className="flex items-center gap-3 font-semibold hover:text-primary-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <EmployeeAvatar name={e.name} color={e.department?.color} />
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{e.employeeCode}</td>
                  <td className="px-4 py-3">
                    <DepartmentLabel department={e.department} />
                  </td>
                  <td className="px-4 py-3">{e.roleTitle}</td>
                  <td className="px-4 py-3">
                    <ShiftLabel shift={e.shift} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatPhone(e.phone)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={e.isActive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile / tablet cards */}
        <ul className="space-y-3 lg:hidden">
          {employees.map((e, i) => (
            <li key={e._id} {...rowFadeIn(i)}>
              <Link
                to={`/employees/${e._id}`}
                className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <EmployeeAvatar name={e.name} color={e.department?.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{e.name}</p>
                    <StatusBadge isActive={e.isActive} />
                  </div>
                  <p className="text-sm text-syrup-muted">
                    <span className="font-mono">#{e.employeeCode}</span> · {e.roleTitle}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-syrup-muted">
                    <DepartmentLabel department={e.department} />
                    {e.shift && <span>{e.shift.name}</span>}
                    <span>{formatPhone(e.phone)}</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {lastPage > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            <p className="text-syrup-muted">
              Page {page} of {lastPage}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => updateParams({ page: page - 1 })}>
                Previous
              </Button>
              <Button variant="secondary" disabled={page >= lastPage} onClick={() => updateParams({ page: page + 1 })}>
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
      <PageHeader
        title="Employees"
        subtitle={data ? `${total} ${total === 1 ? 'employee' : 'employees'}${hasFilters ? ' match your filters' : ''}` : 'Your staff'}
        actions={addButton}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="employee-search" className="sr-only">
            Search employees
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-syrup-faint" aria-hidden="true" />
          <input
            id="employee-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, code, role or phone"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-syrup-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <SelectField
          label="Department"
          hideLabel
          className="sm:w-52"
          value={departmentId}
          onChange={(e) => updateParams({ dept: e.target.value, page: 1 })}
        >
          <option value="">All departments</option>
          {(departments ?? []).map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Status"
          hideLabel
          className="sm:w-40"
          value={status}
          onChange={(e) => updateParams({ status: e.target.value, page: 1 })}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
      </div>

      <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        {content}
      </div>
    </div>
  )
}
