import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

// Wrong-PIN counter per employee CODE (not per employee), so a code that doesn't exist is
// counted and locked exactly like a real one; the punch API never reveals which codes exist.
const punchAttemptSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, required: true },
    failedCount: { type: Number, default: 0 },
    lastFailedAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
  },
  { versionKey: false },
)

punchAttemptSchema.plugin(tenantPlugin)
punchAttemptSchema.index({ businessId: 1, employeeCode: 1 }, { unique: true })

export default mongoose.model('PunchAttempt', punchAttemptSchema)
