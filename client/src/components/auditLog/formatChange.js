import { formatDate, formatDuration, formatRupees, formatTime12, WEEKDAYS } from '../../utils/format.js'
import { dateOfIST, formatDayMonthIST, formatTimeIST } from '../../utils/date.js'
import { STATUS_META } from '../attendance/statuses.js'
import { LEAVE_STATUSES, LEAVE_TYPES } from '../leaves/leaveMeta.js'
import { PAYROLL_STATUSES } from '../payroll/payrollMeta.js'

const FIELD_LABELS = {
  salary: {
    amountPaise: 'Salary amount',
    type: 'Salary type',
    overtimeMultiplier: 'Overtime multiplier',
    weeklyOff: 'Weekly off',
  },
  attendance: {
    punchIn: 'Punch in',
    punchOut: 'Punch out',
    status: 'Status',
    manualStatus: 'Marked status',
  },
  leave: {
    fromDate: 'From',
    toDate: 'To',
    type: 'Leave type',
    status: 'Status',
    reason: 'Reason',
  },
  employee: { isActive: 'Status' },
  department: { isActive: 'Status' },
  shift: {
    name: 'Name',
    startTime: 'Start',
    endTime: 'End',
    graceMinutes: 'Grace',
    crossesMidnight: 'Ends next day',
  },
  settings: {
    name: 'Shop name',
    halfDayThresholdMinutes: 'Half-day threshold',
    defaultGraceMinutes: 'Default grace',
    workingDaysPolicy: 'Working days',
    overtimeEnabled: 'Pay overtime',
    lateRuleEnabled: 'Late deduction',
    lateRuleEvery: 'Late days per half-day cut',
  },
  payroll: {
    status: 'Status',
    basePaise: 'Base pay',
    overtimePaise: 'Overtime',
    deductionsPaise: 'Deductions',
    bonusPaise: 'Bonus',
    advancePaise: 'Advance',
    netPaise: 'Net pay',
    paidDate: 'Paid on',
  },
}
const SALARY_TYPES = { monthly: 'Monthly', daily: 'Daily', hourly: 'Hourly' }

export function fieldLabel(entry, field) {
  return FIELD_LABELS[entry.category]?.[field] ?? field
}

// Raw audit values -> readable text. Money arrives in paise and becomes ₹ only here.
export function formatValue(entry, field, value) {
  if (value === null || value === undefined) return field === 'manualStatus' ? 'Automatic' : '—'
  if (entry.category === 'salary') {
    if (field === 'amountPaise') return formatRupees(value)
    if (field === 'type') return SALARY_TYPES[value] ?? value
    if (field === 'overtimeMultiplier') return `${value}×`
    if (field === 'weeklyOff') return value.length ? value.map((d) => WEEKDAYS[d]?.slice(0, 3)).join(', ') : 'None'
  }
  if (entry.category === 'attendance') {
    if (field === 'punchIn' || field === 'punchOut') {
      const otherDay = entry.attendanceDate && dateOfIST(value) !== entry.attendanceDate
      return `${formatTimeIST(value)}${otherDay ? `, ${formatDayMonthIST(value)}` : ''}`
    }
    if (field === 'status' || field === 'manualStatus') return STATUS_META[value]?.label ?? value
  }
  if (entry.category === 'leave') {
    if (field === 'fromDate' || field === 'toDate') return formatDate(value)
    if (field === 'type') return LEAVE_TYPES[value]?.label ?? value
    if (field === 'status') return LEAVE_STATUSES[value]?.label ?? value
  }
  if (field === 'isActive') {
    if (entry.category === 'department') return value ? 'Active' : 'Archived'
    return value ? 'Active' : 'Inactive'
  }
  if (entry.category === 'settings') {
    if (field === 'halfDayThresholdMinutes') return formatDuration(value)
    if (field === 'defaultGraceMinutes') return `${value} min`
    if (field === 'workingDaysPolicy') return value === 'fixed26' ? 'Fixed 26 days' : 'Actual days'
    if (field === 'overtimeEnabled' || field === 'lateRuleEnabled') return value ? 'On' : 'Off'
  }
  if (entry.category === 'payroll') {
    if (field.endsWith('Paise')) return formatRupees(value)
    if (field === 'status') return PAYROLL_STATUSES[value]?.label ?? value
    if (field === 'paidDate') return formatDate(value)
  }
  if (entry.category === 'shift') {
    if (field === 'startTime' || field === 'endTime') return formatTime12(value)
    if (field === 'graceMinutes') return `${value} min`
    if (field === 'crossesMidnight') return value ? 'Yes' : 'No'
  }
  return Array.isArray(value) ? value.join(', ') : String(value)
}
