import { CalendarDays } from 'lucide-react'
import { todayIST } from '../../utils/date.js'

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// This month's calendar (IST) with weekly-off days marked. Attendance statuses are filled in
// once punching and attendance records exist (Phases 3–4).
export default function AttendanceCalendarPlaceholder({ weeklyOff = [] }) {
  const today = todayIST()
  const [y, m, d] = today.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  )

  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          Attendance
        </h2>
        <span className="text-sm text-syrup-muted">{monthLabel}</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs" role="grid" aria-label={`${monthLabel} calendar`}>
        {DAY_HEADERS.map((h, i) => (
          <div key={i} className="py-1 font-semibold text-syrup-muted" role="columnheader">
            {h}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />
          const weekday = (firstWeekday + day - 1) % 7
          const isOff = weeklyOff.includes(weekday)
          const isToday = day === d
          return (
            <div
              key={day}
              role="gridcell"
              className={`flex h-10 items-center justify-center rounded-lg text-sm sm:h-11 ${
                isToday ? 'bg-primary-strong font-semibold text-white' : isOff ? 'bg-background-deep text-syrup-muted' : 'bg-background/50 text-syrup-soft'
              }`}
              title={isOff ? 'Weekly off' : undefined}
            >
              {day}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-syrup-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary-strong" aria-hidden="true" /> Today
        </span>
        {weeklyOff.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-background-deep" aria-hidden="true" /> Weekly off
          </span>
        )}
      </div>
      <p className="mt-3 rounded-xl bg-background px-3 py-2 text-xs text-syrup-muted">
        Daily attendance (present, late, absent) will show here once staff start punching in.
      </p>
    </section>
  )
}
