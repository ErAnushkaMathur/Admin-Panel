import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

export const ATTENDANCE_SOURCES = ['qr', 'link', 'manual']
// Set at punch-in (present/late); the rest are decided by deriveStatus() in Phase 4
export const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off']
export const ATTENDANCE_FLAGS = ['missing_checkout', 'manual_edit', 'device_mismatch']

// Where a single punch came from (stored for every punch in and out)
const deviceSchema = new mongoose.Schema(
  {
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '', maxlength: 512 },
  },
  { _id: false },
)

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Calendar date in IST the shift STARTED on (SPEC 4.4), "YYYY-MM-DD"
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    // Shift as it was when punched in, so later shift edits don't change past records
    shiftSnapshot: {
      name: String,
      startTime: String,
      endTime: String,
      graceMinutes: Number,
      crossesMidnight: Boolean,
    },

    // Server time only (golden rule 3), stored as UTC
    punchIn: { type: Date, default: null },
    punchOut: { type: Date, default: null },
    punchInDevice: { type: deviceSchema, default: null },
    punchOutDevice: { type: deviceSchema, default: null },
    source: { type: String, enum: ATTENDANCE_SOURCES, required: true },

    // Stored result of deriveStatus(); recomputed on every punch and manual edit
    status: { type: String, enum: ATTENDANCE_STATUSES, default: null },
    // Status set by hand in a manual edit; overrides the punch-based status while set
    manualStatus: { type: String, enum: [null, ...ATTENDANCE_STATUSES], default: null },
    lateMinutes: { type: Number, default: 0, min: 0 },
    workedMinutes: { type: Number, default: 0, min: 0 },
    overtimeMinutes: { type: Number, default: 0, min: 0 },
    flags: { type: [{ type: String, enum: ATTENDANCE_FLAGS }], default: [] },

    // Manual edits (Phase 4)
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editReason: { type: String, default: null },

    // Reserved for future verification features; always null for now
    method: { type: String, default: null }, // e.g. 'pin', 'face'
    gps: {
      type: new mongoose.Schema({ lat: Number, lng: Number, accuracyM: Number }, { _id: false }),
      default: null,
    },
    selfieUrl: { type: String, default: null },
    faceConfidence: { type: Number, default: null, min: 0, max: 1 },
    reviewStatus: { type: String, enum: [null, 'pending', 'approved', 'rejected'], default: null },
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

attendanceSchema.plugin(tenantPlugin)
// One record per employee per (shift start) date
attendanceSchema.index({ businessId: 1, employeeId: 1, date: 1 }, { unique: true })
attendanceSchema.index({ businessId: 1, date: 1 })
// Finding an employee's open record / recent punches
attendanceSchema.index({ businessId: 1, employeeId: 1, punchIn: -1 })

export default mongoose.model('Attendance', attendanceSchema)
