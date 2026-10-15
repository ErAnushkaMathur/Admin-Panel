import { ChefHat, Store, Sparkles, Bike, Package, CakeSlice, Coffee, Users } from 'lucide-react'
import { themeColor } from './theme.js'

// Keys must match DEPARTMENT_ICONS in server/src/models/Department.js
export const DEPARTMENT_ICONS = {
  'chef-hat': { icon: ChefHat, label: 'Kitchen' },
  store: { icon: Store, label: 'Counter' },
  sparkles: { icon: Sparkles, label: 'Cleaning' },
  bike: { icon: Bike, label: 'Delivery' },
  package: { icon: Package, label: 'Packing' },
  'cake-slice': { icon: CakeSlice, label: 'Bakery' },
  coffee: { icon: Coffee, label: 'Cafe' },
  users: { icon: Users, label: 'General' },
}

// Department colour choices come from the palette. The `-ink` steps are used because a department's
// colour also appears as text (avatar initials, icons) on its light tint, so it must pass AA.
// The value saved on the department is the token's hex, read at runtime (the server stores hex).
const DEPARTMENT_COLOR_TOKENS = [
  { token: 'primary-ink', label: 'Rose' },
  { token: 'secondary-ink', label: 'Teal' },
  { token: 'amber-ink', label: 'Amber' },
  { token: 'leave-ink', label: 'Indigo' },
  { token: 'half-ink', label: 'Plum' },
  { token: 'absent-ink', label: 'Red' },
  { token: 'syrup-muted', label: 'Brown' },
]

export function departmentColors() {
  return DEPARTMENT_COLOR_TOKENS.map(({ token, label }) => ({ value: themeColor(token).toLowerCase(), label }))
}

export function getDepartmentIcon(key) {
  return (DEPARTMENT_ICONS[key] || DEPARTMENT_ICONS.users).icon
}
