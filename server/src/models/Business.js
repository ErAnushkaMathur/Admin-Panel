import mongoose from 'mongoose'
import { generatePunchToken } from '../utils/token.js'
import { WORKING_DAYS_POLICIES } from '../services/payroll.service.js'

const businessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Fixed: all date logic is IST calendar days (golden rules 3 and 11); shown read-only in Settings
    timezone: { type: String, default: 'Asia/Kolkata', enum: ['Asia/Kolkata'] },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    // Secret part of the public punch URL / QR. Regenerating it invalidates old QR codes.
    // Businesses created before this field existed get one on first visit to Settings.
    punchToken: { type: String, default: generatePunchToken },
    // SPEC 4.12 settings used by attendance (edited on the Settings page)
    attendanceSettings: {
      // Worked less than this (after punching out) = half day
      halfDayThresholdMinutes: { type: Number, default: 240, min: 0, max: 1440 },
      // Grace for new shifts when none is given (each shift keeps its own value)
      defaultGraceMinutes: { type: Number, default: 10, min: 0, max: 180 },
    },
    // SPEC 4.9 settings used by payroll (edited on the Settings page)
    payrollSettings: {
      // Monthly salary ÷ working days = one day's pay. 'actual' = days in month minus weekly offs
      workingDaysPolicy: { type: String, enum: WORKING_DAYS_POLICIES, default: 'actual' },
      overtimeEnabled: { type: Boolean, default: true },
      // Every `lateRuleEvery` late days = a half-day cut, when lateRuleEnabled
      lateRuleEnabled: { type: Boolean, default: false },
      lateRuleEvery: { type: Number, default: 3, min: 1, max: 31 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v
        // Only exposed through the settings endpoint
        delete ret.punchToken
        return ret
      },
    },
  },
)

businessSchema.index({ punchToken: 1 }, { unique: true, sparse: true })

export default mongoose.model('Business', businessSchema)
