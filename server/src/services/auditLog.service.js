// Every action written to AuditLog, with the label the Audit Log page shows.
// Add new actions here when a feature starts writing audit entries.
export const AUDIT_ACTIONS = {
  'employee.salary_update': { label: 'Salary change', category: 'salary' },
  'attendance.manual_edit': { label: 'Attendance edit', category: 'attendance' },
  'attendance.manual_create': { label: 'Attendance added', category: 'attendance' },
  'leave.approve': { label: 'Leave approved', category: 'leave' },
  'leave.reject': { label: 'Leave rejected', category: 'leave' },
  'leave.owner_add': { label: 'Leave added by owner', category: 'leave' },
  'employee.pin_reset': { label: 'PIN reset', category: 'employee' },
  'employee.deactivate': { label: 'Employee deactivated', category: 'employee' },
  'employee.reactivate': { label: 'Employee reactivated', category: 'employee' },
  'department.archive': { label: 'Department archived', category: 'department' },
  'department.restore': { label: 'Department restored', category: 'department' },
  'shift.update': { label: 'Shift edited', category: 'shift' },
  'settings.punch_link_regenerate': { label: 'Punch QR regenerated', category: 'settings' },
  'settings.update': { label: 'Shop settings changed', category: 'settings' },
  'account.password_change': { label: 'Password changed', category: 'account' },
  'payroll.adjust': { label: 'Bonus / advance changed', category: 'payroll' },
  'payroll.finalize': { label: 'Payroll finalized', category: 'payroll' },
  'payroll.reopen': { label: 'Payroll reopened', category: 'payroll' },
  'payroll.mark_paid': { label: 'Salary marked paid', category: 'payroll' },
}

export function actionLabel(action) {
  return AUDIT_ACTIONS[action]?.label ?? action
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
const normalize = (v) => (v === undefined ? null : v instanceof Date ? v.toISOString() : v)

/**
 * Field-by-field differences between an entry's `before` and `after` snapshots.
 * Values stay raw (money in paise, times as ISO) so the UI formats them (golden rule 4).
 * A missing side (e.g. `before` of a create) counts as null. Pure.
 * -> [{ field, before, after }] for fields whose value changed, in a stable order.
 */
export function diffChanges(before, after) {
  const b = isPlainObject(before) ? before : {}
  const a = isPlainObject(after) ? after : {}
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])]
  return fields
    .map((field) => ({ field, before: normalize(b[field]), after: normalize(a[field]) }))
    .filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after))
}
