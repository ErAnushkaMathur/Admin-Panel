import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Pencil, Plus, SearchX } from 'lucide-react'
import EmptyState from '../EmptyState.jsx'
import ErrorState from '../ErrorState.jsx'
import FormField from '../FormField.jsx'
import SelectField from '../SelectField.jsx'
import Button from '../Button.jsx'
import EmployeeAvatar from '../employees/EmployeeAvatar.jsx'
import StatusPill from './StatusPill.jsx'
import FlagBadges from './FlagBadges.jsx'
import PunchTime from './PunchTime.jsx'
import EditAttendanceModal from './EditAttendanceModal.jsx'
import { STATUS_META, STATUS_ORDER } from './statuses.js'
import { attendanceApi } from '../../api/attendance.js'
import { AnimatePresence } from 'framer-motion'
import { useApi } from '../../hooks/useApi.js'
import { rowFadeIn, useFlash } from '../../hooks/useFlash.js'
import { formatDuration, formatTime12 } from '../../utils/format.js'
import { todayIST } from '../../utils/date.js'

const REFRESH_MS = 60 * 1000

function Skeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface p-5 shadow-soft" aria-busy="true" aria-label="Loading attendance">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
          <div className="h-9 w-9 rounded-full bg-background-deep" />
          <div className="h-4 flex-[2] rounded bg-background-deep" />
          <div className="hidden h-4 flex-1 rounded bg-background-deep md:block" />
          <div className="h-5 w-20 rounded-full bg-background-deep" />
        </div>
      ))}
    </div>
  )
}

function worked(row) {
  if (row.punchIn && !row.punchOut) return <span className="text-xs text-syrup-muted">{row.flags.includes('missing_checkout') ? '—' : 'In progress'}</span>
  return row.workedMinutes ? formatDuration(row.workedMinutes) : <span className="text-syrup-muted">—</span>
}

export default function TodayTab({ params, setParams, departments }) {
  const today = todayIST()
  const date = params.get('date') || today
  const departmentId = params.get('dept') || ''
  const status = params.get('status') || ''
  const [editing, setEditing] = useState(null)

  const fetcher = useCallback(() => attendanceApi.today({ date, departmentId, status }), [date, departmentId, status])
  const { data, loading, error, reload, refreshing } = useApi(fetcher)
  const [flashId, flash] = useFlash()

  // "Live" table: refresh every minute while looking at today
  useEffect(() => {
    if (date !== today) return
    const id = setInterval(() => document.visibilityState === 'visible' && reload(), REFRESH_MS)
    return () => clearInterval(id)
  }, [date, today, reload])

  const openEditor = (row) =>
    setEditing({
      attendanceId: row.attendanceId,
      employee: row.employee,
      date: row.date,
      shift: row.employee.shift,
      punchIn: row.punchIn,
      punchOut: row.punchOut,
      manualStatus: row.manualStatus,
    })

  let content
  if (loading) content = <Skeleton />
  else if (error) content = <ErrorState message={error} onRetry={reload} />
  else if (data.summary.total === 0) {
    content = (
      <EmptyState
        icon={CalendarCheck}
        title="No staff to show"
        message="Add employees first; their daily attendance appears here."
        action={
          <Link to="/employees/new" className="rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-strong">
            Add employee
          </Link>
        }
      />
    )
  } else if (data.rows.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="Nobody with this status"
        action={
          <Button variant="secondary" onClick={() => setParams({ status: '' })}>
            Show everyone
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        <div className="hidden overflow-x-auto rounded-2xl bg-surface shadow-soft lg:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-syrup-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Employee</th>
                <th scope="col" className="px-4 py-3 font-semibold">Shift</th>
                <th scope="col" className="px-4 py-3 font-semibold">In</th>
                <th scope="col" className="px-4 py-3 font-semibold">Out</th>
                <th scope="col" className="px-4 py-3 font-semibold">Worked</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((row, i) => (
                <tr
                  key={row.employee._id}
                  className={`transition-colors hover:bg-background/40 ${rowFadeIn(i).className} ${flashId === row.employee._id ? 'flash-row' : ''}`}
                  style={rowFadeIn(i).style}
                  data-testid="attendance-row"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={row.employee.name} color={row.employee.department?.color} />
                      <div className="min-w-0">
                        <Link to={`/employees/${row.employee._id}`} className="font-semibold hover:text-primary-ink">
                          {row.employee.name}
                        </Link>
                        <p className="text-xs text-syrup-muted">
                          <span className="font-mono">#{row.employee.employeeCode}</span>
                          {row.employee.department && ` · ${row.employee.department.name}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.employee.shift ? (
                      <>
                        <span className="block text-sm">{row.employee.shift.name}</span>
                        {formatTime12(row.employee.shift.startTime)} – {formatTime12(row.employee.shift.endTime)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3"><PunchTime iso={row.punchIn} recordDate={row.date} /></td>
                  <td className="px-4 py-3"><PunchTime iso={row.punchOut} recordDate={row.date} /></td>
                  <td className="px-4 py-3">{worked(row)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={row.status} lateMinutes={row.lateMinutes} />
                      <FlagBadges flags={row.flags} editReason={row.editReason} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditor(row)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-syrup-muted hover:bg-background-deep hover:text-syrup"
                      aria-label={`${row.attendanceId ? 'Edit' : 'Add'} attendance for ${row.employee.name}`}
                    >
                      {row.attendanceId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {row.attendanceId ? 'Edit' : 'Add'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 lg:hidden">
          {data.rows.map((row, i) => (
            <li
              key={row.employee._id}
              className={`rounded-2xl bg-surface p-4 shadow-soft ${rowFadeIn(i).className} ${flashId === row.employee._id ? 'flash-card' : ''}`}
              style={rowFadeIn(i).style}
              data-testid="attendance-card"
            >
              <div className="flex items-start gap-3">
                <EmployeeAvatar name={row.employee.name} color={row.employee.department?.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/employees/${row.employee._id}`} className="truncate font-semibold">
                      {row.employee.name}
                    </Link>
                    <StatusPill status={row.status} lateMinutes={row.lateMinutes} />
                  </div>
                  <p className="text-xs text-syrup-muted">
                    <span className="font-mono">#{row.employee.employeeCode}</span>
                    {row.employee.shift && ` · ${row.employee.shift.name}`}
                  </p>
                  <p className="mt-1.5 text-sm">
                    In <PunchTime iso={row.punchIn} recordDate={row.date} /> · Out <PunchTime iso={row.punchOut} recordDate={row.date} />
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <FlagBadges flags={row.flags} editReason={row.editReason} />
                    <button
                      type="button"
                      onClick={() => openEditor(row)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-syrup-muted hover:bg-background-deep"
                    >
                      {row.attendanceId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {row.attendanceId ? 'Edit' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField
          label="Date"
          name="date"
          type="date"
          max={today}
          value={date}
          onChange={(e) => setParams({ date: e.target.value && e.target.value !== today ? e.target.value : '' })}
        />
        <SelectField label="Department" className="sm:w-52" value={departmentId} onChange={(e) => setParams({ dept: e.target.value })}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" className="sm:w-44" value={status} onChange={(e) => setParams({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </SelectField>
      </div>

      {data && !error && (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Summary">
          {STATUS_ORDER.filter((s) => data.summary[s] > 0).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParams({ status: status === s ? '' : s })}
              aria-pressed={status === s}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${STATUS_META[s].pill} ${
                status === s ? 'ring-2 ring-syrup' : 'hover:opacity-80'
              }`}
            >
              {STATUS_META[s].label} {data.summary[s]}
            </button>
          ))}
          <span className="self-center text-xs text-syrup-muted">of {data.summary.total} staff</span>
        </div>
      )}

      <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        {content}
      </div>

      <AnimatePresence>
        {editing && (
          <EditAttendanceModal
            key="edit"
            row={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              flash(editing.employee._id)
              setEditing(null)
              reload()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
