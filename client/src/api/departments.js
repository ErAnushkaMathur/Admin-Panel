import api from './client.js'

export const departmentsApi = {
  list: ({ includeArchived = false } = {}) =>
    api.get('/departments', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data.departments),
  create: (data) => api.post('/departments', data).then((r) => r.data.department),
  update: (id, data) => api.patch(`/departments/${id}`, data).then((r) => r.data.department),
}
