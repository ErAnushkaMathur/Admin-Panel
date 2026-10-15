import { useState } from 'react'
import Modal from '../Modal.jsx'
import Button from '../Button.jsx'
import Alert from '../Alert.jsx'
import { departmentsApi } from '../../api/departments.js'
import { getErrorMessage } from '../../api/client.js'

export default function ArchiveDepartmentDialog({ department, onClose, onArchived }) {
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState('')

  async function handleArchive() {
    setArchiving(true)
    setError('')
    try {
      await departmentsApi.update(department._id, { isActive: false })
      onArchived()
    } catch (err) {
      // e.g. 409: department still has active employees (message comes from the server)
      setError(getErrorMessage(err))
      setArchiving(false)
    }
  }

  return (
    <Modal
      open
      title="Archive department?"
      onClose={onClose}
      busy={archiving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={archiving}>
            {error ? 'Close' : 'Cancel'}
          </Button>
          {!error && (
            <Button variant="danger" onClick={handleArchive} loading={archiving}>
              Archive
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <Alert>{error}</Alert>
      ) : (
        <p className="text-sm text-syrup-soft">
          <span className="font-semibold">{department.name}</span> will be hidden from lists and forms. You can restore it
          any time from “Show archived”.
        </p>
      )}
    </Modal>
  )
}
