import api from './client.js'

const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))

export const auditLogsApi = {
  // params: { from, to, employeeId, type, page, limit } -> { rows, total, page, limit, actionTypes }
  list: (params) => api.get('api/audit-logs', { params: clean(params) }).then((r) => r.data),
}
