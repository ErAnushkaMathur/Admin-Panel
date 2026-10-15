import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

export const SALARY_TYPES = ['monthly', 'daily', 'hourly']

const salarySchema = new mongoose.Schema(
  {
    type: { type: String, enum: SALARY_TYPES, required: true },
    // Money in paise (integer), golden rule 4
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'amountPaise must be an integer' },
    },
    overtimeMultiplier: { type: Number, required: true, min: 1, max: 3, default: 1.5 },
    // 0 = Sunday … 6 = Saturday
    weeklyOff: { type: [{ type: Number, min: 0, max: 6 }], default: [] },
  },
  { _id: false },
)

const employeeSchema = new mongoose.Schema(
  {
    // Short numeric code typed on the punch page, unique per business (see services/employeeCode.service.js)
    employeeCode: { type: String, required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // Normalized 10-digit Indian mobile number
    phone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    roleTitle: { type: String, required: true, trim: true, maxlength: 60 },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
    // Calendar date in IST, "YYYY-MM-DD" (same format as Attendance.date)
    joinDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Soft delete only (golden rule 6)
    isActive: { type: Boolean, default: true },
    // bcrypt hash of the 4-digit punch PIN; the PIN itself is never stored
    pinHash: { type: String, required: true, select: false },
    salary: { type: salarySchema, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.pinHash
        delete ret.__v
        return ret
      },
    },
  },
)

employeeSchema.plugin(tenantPlugin)
employeeSchema.index({ businessId: 1, employeeCode: 1 }, { unique: true })
employeeSchema.index({ businessId: 1, phone: 1 }, { unique: true })
employeeSchema.index({ businessId: 1, departmentId: 1, isActive: 1 })
employeeSchema.index({ businessId: 1, shiftId: 1, isActive: 1 })

export default mongoose.model('Employee', employeeSchema)
