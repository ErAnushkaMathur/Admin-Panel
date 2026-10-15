import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Calculator, ChevronLeft, ChevronRight, FileText, HandCoins, Lock, LockOpen, RefreshCw, Wallet } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import Alert from '../components/Alert.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import AdjustmentsModal from '../components/payroll/AdjustmentsModal.jsx'
import MarkPaidDialog from '../components/payroll/MarkPaidDialog.jsx'
import ReopenDialog from '../components/payroll/ReopenDialog.jsx'
import { PAYROLL_STATUSES, SALARY_TYPES, dayCounts, monthLabel, shiftMonth } from '../components/payroll/payrollMeta.js'
import { payrollApi } from '../api/payroll.js'
import { getErrorMessage } from '../api/client.js'
import { AnimatePresence } from 'framer-motion'
import { useApi } from '../hooks/useApi.js'
import { rowFadeIn, useFlash } from '../hooks/useFlash.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDate, formatRupees } from '../utils/format.js'
import { todayIST } from '../utils/date.js'

function StatusPill({ status }) {
  const meta = PAYROLL_STATUSES[status]
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta?.pill ?? 'bg-background-deep'}`}>{meta?.label ?? status}</span>
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading payroll">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-surface shadow-soft" />
        ))}
      </div>
      <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-soft">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 flex-[2] rounded bg-background-deep" />
            <div className="h-4 flex-1 rounded bg-background-deep" />
            <div className="h-4 flex-1 rounded bg-background-deep" />
            <div className="h-8 w-24 rounded-xl bg-background-deep" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, hint, accent = false }) {
  return (
    <div className={`rounded-2xl p-4 shadow-soft ${accent ? 'bg-syrup text-background' : 'bg-surface'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${accent ? 'text-syrup-subtle' : 'text-syrup-muted'}`}>{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className={`mt-0.5 text-xs ${accent ? 'text-syrup-subtle' : 'text-syrup-muted'}`}>{hint}</p>}
    </div>
  )
}

// Non-zero day counts, as the server computed them
function DayCounts({ snapshot }) {
  const items = dayCounts(snapshot).filter(([, n]) => n > 0)
  if (!items.length) return <span className="text-syrup-muted">No days counted</span>
  return (
    <span className="text-xs text-syrup-soft">
      {items.map(([label, n], i) => (
        <span key={label} className="whitespace-nowrap">
          {i > 0 && ' · '}
          {n} {label.toLowerCase()}
        </span>
      ))}
    </span>
  )
}

const money = (paise, sign = '') => (paise ? `${sign}${formatRupees(paise)}` : <span className="text-syrup-muted">—</span>)

export default function Payroll() {
  const { user } = useAuth()
  if (user?.role !== 'owner') {
    return (
      <div>
        <PageHeader title="Payroll" />
        <EmptyState icon={Lock} title="Owners only" message="Only the shop owner can see salaries and run payroll." />
      </div>
    )
  }
  return <PayrollContent />
}

function PayrollContent() {
  const currentMonth = todayIST().slice(0, 7)
  // Default: last month, the one usually being paid out
  const defaultMonth = shiftMonth(currentMonth, -1)
  const [params, setSearchParams] = useSearchParams()
  const month = params.get('month') || defaultMonth
  const setMonth = (m) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (m === defaultMonth) next.delete('month')
        else next.set('month', m)
        return next
      },
      { replace: true },
    )

  const fetcher = useCallback(() => payrollApi.list(month), [month])
  const { data, loading, error, reload } = useApi(fetcher)
  const [flashId, flash] = useFlash()

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  // { kind: 'finalize' | 'reopen' | 'adjust' | 'paid', row? } | null
  const [dialog, setDialog] = useState(null)

  async function recalculate() {
    setBusy(true)
    setActionError('')
    try {
      await payrollApi.calculate(month)
      await reload()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const afterDialog = () => {
    // Flash the row a bonus/advance or payment was just saved for
    if (dialog?.row) flash(dialog.row._id)
    setDialog(null)
    reload()
  }

  // `data` can belong to the previous month while the next one loads
  const view = data?.month === month ? data : null
  const counts = view?.statusCounts ?? { draft: 0, finalized: 0, paid: 0 }
  const hasRows = Boolean(view?.rows.length)
  const allLocked = hasRows && counts.draft === 0

  const actions = view && !view.isFuture && (
    <>
      {counts.finalized > 0 && (
        <Button variant="ghost" icon={LockOpen} onClick={() => setDialog({ kind: 'reopen' })}>
          Reopen
        </Button>
      )}
      {!allLocked && (
        <Button variant="secondary" icon={hasRows ? RefreshCw : Calculator} loading={busy} onClick={recalculate}>
          {hasRows ? 'Recalculate' : 'Calculate'}
        </Button>
      )}
      {hasRows && counts.draft > 0 && (
        <Button
          icon={Lock}
          disabled={!view.isOver || busy}
          title={view.isOver ? undefined : 'You can finalize once the month is over'}
          onClick={() => setDialog({ kind: 'finalize' })}
        >
          Finalize month
        </Button>
      )}
    </>
  )

  let content
  if (loading || (!view && !error)) content = <Skeleton />
  else if (error) content = <ErrorState message={error} onRetry={reload} />
  else if (view.isFuture) {
    content = <EmptyState icon={Wallet} title="This month hasn't started" message="Pick the current or an earlier month." />
  } else if (!hasRows) {
    content = (
      <EmptyState
        icon={Calculator}
        title="Not calculated yet"
        message={`Calculate ${monthLabel(month)} to see each employee's pay from their attendance and leave.`}
        action={
          <Button icon={Calculator} loading={busy} onClick={recalculate}>
            Calculate payroll
          </Button>
        }
      />
    )
  } else {
    const { totals } = view
    const rowActions = (r) => (
      <div className="flex flex-wrap justify-end gap-2">
        {r.status === 'draft' && (
          <Button variant="secondary" className="px-3 py-1.5" icon={HandCoins} onClick={() => setDialog({ kind: 'adjust', row: r })} aria-label={`Bonus and advance for ${r.employee.name}`}>
            Bonus / advance
          </Button>
        )}
        {r.status === 'finalized' && (
          <Button className="px-3 py-1.5" icon={Wallet} onClick={() => setDialog({ kind: 'paid', row: r })} aria-label={`Mark ${r.employee.name} paid`}>
            Mark paid
          </Button>
        )}
        <Link
          to={`/payroll/${r._id}/payslip`}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-syrup-soft hover:bg-background-deep"
          aria-label={`Payslip for ${r.employee.name}`}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Payslip
        </Link>
      </div>
    )
    const advanceNote = (r) =>
      r.snapshot.unrecoveredAdvancePaise > 0 && (
        <span className="block text-xs text-primary-ink">{formatRupees(r.snapshot.unrecoveredAdvancePaise)} advance not recovered</span>
      )

    content = (
      <>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard accent label="Net payable" value={formatRupees(totals.netPaise)} hint={`${view.rows.length} ${view.rows.length === 1 ? 'employee' : 'employees'}`} />
          <SummaryCard label="Base pay" value={formatRupees(totals.basePaise)} />
          <SummaryCard label="Overtime" value={formatRupees(totals.overtimePaise)} hint={totals.bonusPaise ? `+ ${formatRupees(totals.bonusPaise)} bonus` : undefined} />
          <SummaryCard
            label="Deductions"
            value={formatRupees(totals.deductionsPaise)}
            hint={totals.advancePaise ? `+ ${formatRupees(totals.advancePaise)} advance recovered` : undefined}
          />
        </div>

        <div className="hidden overflow-x-auto rounded-2xl bg-surface shadow-soft lg:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-syrup-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Employee</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Base</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Overtime</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Deductions</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Bonus</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Advance</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Net</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {view.rows.map((r, i) => (
                <tr
                  key={r._id}
                  className={`align-top transition-colors hover:bg-background/40 ${rowFadeIn(i).className} ${flashId === r._id ? 'flash-row' : ''}`}
                  style={rowFadeIn(i).style}
                  data-testid="payroll-row"
                >
                  <td className="px-5 py-3">
                    <Link to={`/employees/${r.employeeId}`} className="font-semibold hover:text-primary-ink">
                      {r.employee.name}
                    </Link>
                    <span className="ml-1.5 font-mono text-xs text-syrup-muted">#{r.employee.employeeCode}</span>
                    <span className="block text-xs text-syrup-muted">
                      {SALARY_TYPES[r.snapshot.salaryType]} · {formatRupees(r.snapshot.salaryAmountPaise)}
                    </span>
                    <DayCounts snapshot={r.snapshot} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">{money(r.snapshot.basePaise)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">{money(r.snapshot.overtimePaise, '+ ')}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-primary-ink">{money(r.snapshot.deductionsPaise, '− ')}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">{money(r.snapshot.bonusPaise, '+ ')}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {money(r.snapshot.advancePaise, '− ')}
                    {advanceNote(r)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-base font-semibold">{formatRupees(r.snapshot.netPaise)}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} />
                    {r.paidDate && <span className="block pt-1 text-xs text-syrup-muted">{formatDate(r.paidDate)}</span>}
                  </td>
                  <td className="px-4 py-3">{rowActions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-3 lg:hidden">
          {view.rows.map((r, i) => (
            <li
              key={r._id}
              className={`rounded-2xl bg-surface p-4 shadow-soft ${rowFadeIn(i).className} ${flashId === r._id ? 'flash-card' : ''}`}
              style={rowFadeIn(i).style}
              data-testid="payroll-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/employees/${r.employeeId}`} className="font-semibold">
                    {r.employee.name}
                  </Link>
                  <span className="ml-1.5 font-mono text-xs text-syrup-muted">#{r.employee.employeeCode}</span>
                  <p className="text-xs text-syrup-muted">
                    {SALARY_TYPES[r.snapshot.salaryType]} · {formatRupees(r.snapshot.salaryAmountPaise)}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </div>
              <div className="mt-1">
                <DayCounts snapshot={r.snapshot} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-syrup-muted">Base</dt>
                <dd className="text-right">{money(r.snapshot.basePaise)}</dd>
                <dt className="text-syrup-muted">Overtime</dt>
                <dd className="text-right">{money(r.snapshot.overtimePaise, '+ ')}</dd>
                <dt className="text-syrup-muted">Deductions</dt>
                <dd className="text-right text-primary-ink">{money(r.snapshot.deductionsPaise, '− ')}</dd>
                <dt className="text-syrup-muted">Bonus</dt>
                <dd className="text-right">{money(r.snapshot.bonusPaise, '+ ')}</dd>
                <dt className="text-syrup-muted">Advance</dt>
                <dd className="text-right">
                  {money(r.snapshot.advancePaise, '− ')}
                  {advanceNote(r)}
                </dd>
                <dt className="border-t border-border pt-1 font-semibold">Net</dt>
                <dd className="border-t border-border pt-1 text-right font-semibold">{formatRupees(r.snapshot.netPaise)}</dd>
              </dl>
              {r.paidDate && <p className="mt-1 text-xs text-syrup-muted">Paid on {formatDate(r.paidDate)}</p>}
              <div className="mt-3">{rowActions(r)}</div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div>
      <PageHeader title="Payroll" subtitle="Monthly pay worked out from attendance, leave and each employee's salary" actions={actions} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="rounded-xl border border-border bg-surface p-2.5 hover:bg-background-deep"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <label htmlFor="payroll-month" className="mb-1.5 block text-sm font-medium">
              Month
            </label>
            <input
              id="payroll-month"
              type="month"
              value={month}
              max={currentMonth}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth}
            className="rounded-xl border border-border bg-surface p-2.5 hover:bg-background-deep disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {hasRows && (
          <p className="text-sm text-syrup-muted" data-testid="status-counts">
            {counts.draft} draft · {counts.finalized} finalized · {counts.paid} paid
          </p>
        )}
      </div>

      <div className="space-y-3">
        {actionError && <Alert>{actionError}</Alert>}
        {view && !view.isFuture && !view.isOver && (
          <Alert variant="info">
            {monthLabel(month)} isn&apos;t over yet, so only days up to today are counted. You can finalize it once the month ends.
          </Alert>
        )}
        {allLocked && <Alert variant="info">This month is locked. Reopen it to recalculate salaries that haven&apos;t been paid yet.</Alert>}
        <div>{content}</div>
      </div>

      <AnimatePresence>
      {dialog?.kind === 'finalize' && (
        <ConfirmDialog
          key="finalize"
          title={`Finalize ${monthLabel(month)}?`}
          confirmLabel="Finalize"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await payrollApi.finalize(month)
            afterDialog()
          }}
        >
          <p>
            {counts.draft} draft {counts.draft === 1 ? 'salary is' : 'salaries are'} recalculated one last time and then locked. Later changes to attendance or
            salary settings won&apos;t change them.
          </p>
          <p>Only the owner can reopen a finalized month, with a reason.</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'reopen' && (
        <ReopenDialog key="reopen" month={month} finalizedCount={counts.finalized} paidCount={counts.paid} onClose={() => setDialog(null)} onDone={afterDialog} />
      )}
      {dialog?.kind === 'adjust' && <AdjustmentsModal key="adjust" row={dialog.row} onClose={() => setDialog(null)} onSaved={afterDialog} />}
      {dialog?.kind === 'paid' && <MarkPaidDialog key="paid" row={dialog.row} onClose={() => setDialog(null)} onDone={afterDialog} />}
      </AnimatePresence>
    </div>
  )
}
