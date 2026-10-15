export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface px-6 py-14 text-center shadow-soft">
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-tint text-primary-ink">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      )}
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {message && <p className="mt-1 max-w-sm text-sm text-syrup-muted">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
