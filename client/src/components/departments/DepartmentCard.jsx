import { createElement } from 'react'
import { Archive, ArchiveRestore, Pencil } from 'lucide-react'
import { getDepartmentIcon } from '../../utils/departmentIcons.js'

export default function DepartmentCard({ department, canManage, onEdit, onArchive, onRestore, restoring }) {
  const { name, color, icon, isActive, staffCount, staffToday, presentToday } = department

  return (
    <article className={`flex flex-col rounded-2xl bg-surface p-5 shadow-soft ${isActive ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
        >
          {createElement(getDepartmentIcon(icon), { className: 'h-5 w-5', 'aria-hidden': true })}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold" title={name}>
            {name}
          </h3>
          <p className="text-sm text-syrup-muted">
            {staffCount} staff
            {!isActive && <span className="ml-2 rounded-full bg-background-deep px-2 py-0.5 text-xs font-medium">Archived</span>}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm">
          <span className="font-semibold">
            {presentToday}/{staffToday}
          </span>{' '}
          <span className="text-syrup-muted">present today</span>
        </p>

        {canManage && (
          <div className="flex gap-1">
            {isActive ? (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-lg p-2 text-syrup-muted hover:bg-background-deep hover:text-syrup"
                  aria-label={`Edit ${name}`}
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onArchive}
                  className="rounded-lg p-2 text-syrup-muted hover:bg-primary-tint hover:text-primary-ink"
                  aria-label={`Archive ${name}`}
                  title="Archive"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onRestore}
                disabled={restoring}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-syrup-soft hover:bg-background-deep disabled:opacity-60"
              >
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
