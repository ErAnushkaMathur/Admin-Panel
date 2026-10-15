import api from './client.js'

export const employeesApi = {
  // params: { search, departmentId, status, page, limit } -> { employees, total, page, limit }
  list: (params = {}) => api.get('/employees', { params }).then((r) => r.data),
  get: (id) => api.get(`/employees/${id}`).then((r) => r.data.employee),
  // -> { employee, pin } (the PIN is only ever returned here and by resetPin)
  create: (data) => api.post('/employees', data).then((r) => r.data),
  update: (id, data) => api.patch(`/employees/${id}`, data).then((r) => r.data.employee),
  resetPin: (id) => api.post(`/employees/${id}/reset-pin`).then((r) => r.data),
}
