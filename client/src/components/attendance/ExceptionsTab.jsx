import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Pencil } from 'lucide-react'
import EmptyState from '../EmptyState.jsx'
import ErrorState from '../ErrorState.jsx'
import FormField from '../FormField.jsx'
import SelectField from '../SelectField.jsx'
import StatusPill from './StatusPill.jsx'
import FlagBadges from './FlagBadges.jsx'
import PunchTime from './PunchTime.jsx'
import EditAttendanceModal from './EditAttendanceModal.jsx'
import { FLAG_OPTIONS } from './statuses.js'
import { attendanceApi } from '../../api/attendance.js'
import { AnimatePresence } from 'framer-motion'
import { useApi } from '../../hooks/useApi.js'
import { rowFadeIn, useFlash } from '../../hooks/useFlash.js'
import { formatDate } from '../../utils/format.js'
import { todayIST } from '../../utils/date.js'

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading exceptions">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-surface shadow-soft" />
      ))}
    </div>
  )
}

// Short, readable device description from a user-agent string
function describeDevice(device) {
  if (!device?.userAgent) return 'Unknown device'
  const ua = device.userAgent
  const model = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1]
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Other'
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [model || os, browser].filter(Boolean).join(' · ')
}

export default function ExceptionsTab({ params, setParams }) {
  const today = todayIST()
  const type = params.get('type') || ''
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const [editing, setEditing] = useState(null)

  const fetcher = useCallback(() => attendanceApi.exceptions({ type, from, to }), [type, from, to])
  const { data, loading, error, reload, refreshing } = useApi(fetcher)
  const [flashId, flash] = useFlash()

  const openEditor = (row) =>
    setEditing({
      attendanceId: row.attendanceId,
      employee: row.employee,
      date: row.date,
      shift: row.shift,
      punchIn: row.punchIn,
      punchOut: row.punchOut,
      manualStatus: row.manualStatus,
    })

  let content
  if (loading) content = <ListSkeleton />
  else if (error) content = <ErrorState message={error} onRetry={reload} />
  else if (data.rows.length === 0) {
    content = (
      <EmptyState
        icon={CircleCheck}
        title="Nothing needs attention"
        message={`No ${type ? FLAG_OPTIONS.find((f) => f.value === type)?.label.toLowerCase() : 'missing punch-outs, manual edits or new-device punches'} between ${formatDate(data.from)} and ${formatDate(data.to)}.`}
      />
    )
  } else {
    content = (
      <ul className="space-y-3">
        {data.rows.map((row, i) => {
          const mismatchDevice = row.flags.includes('device_mismatch') && (row.punchOutDevice ?? row.punchInDevice)
          return (
            <li
              key={row.attendanceId}
              className={`rounded-2xl bg-surface p-4 shadow-soft ${rowFadeIn(i).className} ${flashId === row.attendanceId ? 'flash-card' : ''}`}
              style={rowFadeIn(i).style}
              data-testid="exception-row"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/employees/${row.employee._id}`} className="font-semibold hover:text-primary-ink">
                      {row.employee.name}
                    </Link>
                    <span className="font-mono text-xs text-syrup-muted">#{row.employee.employeeCode}</span>
                    <span className="text-sm text-syrup-muted">· {formatDate(row.date)}</span>
                    <StatusPill status={row.status} />
                  </div>
                  <FlagBadges flags={row.flags} editReason={row.editReason} />
                  <p className="text-sm">
                    In <PunchTime iso={row.punchIn} recordDate={row.date} /> · Out <PunchTime iso={row.punchOut} recordDate={row.date} />
                  </p>
                  {row.flags.includes('manual_edit') && row.editReason && (
                    <p className="text-sm text-syrup-soft">
                      <span className="font-medium">Reason:</span> “{row.editReason}”
                      {row.editedBy && <span className="text-syrup-muted"> by {row.editedBy.name}</span>}
                    </p>
                  )}
                  {mismatchDevice && (
                    <p className="text-xs text-amber-ink" title={mismatchDevice.userAgent}>
                      Punched from: {describeDevice(mismatchDevice)}
                      {mismatchDevice.ip && <span className="text-syrup-muted"> · IP {mismatchDevice.ip}</span>}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openEditor(row)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl px-3 py-2 text-sm font-semibold text-syrup-soft ring-1 ring-border hover:bg-background-deep"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {row.flags.includes('missing_checkout') ? 'Fix' : 'Edit'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField label="Show" className="sm:w-52" value={type} onChange={(e) => setParams({ type: e.target.value })}>
          <option value="">All exceptions</option>
          {FLAG_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>
        <FormField label="From" name="from" type="date" max={to || today} value={from || data?.from || ''} onChange={(e) => setParams({ from: e.target.value })} />
        <FormField label="To" name="to" type="date" max={today} value={to || data?.to || ''} onChange={(e) => setParams({ to: e.target.value })} />
      </div>

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
              flash(editing.attendanceId)
              setEditing(null)
              reload()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
