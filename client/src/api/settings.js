import api from './client.js'

export const settingsApi = {
  // -> { punchToken, businessName }
  getPunchLink: () => api.get('api/settings/punch-link').then((r) => r.data),
  regeneratePunchLink: () => api.post('api/settings/punch-link/regenerate').then((r) => r.data),
  // -> { settings, timezone, plan, business }
  get: () => api.get('api/settings').then((r) => r.data),
  // Owner only. Only the changed fields: { name?, halfDayThresholdMinutes?, defaultGraceMinutes?, workingDaysPolicy?, overtimeEnabled?, lateRuleEnabled?, lateRuleEvery? }
  update: (changes) => api.patch('api/settings', changes).then((r) => r.data),
}
