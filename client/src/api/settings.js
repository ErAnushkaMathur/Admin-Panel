import api from './client.js'

export const settingsApi = {
  // -> { punchToken, businessName }
  getPunchLink: () => api.get('/settings/punch-link').then((r) => r.data),
  regeneratePunchLink: () => api.post('/settings/punch-link/regenerate').then((r) => r.data),
  // -> { settings, timezone, plan, business }
  get: () => api.get('/settings').then((r) => r.data),
  // Owner only. Only the changed fields: { name?, halfDayThresholdMinutes?, defaultGraceMinutes?, workingDaysPolicy?, overtimeEnabled?, lateRuleEnabled?, lateRuleEvery? }
  update: (changes) => api.patch('/settings', changes).then((r) => r.data),
}
