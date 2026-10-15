import api from './client.js'

export const analyticsApi = {
  // range: '30d' | '90d' | '12m'. Owners and managers.
  attendance: (range) => api.get('/analytics/attendance', { params: { range } }).then((r) => r.data),
  // range: '6m' | '12m'. Owner only (salary numbers).
  payroll: (range) => api.get('/analytics/payroll', { params: { range } }).then((r) => r.data),
}
