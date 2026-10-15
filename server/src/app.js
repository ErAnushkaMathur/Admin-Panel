import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import healthRoutes from './routes/health.routes.js'
import authRoutes from './routes/auth.routes.js'
import departmentRoutes from './routes/department.routes.js'
import shiftRoutes from './routes/shift.routes.js'
import employeeRoutes from './routes/employee.routes.js'
import punchRoutes from './routes/punch.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import attendanceRoutes from './routes/attendance.routes.js'
import auditLogRoutes from './routes/auditLog.routes.js'
import leaveRoutes from './routes/leave.routes.js'
import payrollRoutes from './routes/payroll.routes.js'
import dashboardRoutes from './routes/dashboard.routes.js'
import analyticsRoutes from './routes/analytics.routes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const app = express()

// So req.ip is the real client IP when running behind a proxy (see TRUST_PROXY in .env.example)
app.set('trust proxy', env.trustProxy)

app.use(helmet())
app.use(cors({ origin: env.clientOrigin, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.use('/health', healthRoutes)
app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/departments', departmentRoutes)
app.use('/api/shifts', shiftRoutes)
app.use('/api/employees', employeeRoutes)
app.use('/api/punch', punchRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/audit-logs', auditLogRoutes)
app.use('/api/leaves', leaveRoutes)
app.use('/api/payroll', payrollRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/analytics', analyticsRoutes)

app.use(notFound)
app.use(errorHandler)

export default app
