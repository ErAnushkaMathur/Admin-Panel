import { cssVar } from '../../utils/theme.js'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

const SIZES = { sm: 'h-9 w-9 text-sm', lg: 'h-16 w-16 text-xl' }

// Initials tinted with the employee's department color
export default function EmployeeAvatar({ name, color = cssVar('primary'), size = 'sm' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
