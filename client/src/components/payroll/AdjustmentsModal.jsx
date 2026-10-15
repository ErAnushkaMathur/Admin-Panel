import { useId, useState } from 'react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import FormField from '../FormField.jsx'
import { payrollApi } from '../../api/payroll.js'
import { getErrorMessage, getFieldErrors } from '../../api/client.js'
import { rupeesToPaise, paiseToRupeesInput } from '../../utils/money.js'

// Bonus and salary advance for one draft row. The server recalculates net pay.
export default function AdjustmentsModal({ row, onClose, onSaved }) {
  const noteId = useId()
  const [bonus, setBonus] = useState(paiseToRupeesInput(row.bonusPaise) || '0')
  const [advance, setAdvance] = useState(paiseToRupeesInput(row.advancePaise) || '0')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    const bonusPaise = rupeesToPaise(bonus || '0')
    const advancePaise = rupeesToPaise(advance || '0')
    const local = {}
    if (bonusPaise === null) local.bonusPaise = 'Enter an amount like 500 or 500.50'
    if (advancePaise === null) local.advancePaise = 'Enter an amount like 2000 or 2000.50'
    setErrors(local)
    if (Object.keys(local).length) return

    setBusy(true)
    setError('')
    try {
      await payrollApi.adjust(row._id, { bonusPaise, advancePaise, ...(reason.trim() && { reason: reason.trim() }) })
      onSaved()
    } catch (err) {
      setErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`Bonus & advance · ${row.employee.name}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="adjustments-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="adjustments-form" onSubmit={handleSave} className="space-y-4 text-sm" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Bonus (₹)" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} error={errors.bonusPaise} />
          <FormField
            label="Advance to recover (₹)"
            inputMode="decimal"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
            error={errors.advancePaise}
          />
        </div>
        <p className="text-syrup-muted">The advance is subtracted from this month&apos;s pay. Net pay never goes below ₹0.</p>
        <div>
          <label htmlFor={noteId} className="mb-1.5 block font-medium">
            Note <span className="font-normal text-syrup-muted">(optional, saved in the audit log)</span>
          </label>
          <input
            id={noteId}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Diwali bonus, advance taken on 12 Sept"
            className="w-full rounded-xl border border-border bg-background/40 px-3.5 py-2.5 outline-none placeholder:text-syrup-muted focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </form>
    </Modal>
  )
}
