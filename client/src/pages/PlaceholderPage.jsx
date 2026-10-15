import { Construction } from 'lucide-react'

// Empty state for sidebar pages that haven't been built yet
export default function PlaceholderPage({ title, phase }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6 flex flex-col items-center justify-center rounded-2xl bg-surface px-6 py-16 text-center shadow-soft">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-tint text-primary-ink">
          <Construction className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Coming soon</h2>
        <p className="mt-1 max-w-sm text-sm text-syrup-muted">
          {phase ? `This page is planned for Phase ${phase}.` : 'This page is on the roadmap.'}
        </p>
      </div>
    </div>
  )
}
