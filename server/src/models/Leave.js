import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'
import { LEAVE_TYPES, LEAVE_STATUSES } from '../services/leave.service.js'

const ymd = { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Inclusive IST calendar days
    fromDate: ymd,
    toDate: ymd,
    type: { type: String, enum: LEAVE_TYPES, required: true },
    status: { type: String, enum: LEAVE_STATUSES, default: 'pending' },
    reason: { type: String, trim: true, maxlength: 500, default: '' },

    // Who recorded it (Phase 1 has no employee login, so always an owner/manager)
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // true when an owner added it directly as approved ("on behalf" of the employee)
    addedByOwner: { type: Boolean, default: false },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true, maxlength: 500, default: null },
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

leaveSchema.plugin(tenantPlugin)
// Overlap checks and "approved leave covering a date" lookups
leaveSchema.index({ businessId: 1, employeeId: 1, status: 1, fromDate: 1, toDate: 1 })
// Leave page: by status, newest dates first
leaveSchema.index({ businessId: 1, status: 1, fromDate: -1 })

export default mongoose.model('Leave', leaveSchema)
