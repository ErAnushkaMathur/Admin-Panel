import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, ExternalLink, QrCode, RefreshCw } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import Button from '../components/Button.jsx'
import ErrorState from '../components/ErrorState.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ShopSettingsForm from '../components/settings/ShopSettingsForm.jsx'
import ChangePasswordCard from '../components/settings/ChangePasswordCard.jsx'
import { settingsApi } from '../api/settings.js'
import { useApi } from '../hooks/useApi.js'
import { useAuth } from '../hooks/useAuth.js'
import { punchUrl } from '../utils/punchUrl.js'
import { themeColor } from '../utils/theme.js'

// QR images need literal colours: syrup on the surface, read from the palette tokens
const qrColors = () => ({ dark: themeColor('syrup'), light: themeColor('surface') })

function slug(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'shop'
}

function PunchQrCard({ punchToken, businessName, canRegenerate, onRegenerated }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const link = punchUrl(punchToken)
  const qrLink = punchUrl(punchToken, { qr: true })

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(qrLink, { width: 480, margin: 2, errorCorrectionLevel: 'M', color: qrColors() })
      .then((url) => !cancelled && setQrDataUrl(url))
      .catch(() => !cancelled && setQrDataUrl(''))
    return () => {
      cancelled = true
    }
  }, [qrLink])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the link is visible and selectable anyway
    }
  }

  async function download() {
    const url = await QRCode.toDataURL(qrLink, { width: 1024, margin: 4, errorCorrectionLevel: 'M', color: qrColors() })
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(businessName)}-punch-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function regenerate() {
    await onRegenerated(await settingsApi.regeneratePunchLink())
    setConfirming(false)
  }

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-soft sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
        Punch QR code
      </h2>
      <p className="mt-1 text-sm text-syrup-muted">
        Print this and stick it near the counter. Staff scan it with their phone camera, then enter their employee code
        and PIN. No app or login needed.
      </p>

      <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-start">
        <div className="mx-auto shrink-0 rounded-2xl border border-border bg-surface p-3 md:mx-0">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for ${businessName} punch page`} className="h-56 w-56" data-testid="punch-qr" />
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-xl bg-background-deep" aria-label="Generating QR code" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <label htmlFor="punch-link" className="mb-1.5 block text-sm font-medium">
              Punch link (share on WhatsApp if someone can't scan)
            </label>
            <div className="flex gap-2">
              <input
                id="punch-link"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <Button variant="secondary" icon={copied ? Check : Copy} onClick={copyLink} aria-label="Copy punch link">
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={download}>
              Download PNG
            </Button>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-syrup ring-1 ring-border hover:bg-background-deep"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open punch page
            </a>
          </div>

          {canRegenerate && (
            <div className="rounded-xl bg-background px-4 py-3">
              <p className="text-sm font-medium">Lost control of the QR code?</p>
              <p className="mt-0.5 text-xs text-syrup-muted">
                Regenerating makes the old QR code and link stop working. You'll need to print the new one.
              </p>
              <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirming(true)} className="mt-3">
                Regenerate QR code
              </Button>
            </div>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Regenerate QR code?"
          confirmLabel="Regenerate"
          variant="danger"
          onConfirm={regenerate}
          onClose={() => setConfirming(false)}
        >
          <p>
            The current QR code and punch link will <span className="font-semibold">stop working immediately</span>. Staff
            won't be able to punch until you put up the new QR code.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const fetchLink = useCallback(() => settingsApi.getPunchLink(), [])
  const { data, loading, error, reload } = useApi(fetchLink)
  // Newer token after a regenerate, without refetching
  const [override, setOverride] = useState(null)
  const link = override || data

  let punchCard
  if (loading) {
    punchCard = (
      <div className="flex animate-pulse gap-6 rounded-2xl bg-surface p-6 shadow-soft" aria-busy="true" aria-label="Loading QR code">
        <div className="h-56 w-56 rounded-xl bg-background-deep" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-40 rounded bg-background-deep" />
          <div className="h-10 rounded-xl bg-background-deep" />
          <div className="h-10 w-48 rounded-xl bg-background-deep" />
        </div>
      </div>
    )
  } else if (error) {
    punchCard = <ErrorState message={error} onRetry={reload} />
  } else {
    punchCard = (
      <PunchQrCard
        punchToken={link.punchToken}
        businessName={link.businessName}
        canRegenerate={isOwner}
        onRegenerated={setOverride}
      />
    )
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Shop profile, attendance and payroll rules, punch QR code and your password" />
      <div className="space-y-4">
        <ShopSettings canEdit={isOwner} />
        {punchCard}
        <ChangePasswordCard />
      </div>
    </div>
  )
}

function ShopSettings({ canEdit }) {
  const { updateBusiness } = useAuth()
  const fetchSettings = useCallback(() => settingsApi.get(), [])
  const { data, loading, error, reload } = useApi(fetchSettings)

  if (loading) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading settings">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl bg-surface p-6 shadow-soft">
            <div className="h-5 w-40 rounded bg-background-deep" />
            <div className="h-10 rounded-xl bg-background-deep" />
            <div className="h-10 w-2/3 rounded-xl bg-background-deep" />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={reload} />
  return <ShopSettingsForm data={data} canEdit={canEdit} onSaved={(result) => updateBusiness(result.business)} />
}
