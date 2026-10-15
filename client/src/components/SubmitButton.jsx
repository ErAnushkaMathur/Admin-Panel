import { LoaderCircle } from 'lucide-react'

export default function SubmitButton({ loading, children, loadingText }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-primary-strong enabled:active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
  )
}
