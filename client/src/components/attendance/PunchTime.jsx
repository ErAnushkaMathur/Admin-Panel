import { dateOfIST, formatDayMonthIST, formatTimeIST } from '../../utils/date.js'

// "08:12 AM", with the day added when the punch falls on another date than the record (night shifts)
export default function PunchTime({ iso, recordDate }) {
  if (!iso) return <span className="text-syrup-muted">—</span>
  const otherDay = dateOfIST(iso) !== recordDate
  return (
    <span className="whitespace-nowrap">
      {formatTimeIST(iso)}
      {otherDay && <span className="ml-1 text-xs text-syrup-muted">({formatDayMonthIST(iso)})</span>}
    </span>
  )
}
