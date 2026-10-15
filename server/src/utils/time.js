export const BUSINESS_TZ = 'Asia/Kolkata'
// Asia/Kolkata is UTC+05:30 all year (no daylight saving), so a fixed offset is exact
const IST_OFFSET_MS = 330 * 60 * 1000

// Today's calendar date in IST as "YYYY-MM-DD" (the format Attendance.date uses)
export function todayIST(now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(now)
}

// UTC instant -> IST calendar date and minutes since IST midnight
export function toIST(instant) {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS)
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

// IST wall-clock ("YYYY-MM-DD", "HH:mm") -> UTC instant
export function istToUtc(ymd, hhmm = '00:00') {
  const [y, m, d] = ymd.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, h, min) - IST_OFFSET_MS)
}

// "2026-03-01", -1 -> "2026-02-28"
export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// UTC instant -> "08:12 AM" in IST
export function formatTimeIST(instant) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: true })
    .format(instant)
    .toUpperCase()
}
