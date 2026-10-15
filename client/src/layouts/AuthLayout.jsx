import { CakeSlice } from 'lucide-react'

// `aside` (optional, Login only): decorative content beside the form on wide screens, above it on phones
export default function AuthLayout({ title, subtitle, children, footer, aside }) {
  const card = (
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-syrup text-primary">
          <CakeSlice className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold">Sweet Shop Staff</span>
      </div>
      <div className="rounded-2xl bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-syrup-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-6 text-center text-sm text-syrup-muted">{footer}</p>}
    </div>
  )

  if (!aside) {
    return <main className="flex min-h-screen items-center justify-center px-4 py-10">{card}</main>
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-5xl flex-col items-center gap-4 md:flex-row md:justify-center md:gap-10">
        <div className="w-full md:max-w-md md:flex-1">{aside}</div>
        {card}
      </div>
    </main>
  )
}
