export default function StatusBadge({ isActive }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive ? 'bg-present-tint text-present-ink' : 'bg-background-deep text-syrup-muted'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-present-strong' : 'bg-syrup-faint'}`} aria-hidden="true" />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}
