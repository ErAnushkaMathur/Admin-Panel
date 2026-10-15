import { STATUS_META } from './statuses.js'

export default function StatusPill({ status, lateMinutes = 0 }) {
  if (!status) return <span className="text-syrup-muted">—</span>
  const meta = STATUS_META[status] ?? { label: status, pill: 'bg-background-deep' }
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.pill}`}>
      {meta.label}
      {status === 'late' && lateMinutes > 0 && <span className="ml-1 font-normal">· {lateMinutes}m</span>}
    </span>
  )
}
