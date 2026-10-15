import api from './client.js'

// Owner only. Money is in paise everywhere; the UI formats it.
export const payrollApi = {
  // -> { month, today, isFuture, isOver, rows, totals, statusCounts }
  list: (month) => api.get('api/payroll', { params: { month } }).then((r) => r.data),
  // (Re)calculates draft rows; finalized/paid rows are untouched. Same response as list.
  calculate: (month) => api.post('api/payroll/calculate', { month }).then((r) => r.data),
  finalize: (month) => api.post('api/payroll/finalize', { month }).then((r) => r.data),
  reopen: (month, reason) => api.post('api/payroll/reopen', { month, reason }).then((r) => r.data),
  // { bonusPaise?, advancePaise?, reason? } on a draft row
  adjust: (id, data) => api.patch(`api/payroll/${id}/adjustments`, data).then((r) => r.data.payroll),
  markPaid: (id, paidDate) => api.patch(`api/payroll/${id}/paid`, paidDate ? { paidDate } : {}).then((r) => r.data.payroll),
  // -> { business: { name }, payroll }
  payslip: (id) => api.get(`api/payroll/${id}/payslip`).then((r) => r.data),
}
