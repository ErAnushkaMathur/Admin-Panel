// Loading skeleton shaped like the app shell, shown while the session is checked
export default function AppSkeleton() {
  return (
    <div className="flex min-h-screen animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="hidden w-64 shrink-0 bg-syrup p-5 lg:block">
        <div className="mb-8 h-8 w-40 rounded-lg bg-syrup-soft" />
        <div className="space-y-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-9 rounded-xl bg-syrup-soft" />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
          <div className="h-9 w-56 rounded-xl bg-background-deep" />
          <div className="h-9 w-32 rounded-xl bg-background-deep" />
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="h-8 w-48 rounded-lg bg-background-deep" />
          <div className="h-40 rounded-2xl bg-background-deep" />
        </div>
      </div>
    </div>
  )
}
