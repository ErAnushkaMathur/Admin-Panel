import { ClockAlert, PencilLine, ShieldAlert } from 'lucide-react'

const FLAGS = {
  device_mismatch: {
    label: 'New device',
    icon: ShieldAlert,
    className: 'bg-amber-tint text-amber-ink ring-1 ring-amber/40',
    title: 'Punched from a phone/browser not used in this employee’s last 3 punches. The punch was allowed; check it was really them.',
  },
  missing_checkout: {
    label: 'No punch-out',
    icon: ClockAlert,
    className: 'bg-primary-tint text-primary-ink',
    title: 'Punched in but never punched out. Hours are not counted until fixed.',
  },
  manual_edit: {
    label: 'Edited',
    icon: PencilLine,
    className: 'bg-background-deep text-syrup-soft',
    title: 'Changed by hand',
  },
}

// Small badges for attendance flags. `editReason` becomes the tooltip of the Edited badge.
export default function FlagBadges({ flags = [], editReason, only }) {
  const shown = flags.filter((f) => FLAGS[f] && (!only || only.includes(f)))
  if (shown.length === 0) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((f) => {
        const { label, icon: Icon, className, title } = FLAGS[f]
        const tip = f === 'manual_edit' && editReason ? `Edited: ${editReason}` : title
        return (
          <span
            key={f}
            title={tip}
            data-flag={f}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${className}`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
            <span className="sr-only">: {tip}</span>
          </span>
        )
      })}
    </span>
  )
}
