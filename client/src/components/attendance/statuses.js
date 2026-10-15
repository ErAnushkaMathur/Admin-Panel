// Display config for statuses returned by the API (deriveStatus on the server)
export const STATUS_META = {
  present: { label: 'Present', short: 'P', pill: 'bg-present-tint text-present-ink', cell: 'bg-present-strong text-white' },
  late: { label: 'Late', short: 'L', pill: 'bg-late-tint text-late-ink', cell: 'bg-late text-syrup' },
  half_day: { label: 'Half day', short: 'H', pill: 'bg-half-tint text-half-ink', cell: 'bg-half-strong text-white' },
  absent: { label: 'Absent', short: 'A', pill: 'bg-absent-tint text-absent-ink', cell: 'bg-absent-strong text-white' },
  on_leave: { label: 'On leave', short: 'LV', pill: 'bg-leave-tint text-leave-ink', cell: 'bg-leave-strong text-white' },
  weekly_off: { label: 'Weekly off', short: 'WO', pill: 'bg-background-deep text-syrup-muted', cell: 'bg-background-deep text-syrup-muted' },
  not_yet_in: { label: 'Not yet in', short: '–', pill: 'bg-surface text-syrup-muted ring-1 ring-border', cell: 'bg-surface text-syrup-muted ring-1 ring-inset ring-border' },
}

// Order used for summary chips and filters
export const STATUS_ORDER = ['present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off', 'not_yet_in']

// What an owner/manager can mark by hand (must match MANUAL_STATUSES on the server)
export const MANUAL_STATUS_OPTIONS = ['present', 'half_day', 'absent', 'on_leave', 'weekly_off']

export const FLAG_OPTIONS = [
  { value: 'missing_checkout', label: 'Missing punch-out' },
  { value: 'manual_edit', label: 'Manual edits' },
  { value: 'device_mismatch', label: 'New device' },
]
