import api from './client.js'

const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))

export const attendanceApi = {
  // -> { date, summary, rows }
  today: (params) => api.get('/attendance', { params: clean(params) }).then((r) => r.data),
  // -> { month, days, today, employees: [{ employee, days: [cell|null], totals }] }
  monthly: (params) => api.get('/attendance/monthly', { params: clean(params) }).then((r) => r.data),
  // -> { from, to, rows }
  exceptions: (params) => api.get('/attendance/exceptions', { params: clean(params) }).then((r) => r.data),
  // Manual edit (reason required): { punchIn?, punchOut?, status?, reason }
  update: (id, data) => api.patch(`/attendance/${id}`, data).then((r) => r.data.attendance),
  // Manual record for a day without one: { employeeId, date, punchIn?, punchOut?, status?, reason }
  createManual: (data) => api.post('/attendance/manual', data).then((r) => r.data.attendance),
}
