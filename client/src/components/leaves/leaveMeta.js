// Display config for leave types and statuses (values match the server's Leave model)
export const LEAVE_TYPES = {
  paid: { label: 'Paid', pill: 'bg-present-tint text-present-ink', hint: 'Counted as a paid day' },
  unpaid: { label: 'Unpaid', pill: 'bg-background-deep text-syrup-soft', hint: 'Deducted from salary' },
  sick: { label: 'Sick', pill: 'bg-leave-tint text-leave-ink', hint: 'Sick leave' },
}

export const LEAVE_STATUSES = {
  pending: { label: 'Pending', pill: 'bg-amber-tint text-amber-ink' },
  approved: { label: 'Approved', pill: 'bg-present-tint text-present-ink' },
  rejected: { label: 'Rejected', pill: 'bg-primary-tint text-primary-ink' },
}

export const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]
