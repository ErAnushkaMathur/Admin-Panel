import { toMinutes, shiftDurationMinutes } from './shift.service.js'
import { toIST, istToUtc, addDays } from '../utils/time.js'
import { leaveCoversDate } from './leave.service.js'

// A second punch this soon after punching in is treated as an accidental double tap, not a punch-out
export const MIN_MINUTES_BEFORE_PUNCH_OUT = 5
// An open record older than this is left for the missing-checkout job instead of being punched out
export const MAX_OPEN_SHIFT_HOURS = 16
// Device-mismatch flag compares against this many previous punches (in or out)
export const DEVICE_HISTORY_SIZE = 3

const MS_PER_MINUTE = 60 * 1000

/**
 * The attendance date a punch-in belongs to (SPEC 4.4: the date the shift started).
 * For a shift that crosses midnight (e.g. 22:00–06:00), punches in the early part of the
 * off-hours gap belong to the previous date. The gap is split at its midpoint (14:00 for
 * 22:00–06:00), so a late arrival at 00:10 counts for yesterday's shift while an early
 * arrival at 20:00 counts for today's.
 */
export function resolveShiftDate(now, shift) {
  const { date, minutes } = toIST(now)
  if (!shift.crossesMidnight) return date
  return minutes < offHoursMidpoint(shift) ? addDays(date, -1) : date
}

// Minutes-of-day splitting a midnight-crossing shift's off-hours gap (14:00 for 22:00–06:00)
function offHoursMidpoint(shift) {
  return (toMinutes(shift.endTime) + toMinutes(shift.startTime)) / 2
}

// SPEC 4.7: late if punched in after shiftStart + grace; lateMinutes counts from shift start
export function computeLateMinutes(punchIn, shiftDate, shift) {
  const minutesAfterStart = Math.floor((punchIn - istToUtc(shiftDate, shift.startTime)) / MS_PER_MINUTE)
  return minutesAfterStart > shift.graceMinutes ? minutesAfterStart : 0
}

export function punchInStatus(lateMinutes) {
  return lateMinutes > 0 ? 'late' : 'present'
}

export function computeWorkedMinutes(punchIn, punchOut) {
  return Math.max(0, Math.floor((punchOut - punchIn) / MS_PER_MINUTE))
}

export function computeOvertimeMinutes(workedMinutes, shift) {
  return Math.max(0, workedMinutes - shiftDurationMinutes(shift.startTime, shift.endTime))
}

export function minutesSince(earlier, now) {
  return (now - earlier) / MS_PER_MINUTE
}

export const DEFAULT_HALF_DAY_THRESHOLD_MINUTES = 240

// Final statuses. 'not_yet_in' is display-only (never stored): no punch but the shift hasn't ended.
export const STATUSES = ['present', 'late', 'half_day', 'on_leave', 'weekly_off', 'absent', 'not_yet_in']
// Statuses an owner/manager can set by hand in a manual edit
export const MANUAL_STATUSES = ['present', 'half_day', 'absent', 'on_leave', 'weekly_off']

// When the shift that started on `date` ends (next day for shifts crossing midnight)
export function shiftEndInstant(date, shift) {
  return istToUtc(shift.crossesMidnight ? addDays(date, 1) : date, shift.endTime)
}

// 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" calendar date
export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * SPEC 4.7 status rules, in order of precedence:
 *   1. manualStatus set by an owner/manager (manual edit) wins
 *   2. punched in: half_day if punched out with workedMinutes < halfDayThreshold,
 *      else late if punchIn > shiftStart + grace (lateMinutes from shift start), else present
 *      (an unfinished shift is never half_day; a punch on a leave/weekly-off day still counts as work)
 *   3. approved leave covers the date -> on_leave
 *   4. weekly off day -> weekly_off (never counted as absent)
 *   5. no punch: absent once the shift has ended, otherwise not_yet_in
 * Pure: everything it needs is passed in, including `now`.
 */
export function deriveStatus({
  date,
  shift,
  punchIn = null,
  punchOut = null,
  manualStatus = null,
  onApprovedLeave = false,
  isWeeklyOff = false,
  halfDayThresholdMinutes = DEFAULT_HALF_DAY_THRESHOLD_MINUTES,
  now,
}) {
  const lateMinutes = punchIn ? computeLateMinutes(punchIn, date, shift) : 0
  const workedMinutes = punchIn && punchOut ? computeWorkedMinutes(punchIn, punchOut) : 0
  const overtimeMinutes = punchIn && punchOut ? computeOvertimeMinutes(workedMinutes, shift) : 0
  const metrics = { lateMinutes, workedMinutes, overtimeMinutes }

  if (manualStatus) return { status: manualStatus, ...metrics, lateMinutes: manualStatus === 'late' ? lateMinutes : 0 }

  if (punchIn) {
    if (punchOut && workedMinutes < halfDayThresholdMinutes) return { status: 'half_day', ...metrics }
    return { status: lateMinutes > 0 ? 'late' : 'present', ...metrics }
  }

  if (onApprovedLeave) return { status: 'on_leave', ...metrics }
  if (isWeeklyOff) return { status: 'weekly_off', ...metrics }
  return { status: now >= shiftEndInstant(date, shift) ? 'absent' : 'not_yet_in', ...metrics }
}

/**
 * deriveStatus for one employee on one date, with or without an attendance record. Picks the shift
 * (the record's snapshot, else the employee's current shift) and works out approved leave and weekly
 * off. The Attendance views and payroll both call this, so they always agree on a day's status.
 * `leaves` are the employee's leave records (only approved ones count). No shift -> status null.
 */
export function deriveDayStatus({ date, record = null, shift = null, weeklyOff = [], leaves = [], halfDayThresholdMinutes, now }) {
  const dayShift = record?.shiftSnapshot?.startTime ? record.shiftSnapshot : shift
  if (!dayShift) return { status: null, lateMinutes: 0, workedMinutes: 0, overtimeMinutes: 0 }
  return deriveStatus({
    date,
    shift: dayShift,
    punchIn: record?.punchIn ?? null,
    punchOut: record?.punchOut ?? null,
    manualStatus: record?.manualStatus ?? null,
    onApprovedLeave: leaveCoversDate(leaves, date),
    isWeeklyOff: weeklyOff.includes(weekdayOf(date)),
    halfDayThresholdMinutes,
    now,
  })
}

/**
 * Manual edit times ("HH:mm", IST) -> instants for the record's date, read the same way punches are:
 * for a shift crossing midnight, a time before the off-hours midpoint is on the next day
 * (night shift 22:00–06:00: "00:10" = next day); a punch-out not after the punch-in is next day.
 * A time left undefined keeps the current value; null clears it.
 */
export function resolveEditedPunches(date, shift, { punchInTime, punchOutTime, currentPunchIn = null, currentPunchOut = null }) {
  const atShiftTime = (hhmm) => {
    const nextDay = shift.crossesMidnight && toMinutes(hhmm) < offHoursMidpoint(shift)
    return istToUtc(nextDay ? addDays(date, 1) : date, hhmm)
  }
  const punchIn = punchInTime === undefined ? currentPunchIn : punchInTime && atShiftTime(punchInTime)
  let punchOut = punchOutTime === undefined ? currentPunchOut : punchOutTime && atShiftTime(punchOutTime)
  if (punchOutTime && punchIn && punchOut <= punchIn) {
    punchOut = new Date(punchOut.getTime() + 24 * 60 * MS_PER_MINUTE)
  }
  return { punchIn: punchIn || null, punchOut: punchOut || null }
}

// Most recent punch events (newest first) from attendance records: [{ at, ip, userAgent }]
export function recentPunchDevices(records, limit = DEVICE_HISTORY_SIZE) {
  const events = []
  for (const r of records) {
    if (r.punchIn && r.punchInDevice) events.push({ at: new Date(r.punchIn), ...r.punchInDevice })
    if (r.punchOut && r.punchOutDevice) events.push({ at: new Date(r.punchOut), ...r.punchOutDevice })
  }
  return events.sort((a, b) => b.at - a.at).slice(0, limit)
}

// True when this ip + userAgent pair matches none of the recent punches.
// No history (first punch ever) -> nothing to compare against -> not a mismatch.
export function isDeviceMismatch(device, recentDevices) {
  if (recentDevices.length === 0) return false
  return !recentDevices.some((d) => d.ip === device.ip && d.userAgent === device.userAgent)
}
