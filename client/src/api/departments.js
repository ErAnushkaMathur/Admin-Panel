import api from './client.js'

export const departmentsApi = {
  list: ({ includeArchived = false } = {}) =>
    api.get('api/departments', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data.departments),
  create: (data) => api.post('api/departments', data).then((r) => r.data.department),
  update: (id, data) => api.patch(`api/departments/${id}`, data).then((r) => r.data.department),
}
