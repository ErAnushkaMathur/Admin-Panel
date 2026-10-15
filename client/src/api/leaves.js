import api from './client.js'

const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))

export const leavesApi = {
  // params: { status, employeeId, from, to, page, limit } -> { rows, total, page, limit, counts }
  list: (params) => api.get('api/leaves', { params: clean(params) }).then((r) => r.data),
  // Pending request (owners and managers): { employeeId, fromDate, toDate, type, reason }
  request: (data) => api.post('api/leaves', data).then((r) => r.data.leave),
  // Owner adds leave for an employee, approved immediately
  addOnBehalf: (data) => api.post('api/leaves/on-behalf', data).then((r) => r.data.leave),
  approve: (id, note) => api.post(`api/leaves/${id}/approve`, note ? { note } : {}).then((r) => r.data.leave),
  reject: (id, note) => api.post(`api/leaves/${id}/reject`, note ? { note } : {}).then((r) => r.data.leave),
}
