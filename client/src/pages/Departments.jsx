import { useCallback, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import Alert from '../components/Alert.jsx'
import DepartmentCard from '../components/departments/DepartmentCard.jsx'
import DepartmentFormModal from '../components/departments/DepartmentFormModal.jsx'
import ArchiveDepartmentDialog from '../components/departments/ArchiveDepartmentDialog.jsx'
import { departmentsApi } from '../api/departments.js'
import { getErrorMessage } from '../api/client.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface p-5 shadow-soft" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-background-deep" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-background-deep" />
          <div className="h-3 w-1/3 rounded bg-background-deep" />
        </div>
      </div>
      <div className="mt-6 h-4 w-1/2 rounded bg-background-deep" />
    </div>
  )
}

export default function Departments() {
  const { user } = useAuth()
  const canManage = user?.role === 'owner'
  const [showArchived, setShowArchived] = useState(false)
  // { mode: 'add' } | { mode: 'edit', department } | { mode: 'archive', department } | null
  const [dialog, setDialog] = useState(null)
  const [restoringId, setRestoringId] = useState(null)
  const [actionError, setActionError] = useState('')

  const fetchDepartments = useCallback(() => departmentsApi.list({ includeArchived: showArchived }), [showArchived])
  const { data: departments, loading, error, reload } = useApi(fetchDepartments)

  const closeDialog = useCallback(() => setDialog(null), [])
  const afterSave = () => {
    setDialog(null)
    reload()
  }

  async function handleRestore(dept) {
    setRestoringId(dept._id)
    setActionError('')
    try {
      await departmentsApi.update(dept._id, { isActive: true })
      await reload()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setRestoringId(null)
    }
  }

  const addButton = canManage && (
    <Button icon={Plus} onClick={() => setDialog({ mode: 'add' })}>
      Add department
    </Button>
  )

  let content
  if (loading) {
    content = (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading departments">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  } else if (error) {
    content = <ErrorState message={error} onRetry={reload} />
  } else if (departments.length === 0) {
    content = (
      <EmptyState
        icon={Building2}
        title={showArchived ? 'No departments' : 'No departments yet'}
        message="Group your staff by where they work, like Kitchen, Counter, Cleaning or Delivery."
        action={addButton}
      />
    )
  } else {
    content = (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {departments.map((dept) => (
          <DepartmentCard
            key={dept._id}
            department={dept}
            canManage={canManage}
            onEdit={() => setDialog({ mode: 'edit', department: dept })}
            onArchive={() => setDialog({ mode: 'archive', department: dept })}
            onRestore={() => handleRestore(dept)}
            restoring={restoringId === dept._id}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle="Where your staff work, and who's in today"
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-syrup-soft hover:bg-background-deep">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 accent-primary-strong"
              />
              Show archived
            </label>
            {!loading && !error && departments.length > 0 && addButton}
          </>
        }
      />

      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}

      {content}

      {(dialog?.mode === 'add' || dialog?.mode === 'edit') && (
        <DepartmentFormModal
          key={dialog.department?._id || 'new'}
          department={dialog.department}
          onClose={closeDialog}
          onSaved={afterSave}
        />
      )}
      {dialog?.mode === 'archive' && (
        <ArchiveDepartmentDialog department={dialog.department} onClose={closeDialog} onArchived={afterSave} />
      )}
    </div>
  )
}
