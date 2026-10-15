// "HH:mm" (24h, shop time) -> "8:05 AM"
export function formatTime12(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

const rupeeWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const rupeeFraction = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

// Money is stored in paise (golden rule 4); this is where it becomes ₹.
// 1800000 -> "₹18,000", 1800050 -> "₹18,000.50"
export function formatRupees(paise) {
  if (paise == null) return ''
  return (paise % 100 ? rupeeFraction : rupeeWhole).format(paise / 100)
}

// "2026-04-01" -> "1 Apr 2026" (calendar date, no timezone shift)
export function formatDate(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

// Inclusive date range: "1 Oct 2026", "1 – 3 Oct 2026", "30 Sept – 2 Oct 2026"
export function formatDateRange(fromYmd, toYmd) {
  if (!toYmd || fromYmd === toYmd) return formatDate(fromYmd)
  const sameYear = fromYmd.slice(0, 4) === toYmd.slice(0, 4)
  const sameMonth = sameYear && fromYmd.slice(5, 7) === toYmd.slice(5, 7)
  const [y, m, d] = fromYmd.split('-').map(Number)
  const start = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    ...(!sameMonth && { month: 'short' }),
    ...(!sameYear && { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
  return `${start} – ${formatDate(toYmd)}`
}

export const WEEKDAYS =['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// 510 -> "8h 30m"
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}
