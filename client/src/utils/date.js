export const BUSINESS_TZ = 'Asia/Kolkata'

// Today's date in IST as "YYYY-MM-DD" (display only; the server decides real dates)
export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(new Date())
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: true })
const hhmmFormat = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayMonthFormat = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short' })

// ISO instant -> "08:12 AM" in IST
export function formatTimeIST(iso) {
  return iso ? timeFormat.format(new Date(iso)).toUpperCase() : ''
}

// ISO instant -> "08:12" (24h, IST) for <input type="time">
export function toTimeInputIST(iso) {
  return iso ? hhmmFormat.format(new Date(iso)) : ''
}

// ISO instant -> "26 Sept" (IST), to show when a punch falls on another day
export function formatDayMonthIST(iso) {
  return iso ? dayMonthFormat.format(new Date(iso)) : ''
}

// ISO instant -> "YYYY-MM-DD" in IST
export function dateOfIST(iso) {
  return iso ? new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(new Date(iso)) : ''
}
