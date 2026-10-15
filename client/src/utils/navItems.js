import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarCheck,
  Clock,
  Wallet,
  CalendarOff,
  ChartColumn,
  History,
  Settings,
} from 'lucide-react'

// Sidebar order from SPEC 4.2. `phase` is when the real page is built (SPEC section 3).
// `ownerOnly` items are hidden from managers (the API enforces it too).
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, phase: 7 },
  { to: '/employees', label: 'Employees', icon: Users, phase: 2 },
  { to: '/departments', label: 'Departments', icon: Building2, phase: 2 },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, phase: 4 },
  { to: '/shifts', label: 'Shifts', icon: Clock, phase: 2 },
  { to: '/payroll', label: 'Payroll', icon: Wallet, phase: 6, ownerOnly: true },
  { to: '/leaves', label: 'Leave Management', icon: CalendarOff, phase: 5 },
  { to: '/analytics', label: 'Staff Analytics', icon: ChartColumn, phase: 8 },
  { to: '/audit-log', label: 'Audit Log', icon: History, phase: null, ownerOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, phase: null },
]
