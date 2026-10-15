import { Link } from 'react-router-dom'
import {
  ArchiveRestore,
  Archive,
  ArrowRight,
  CalendarCheck2,
  CalendarPlus,
  CalendarX2,
  CalendarHeart,
  Clock,
  History,
  KeyRound,
  Lock,
  SlidersHorizontal,
  LockOpen,
  HandCoins,
  BadgeIndianRupee,
  PencilLine,
  QrCode,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react'
import { formatDate, formatDateRange } from '../../utils/format.js'
import { dateOfIST, formatTimeIST } from '../../utils/date.js'
import { fieldLabel, formatValue } from './formatChange.js'
import { LEAVE_TYPES } from '../leaves/leaveMeta.js'
import { rowFadeIn } from '../../hooks/useFlash.js'
import { monthLabel } from '../payroll/payrollMeta.js'

const ICONS = {
  'employee.salary_update': { icon: Wallet, className: 'bg-present-tint text-present-ink' },
  'attendance.manual_edit': { icon: PencilLine, className: 'bg-amber-tint text-amber-ink' },
  'attendance.manual_create': { icon: CalendarPlus, className: 'bg-leave-tint text-leave-ink' },
  'leave.approve': { icon: CalendarCheck2, className: 'bg-present-tint text-present-ink' },
  'leave.reject': { icon: CalendarX2, className: 'bg-primary-tint text-primary-ink' },
  'leave.owner_add': { icon: CalendarHeart, className: 'bg-leave-tint text-leave-ink' },
  'employee.pin_reset': { icon: KeyRound, className: 'bg-amber-tint text-amber-ink' },
  'employee.deactivate': { icon: UserX, className: 'bg-primary-tint text-primary-ink' },
  'employee.reactivate': { icon: UserCheck, className: 'bg-present-tint text-present-ink' },
  'department.archive': { icon: Archive, className: 'bg-primary-tint text-primary-ink' },
  'department.restore': { icon: ArchiveRestore, className: 'bg-present-tint text-present-ink' },
  'shift.update': { icon: Clock, className: 'bg-amber-tint text-amber-ink' },
  'settings.punch_link_regenerate': { icon: QrCode, className: 'bg-syrup text-background' },
  'settings.update': { icon: SlidersHorizontal, className: 'bg-syrup text-background' },
  'account.password_change': { icon: KeyRound, className: 'bg-amber-tint text-amber-ink' },
  'payroll.adjust': { icon: HandCoins, className: 'bg-amber-tint text-amber-ink' },
  'payroll.finalize': { icon: Lock, className: 'bg-leave-tint text-leave-ink' },
  'payroll.reopen': { icon: LockOpen, className: 'bg-primary-tint text-primary-ink' },
  'payroll.mark_paid': { icon: BadgeIndianRupee, className: 'bg-present-tint text-present-ink' },
}
const ROLE_LABELS = { owner: 'Owner', manager: 'Manager' }
const TARGET_KINDS = { department: 'department', shift: 'shift', business: 'shop', user: 'account' }
// Entries that deliberately store no values (secrets are never logged)
const NO_VALUES_NOTE = {
  'employee.pin_reset': 'A new PIN was issued. PINs are never stored in the log.',
  'settings.punch_link_regenerate': 'The old QR code and punch link stopped working. Links are never stored in the log.',
  'account.password_change': 'Other sessions were signed out. Passwords are never stored in the log.',
}

export default function AuditEntry({ entry, index = 0 }) {
  const { icon: Icon, className } = ICONS[entry.action] ?? { icon: History, className: 'bg-background-deep text-syrup-soft' }
  return (
    <li
      className={`rounded-2xl bg-surface p-4 shadow-soft sm:p-5 ${rowFadeIn(index).className}`}
      style={rowFadeIn(index).style}
      data-testid="audit-entry"
      data-action={entry.action}
    >
      <div className="flex gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${className}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <p className="font-semibold">
              {entry.actionLabel}
              {entry.employee ? (
                <>
                  {' · '}
                  <Link to={`/employees/${entry.employee._id}`} className="hover:text-primary-ink">
                    {entry.employee.name}
                  </Link>{' '}
                  <span className="font-mono text-xs font-normal text-syrup-muted">#{entry.employee.employeeCode}</span>
                </>
              ) : entry.target ? (
                <>
                  {' · '}
                  {entry.target.name}
                  {entry.target.kind !== 'business' && (
                    <span className="font-normal text-syrup-muted"> {TARGET_KINDS[entry.target.kind] ?? entry.target.kind}</span>
                  )}
                </>
              ) : (
                <span className="font-normal text-syrup-muted"> · record no longer exists</span>
              )}
              {entry.payrollMonth && <span className="font-normal text-syrup-muted"> · {monthLabel(entry.payrollMonth)} salary</span>}
              {entry.attendanceDate && <span className="font-normal text-syrup-muted"> · for {formatDate(entry.attendanceDate)}</span>}
              {entry.leave && (
                <span className="font-normal text-syrup-muted">
                  {' · '}
                  {formatDateRange(entry.leave.fromDate, entry.leave.toDate)} ({LEAVE_TYPES[entry.leave.type]?.label.toLowerCase() ?? entry.leave.type})
                </span>
              )}
            </p>
            <time dateTime={entry.at} className="shrink-0 text-xs text-syrup-muted">
              {formatDate(dateOfIST(entry.at))}, {formatTimeIST(entry.at)}
            </time>
          </div>
          <p className="text-sm text-syrup-muted">
            by <span className="font-medium text-syrup">{entry.actor?.name ?? 'Unknown user'}</span>
            {entry.actor && ` (${ROLE_LABELS[entry.actor.role] ?? entry.actor.role})`}
          </p>

          {entry.reason && (
            <p className="mt-2 rounded-xl bg-background px-3 py-2 text-sm">
              <span className="font-medium">Reason:</span> “{entry.reason}”
            </p>
          )}

          {entry.changes.length === 0 && NO_VALUES_NOTE[entry.action] && (
            <p className="mt-2 text-sm text-syrup-muted">{NO_VALUES_NOTE[entry.action]}</p>
          )}

          {entry.changes.length > 0 && (
            <dl className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
              {entry.changes.map((c) => (
                <div key={c.field} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr] sm:items-center">
                  <dt className="text-xs font-medium uppercase tracking-wide text-syrup-muted">{fieldLabel(entry, c.field)}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className={`text-syrup-muted ${c.before === null ? '' : 'line-through decoration-syrup-faint'}`} aria-label="before">
                      {formatValue(entry, c.field, c.before)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-syrup-faint" aria-hidden="true" />
                    <span className="font-semibold" aria-label="after">
                      {formatValue(entry, c.field, c.after)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  )
}
