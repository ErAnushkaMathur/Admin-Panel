import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'
import { PAYROLL_STATUSES } from '../services/payroll.service.js'

const paise = {
  type: Number,
  default: 0,
  min: 0,
  validate: { validator: Number.isInteger, message: 'Money must be whole paise' },
}

// A finalized result that was reopened. Kept so an issued payslip is never lost (golden rule 5).
const revisionSchema = new mongoose.Schema(
  {
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    finalizedAt: Date,
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reopenedAt: { type: Date, required: true },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reopenReason: { type: String, required: true },
  },
  { _id: false },
)

// One employee's pay for one month (SPEC section 2 / 4.9)
const payrollSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    status: { type: String, enum: PAYROLL_STATUSES, default: 'draft' },
    // Output of calculatePayroll(). Recalculated while draft; frozen once finalized (golden rule 5).
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    // Who the payslip is for, as at the last calculation (frozen with the snapshot)
    employee: {
      name: String,
      employeeCode: String,
      roleTitle: String,
      departmentName: String,
    },
    // Entered by the owner on a draft; fed into calculatePayroll
    bonusPaise: paise,
    advancePaise: paise,
    calculatedAt: { type: Date, required: true },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // IST calendar day the salary was handed over
    paidDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revisions: { type: [revisionSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v
        return ret
      },
    },
  },
)

payrollSchema.plugin(tenantPlugin)
payrollSchema.index({ businessId: 1, month: 1, employeeId: 1 }, { unique: true })
payrollSchema.index({ businessId: 1, employeeId: 1, month: -1 })

export default mongoose.model('Payroll', payrollSchema)
