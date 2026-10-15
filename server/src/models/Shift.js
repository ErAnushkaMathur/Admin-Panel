import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // Wall-clock times in the business timezone (Asia/Kolkata), "HH:mm"
    startTime: { type: String, required: true, match: HHMM },
    endTime: { type: String, required: true, match: HHMM },
    graceMinutes: { type: Number, required: true, min: 0, max: 180, default: 10 },
    // Derived from start/end by services/shift.service.js; never set from client input.
    // Attendance for such a shift belongs to the date the shift started.
    crossesMidnight: { type: Boolean, required: true },
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

shiftSchema.plugin(tenantPlugin)
shiftSchema.index({ businessId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

export default mongoose.model('Shift', shiftSchema)
