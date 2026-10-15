import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import EmptyState from '../EmptyState.jsx'
import ErrorState from '../ErrorState.jsx'
import SelectField from '../SelectField.jsx'
import Alert from '../Alert.jsx'
import EditAttendanceModal from './EditAttendanceModal.jsx'
import { STATUS_META } from './statuses.js'
import { attendanceApi } from '../../api/attendance.js'
import { getErrorMessage } from '../../api/client.js'
import { AnimatePresence } from 'framer-motion'
import { useApi } from '../../hooks/useApi.js'
import { rowFadeIn, useFlash } from '../../hooks/useFlash.js'
import { todayIST } from '../../utils/date.js'

const TOTAL_COLUMNS = ['present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off']
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

function GridSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-2xl bg-surface p-5 shadow-soft" aria-busy="true" aria-label="Loading monthly attendance">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-1">
          <div className="h-7 w-36 rounded bg-background-deep" />
          {Array.from({ length: 20 }).map((__, j) => (
            <div key={j} className="h-7 w-7 rounded bg-background-deep" />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function MonthlyTab({ params, setParams, departments }) {
  const currentMonth = todayIST().slice(0, 7)
  const month = params.get('month') || currentMonth
  const departmentId = params.get('dept') || ''
  const [editing, setEditing] = useState(null)
  const [opening, setOpening] = useState(null)
  const [openError, setOpenError] = useState('')

  const fetcher = useCallback(() => attendanceApi.monthly({ month, departmentId }), [month, departmentId])
  const { data, loading, error, reload, refreshing } = useApi(fetcher)
  const [flashId, flash] = useFlash()
  const setMonth = (m) => setParams({ month: m === currentMonth ? '' : m })

  // The grid only has statuses; load that day's row to prefill the editor with punch times
  async function openCell(employee, date) {
    setOpening(`${employee._id}|${date}`)
    setOpenError('')
    try {
      const day = await attendanceApi.today({ date })
      const row = day.rows.find((r) => r.employee._id === employee._id)
      if (!row) throw new Error('Employee not found for this date')
      setEditing({
        attendanceId: row.attendanceId,
        employee: row.employee,
        date,
        shift: row.employee.shift,
        punchIn: row.punchIn,
        punchOut: row.punchOut,
        manualStatus: row.manualStatus,
      })
    } catch (err) {
      setOpenError(getErrorMessage(err))
    } finally {
      setOpening(null)
    }
  }

  let content
  if (loading) content = <GridSkeleton />
  else if (error) content = <ErrorState message={error} onRetry={reload} />
  else if (data.employees.length === 0) {
    content = <EmptyState icon={CalendarDays} title="No staff this month" message="Nobody was employed in this month, or the filter hides everyone." />
  } else {
    content = (
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-soft" role="region" aria-label={`Attendance for ${monthLabel(month)}`} tabIndex={0}>
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-36 border-b border-border bg-surface px-3 py-2 text-left font-semibold">
                Employee
              </th>
              {data.days.map((d) => {
                const dayNum = Number(d.slice(8))
                const weekday = new Date(`${d}T00:00:00Z`).getUTCDay()
                return (
                  <th
                    key={d}
                    scope="col"
                    className={`w-[26px] min-w-[26px] border-b border-border px-px py-2 text-center font-medium ${d === data.today ? 'text-primary-ink' : 'text-syrup-muted'}`}
                  >
                    <span className="block text-[10px] font-normal">{WEEKDAY_INITIAL[weekday]}</span>
                    {dayNum}
                  </th>
                )
              })}
              {TOTAL_COLUMNS.map((k) => (
                <th key={k} scope="col" title={STATUS_META[k].label} className="border-b border-l border-border px-1.5 py-2 text-center font-semibold">
                  {STATUS_META[k].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.employees.map(({ employee, days, totals }, rowIndex) => (
              <tr key={employee._id} className={`transition-colors hover:bg-background/40 ${rowFadeIn(rowIndex).className}`} style={rowFadeIn(rowIndex).style}>
                <th scope="row" className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-1.5 text-left font-normal">
                  <Link to={`/employees/${employee._id}`} className="block max-w-36 truncate text-sm font-semibold hover:text-primary-ink">
                    {employee.name}
                  </Link>
                  <span className="font-mono text-syrup-muted">#{employee.employeeCode}</span>
                </th>
                {days.map((cell, i) => {
                  const date = data.days[i]
                  if (!cell) {
                    return (
                      <td key={date} className="border-b border-border px-px py-1.5">
                        <span className="inline-block h-6 w-6" aria-hidden="true" />
                      </td>
                    )
                  }
                  const meta = STATUS_META[cell.status]
                  const flagged = cell.flags.length > 0
                  const busy = opening === `${employee._id}|${date}`
                  return (
                    <td key={date} className={`border-b border-border px-px py-1.5 text-center ${flashId === `${employee._id}|${date}` ? 'flash-cell' : ''}`}>
                      <button
                        type="button"
                        onClick={() => openCell(employee, date)}
                        disabled={busy}
                        title={`${employee.name}, ${date}: ${meta?.label ?? cell.status}${flagged ? ` (${cell.flags.join(', ')})` : ''}`}
                        className={`relative inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-syrup disabled:opacity-50 ${meta?.cell ?? ''}`}
                      >
                        {meta?.short ?? '?'}
                        {flagged && (
                          <span
                            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-surface ${
                              cell.flags.includes('device_mismatch') ? 'bg-amber' : 'bg-syrup'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </td>
                  )
                })}
                {TOTAL_COLUMNS.map((k) => (
                  <td key={k} className="border-b border-l border-border px-1.5 py-1.5 text-center text-sm font-semibold">
                    {totals[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="rounded-xl border border-border bg-surface p-2.5 hover:bg-background-deep"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <label htmlFor="attendance-month" className="mb-1.5 block text-sm font-medium">
              Month
            </label>
            <input
              id="attendance-month"
              type="month"
              value={month}
              max={currentMonth}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth}
            className="rounded-xl border border-border bg-surface p-2.5 hover:bg-background-deep disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <SelectField label="Department" className="sm:w-52" value={departmentId} onChange={(e) => setParams({ dept: e.target.value })}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </SelectField>
      </div>

      {openError && (
        <div className="mb-3">
          <Alert>{openError}</Alert>
        </div>
      )}

      <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        {content}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-syrup-muted" aria-label="Legend">
        {['present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off', 'not_yet_in'].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${STATUS_META[s].cell}`}>
              {STATUS_META[s].short}
            </span>
            {STATUS_META[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber" /> New device
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-syrup" /> Edited / missing punch-out
        </span>
      </div>

      <AnimatePresence>
        {editing && (
          <EditAttendanceModal
            key="edit"
            row={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              flash(`${editing.employee._id}|${editing.date}`)
              setEditing(null)
              reload()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
