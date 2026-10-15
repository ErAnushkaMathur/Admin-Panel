import { Routes, Route, Navigate } from 'react-router-dom'
import AuthProvider from './components/AuthProvider.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import PublicOnlyRoute from './components/PublicOnlyRoute.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
import NotFound from './pages/NotFound.jsx'
import Departments from './pages/Departments.jsx'
import Shifts from './pages/Shifts.jsx'
import Employees from './pages/Employees.jsx'
import EmployeeForm from './pages/EmployeeForm.jsx'
import EmployeeProfile from './pages/EmployeeProfile.jsx'
import Settings from './pages/Settings.jsx'
import Attendance from './pages/Attendance.jsx'
import AuditLog from './pages/AuditLog.jsx'
import Leaves from './pages/Leaves.jsx'
import Payroll from './pages/Payroll.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Analytics from './pages/Analytics.jsx'
import Payslip from './pages/Payslip.jsx'
import { NAV_ITEMS } from './utils/navItems.js'

// Built pages; every other sidebar link shows a placeholder
const PAGES = {
  '/dashboard': Dashboard,
  '/analytics': Analytics,
  '/employees': Employees,
  '/attendance': Attendance,
  '/audit-log': AuditLog,
  '/leaves': Leaves,
  '/payroll': Payroll,
  '/departments': Departments,
  '/shifts': Shifts,
  '/settings': Settings,
}

// Owner / manager app (everything except the public punch page)
export default function AdminApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          {/* Printable page without the sidebar/topbar */}
          <Route path="/payroll/:id/payslip" element={<Payslip />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            {NAV_ITEMS.map(({ to, label, phase }) => {
              const Page = PAGES[to]
              return (
                <Route key={to} path={to} element={Page ? <Page /> : <PlaceholderPage title={label} phase={phase} />} />
              )
            })}
            <Route path="/employees/new" element={<EmployeeForm />} />
            <Route path="/employees/:id" element={<EmployeeProfile />} />
            <Route path="/employees/:id/edit" element={<EmployeeForm />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
