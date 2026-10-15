import { useCallback, useState } from 'react'
import { Clock, Moon, Pencil, Plus } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import ShiftFormModal from '../components/shifts/ShiftFormModal.jsx'
import { shiftsApi } from '../api/shifts.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDuration, formatTime12 } from '../utils/format.js'

function NextDayBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-syrup px-2 py-0.5 text-xs font-medium text-background">
      <Moon className="h-3 w-3" aria-hidden="true" />
      Next day
    </span>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl bg-surface p-5 shadow-soft" aria-busy="true" aria-label="Loading shifts">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-5 flex-[2] rounded bg-background-deep" />
          <div className="h-5 flex-1 rounded bg-background-deep" />
          <div className="h-5 flex-1 rounded bg-background-deep" />
          <div className="h-5 flex-1 rounded bg-background-deep" />
        </div>
      ))}
    </div>
  )
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function Shifts() {
  const { user } = useAuth()
  const canManage = user?.role === 'owner'
  // { shift: null } = add, { shift } = edit
  const [editing, setEditing] = useState(null)

  const fetchShifts = useCallback(() => shiftsApi.list(), [])
  const { data: shifts, loading, error, reload } = useApi(fetchShifts)

  const closeForm = useCallback(() => setEditing(null), [])
  const afterSave = () => {
    setEditing(null)
    reload()
  }

  const addButton = canManage && (
    <Button icon={Plus} onClick={() => setEditing({ shift: null })}>
      Add shift
    </Button>
  )

  let content
  if (loading) {
    content = <TableSkeleton />
  } else if (error) {
    content = <ErrorState message={error} onRetry={reload} />
  } else if (shifts.length === 0) {
    content = (
      <EmptyState
        icon={Clock}
        title="No shifts yet"
        message="Add shifts like Morning, Evening or Full Day. Staff are marked late after the start time plus grace minutes."
        action={addButton}
      />
    )
  } else {
    content = (
      <>
        {/* Desktop / tablet table */}
        <div className="hidden overflow-hidden rounded-2xl bg-surface shadow-soft md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-syrup-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                <th scope="col" className="px-5 py-3 font-semibold">Start</th>
                <th scope="col" className="px-5 py-3 font-semibold">End</th>
                <th scope="col" className="px-5 py-3 font-semibold">Grace</th>
                <th scope="col" className="px-5 py-3 font-semibold">Employees</th>
                {canManage && <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shifts.map((s) => (
                <tr key={s._id} className="hover:bg-background/40">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-syrup-muted">{formatDuration(s.durationMinutes)}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">{formatTime12(s.startTime)}</td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    {formatTime12(s.endTime)}
                    {s.crossesMidnight && <NextDayBadge />}
                  </td>
                  <td className="px-5 py-3.5">{s.graceMinutes} min</td>
                  <td className="px-5 py-3.5">{s.employeeCount}</td>
                  {canManage && (
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing({ shift: s })}
                        className="rounded-lg p-2 text-syrup-muted hover:bg-background-deep hover:text-syrup"
                        aria-label={`Edit ${s.name}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="space-y-3 md:hidden">
          {shifts.map((s) => (
            <li key={s._id} className="rounded-2xl bg-surface p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="mt-0.5 text-sm">
                    {formatTime12(s.startTime)} – {formatTime12(s.endTime)}
                    {s.crossesMidnight && <NextDayBadge />}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing({ shift: s })}
                    className="rounded-lg p-2 text-syrup-muted hover:bg-background-deep"
                    aria-label={`Edit ${s.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-syrup-muted">
                {formatDuration(s.durationMinutes)} · {s.graceMinutes} min grace · {plural(s.employeeCount, 'employee')}
              </p>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Shifts"
        subtitle="Working hours and late-arrival grace for your staff"
        actions={!loading && !error && shifts.length > 0 && addButton}
      />
      {content}
      {editing && (
        <ShiftFormModal key={editing.shift?._id || 'new'} shift={editing.shift} onClose={closeForm} onSaved={afterSave} />
      )}
    </div>
  )
}
