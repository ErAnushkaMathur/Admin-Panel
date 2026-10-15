import api from './client.js'

// Owner only. Money is in paise everywhere; the UI formats it.
export const payrollApi = {
  // -> { month, today, isFuture, isOver, rows, totals, statusCounts }
  list: (month) => api.get('/payroll', { params: { month } }).then((r) => r.data),
  // (Re)calculates draft rows; finalized/paid rows are untouched. Same response as list.
  calculate: (month) => api.post('/payroll/calculate', { month }).then((r) => r.data),
  finalize: (month) => api.post('/payroll/finalize', { month }).then((r) => r.data),
  reopen: (month, reason) => api.post('/payroll/reopen', { month, reason }).then((r) => r.data),
  // { bonusPaise?, advancePaise?, reason? } on a draft row
  adjust: (id, data) => api.patch(`/payroll/${id}/adjustments`, data).then((r) => r.data.payroll),
  markPaid: (id, paidDate) => api.patch(`/payroll/${id}/paid`, paidDate ? { paidDate } : {}).then((r) => r.data.payroll),
  // -> { business: { name }, payroll }
  payslip: (id) => api.get(`/payroll/${id}/payslip`).then((r) => r.data),
}
