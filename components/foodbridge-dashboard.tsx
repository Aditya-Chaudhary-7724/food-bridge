'use client'

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import {
  Activity, ArrowDownToLine, ArrowRight, Bell, Bot, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleHelp, ClipboardList, Clock3, Copy, Database, FileText, FlaskConical,
  Handshake, Home, Leaf, LineChart, MapPin, Menu, PackageCheck, PackagePlus,
  Plus, Search, Settings, Sparkles, Truck, Users, X, Send, RefreshCw,
  ExternalLink, AlertCircle, BookOpen, Loader2, Trash2,
} from 'lucide-react'

import AccountMenu from '@/components/account-menu'
import { ExpiryDatePicker } from '@/components/expiry-date-picker'
import { FoodJourney, JourneyTrack } from '@/components/food-journey'
import { DURATION, EASE_OUT, STAGGER_CHILD, STAGGER_PARENT } from '@/components/ui/motion'
import { createDonation, deleteDonation } from '@/lib/actions/donations'
import { acceptPickup, assignVolunteerToPickup, listAvailableVolunteers, updatePickupStatus } from '@/lib/actions/pickups'
import { createRequirement, deleteRequirement, updateRequirement, type NgoRequirementRow } from '@/lib/actions/ngo-requirements'
import { createOrganization } from '@/lib/actions/organizations'
import { respondToMatch } from '@/lib/actions/matches'
import { EXPIRY_FUTURE_MESSAGE, FOOD_CATEGORIES } from '@/lib/validations/donation'
import { URGENCY_LEVELS } from '@/lib/validations/ngo-requirement'
import type { DonationCardModel } from '@/lib/services/donation-view-model'
import type { PickupCardModel } from '@/lib/services/pickup-view-model'
import type { MatchCardModel } from '@/lib/services/match-view-model'
import type { DonorImpactStats } from '@/lib/services/donor-impact'
import type { LogisticsStats, NgoStats } from '@/lib/services/role-dashboard-stats'
import type { DashboardActions } from '@/lib/services/dashboard-actions'
import { getDashboardNavViews, getWorkspaceLabel, type DashboardView } from '@/lib/services/dashboard-navigation'
import { getPriorityTask } from '@/lib/services/dashboard-priority'
import { getPickupJourney, pickFeaturedJourney } from '@/lib/services/food-journey'
import type { OrganizationDirectory } from '@/lib/demo/types'

type Role = 'donor' | 'ngo' | 'volunteer' | 'logistics' | 'admin'
type View = DashboardView
type Tone = 'green' | 'blue' | 'amber' | 'slate' | 'rose'
type Donation = DonationCardModel
type Pickup = PickupCardModel
type Match = MatchCardModel
type Notice = { id: number; text: string; detail: string; read: boolean; view: View }

const NAV_ICONS: Record<View, typeof Home> = {
  Overview: Home, Donations: PackageCheck, Requirements: ClipboardList, Matches: Handshake, Pickups: Truck, 'My Pickups': Truck,
  Organizations: Users, 'AI Assistant': Bot, Analytics: LineChart, 'Knowledge Base': FileText, Settings,
}

function getNavItems(role: Role): { label: View; icon: typeof Home; count?: string }[] {
  return getDashboardNavViews(role).map((label) => ({ label, icon: NAV_ICONS[label] }))
}

// Real mode calls the Server Actions directly; demo mode passes an in-browser
// implementation with the same signatures (lib/demo/actions.ts).
const realDashboardActions: DashboardActions = {
  createDonation, deleteDonation, createRequirement, updateRequirement, deleteRequirement, createOrganization,
  respondToMatch, acceptPickup, assignVolunteerToPickup, updatePickupStatus, listAvailableVolunteers,
}
const DashboardActionsContext = createContext<DashboardActions>(realDashboardActions)
function useDashboardActions() { return useContext(DashboardActionsContext) }

export type DashboardDemoChrome = {
  /** Rendered as a strip above the header (role switcher, reset, exit). */
  controls: React.ReactNode
  notifications: { id: string; title: string; message: string; read: boolean }[]
  onMarkAllNotificationsRead: () => void
}

const insightItems: { label: View; icon: typeof Home; badge?: string }[] = [
  { label: 'AI Assistant', icon: Bot, badge: 'Beta' }, { label: 'Analytics', icon: LineChart }, { label: 'Knowledge Base', icon: FileText },
]
const initialNotices: Notice[] = []
const prompts = ['Can I donate cooked rice?', 'Which partners need produce?', 'How do I prepare a safe pickup?']

// ---------------------------------------------------------------------------
// Shared visual vocabulary
// ---------------------------------------------------------------------------

const surface = 'rounded-xl border border-stone-200 bg-white'
const inputClass = 'mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-normal text-ink outline-none transition placeholder:text-stone-500 focus:border-forest-500 focus:ring-3 focus:ring-forest-100'
const labelClass = 'block text-sm font-medium text-ink'
const btnPrimary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-paper transition hover:bg-forest-800 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60'
const btnSecondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60'
const btnSmall = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-60'
const btnSmallSecondary = `${btnSmall} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`
const btnSmallDanger = `${btnSmall} border border-tomato-200 bg-white text-tomato-700 hover:bg-tomato-50`
const btnSmallPrimary = `${btnSmall} bg-forest-700 text-paper hover:bg-forest-800`
const btnSmallDark = `${btnSmall} bg-ink text-paper hover:bg-stone-800`

function StatusBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  const styles: Record<Tone, { pill: string; dot: string }> = {
    green: { pill: 'bg-forest-50 text-forest-800 ring-forest-200', dot: 'bg-forest-600' },
    blue: { pill: 'bg-sky-50 text-sky-900 ring-sky-200', dot: 'bg-sky-600' },
    amber: { pill: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' },
    slate: { pill: 'bg-stone-100 text-stone-700 ring-stone-200', dot: 'bg-stone-500' },
    rose: { pill: 'bg-tomato-50 text-tomato-800 ring-tomato-200', dot: 'bg-tomato-600' },
  }
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors duration-300 ${styles[tone].pill}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${styles[tone].dot}`} /><span className="inline-block first-letter:uppercase">{children}</span></span>
}
function SectionTitle({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-forest-600">{eyebrow}</p>}<h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2></div>{action && <button onClick={onAction} className="group inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-forest-700 hover:text-forest-900">{action}<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></button>}</div>
}
// Shows the real value immediately, then animates only when it changes —
// so revisiting a view never replays a count-up from zero.
function AnimatedNumber({ value }: { value: string }) {
  const reduce = useReducedMotion()
  const numeric = Number(value.replace(/[^0-9.]/g, ''))
  const hasDecimals = value.includes('.')
  const [shown, setShown] = useState(numeric)
  const shownRef = useRef(numeric)
  useEffect(() => {
    const from = shownRef.current
    if (reduce || from === numeric) { shownRef.current = numeric; setShown(numeric); return }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / 600, 1)
      const next = from + (numeric - from) * (1 - Math.pow(1 - p, 3))
      shownRef.current = next
      setShown(next)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [numeric, reduce])
  return <>{hasDecimals ? (Math.round(shown * 10) / 10).toFixed(1) : Math.round(shown).toLocaleString('en-US')}{value.replace(/[0-9.,]/g, '')}</>
}
function Chart() { const points = '4,89 34,77 64,82 94,54 124,64 154,39 184,47 214,22 244,30 274,12 304,28'; return <div className="relative h-56 w-full overflow-hidden"><div className="absolute inset-0 flex flex-col justify-between text-xs text-stone-500"><span>1,200 kg</span><span>800 kg</span><span>400 kg</span><span>0 kg</span></div><motion.svg initial={{ opacity: 0, pathLength: 0 }} animate={{ opacity: 1, pathLength: 1 }} transition={{ duration: 1 }} className="absolute inset-0 ml-14 h-full w-[calc(100%-3.5rem)]" viewBox="0 0 308 100" preserveAspectRatio="none" role="img" aria-label="Monthly donation trend chart"><path d="M4,89 L34,77 L64,82 L94,54 L124,64 L154,39 L184,47 L214,22 L244,30 L274,12 L304,28 L304,100 L4,100 Z" fill="rgba(33,78,61,.08)" /><polyline points={points} fill="none" stroke="#214e3d" strokeWidth="2" vectorEffect="non-scaling-stroke" /><circle cx="274" cy="12" r="3.5" fill="#d95545" /></motion.svg><div className="absolute bottom-0 left-14 right-0 flex justify-between text-xs text-stone-500"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span></div></div> }
function Toast({ message, onClose }: { message: string; onClose: () => void }) { return <motion.div role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className="fixed inset-x-4 bottom-4 z-[70] flex items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-paper shadow-float sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-sm"><CheckCircle2 className="h-5 w-5 shrink-0 text-forest-300" /><span className="flex-1">{message}</span><button onClick={onClose} aria-label="Close notification" className="-mr-1 rounded-md p-1 text-stone-400 hover:text-paper"><X className="h-4 w-4" /></button></motion.div> }
function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="flex items-start gap-2 rounded-lg border border-tomato-200 bg-tomato-50 px-3 py-2.5 text-sm text-tomato-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{children}</p>
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type Stat = { icon: typeof Leaf; label: string; value: string; hint?: string }

function statsForRole({ role, donorStats, ngoStats, logisticsStats, donationCount, pickupCount }: { role: Role; donorStats: DonorImpactStats; ngoStats: NgoStats; logisticsStats: LogisticsStats; donationCount: number; pickupCount: number }): Stat[] {
  if (role === 'ngo') {
    return [
      { icon: PackageCheck, label: 'Available donations', value: String(ngoStats.availableDonationCount) },
      { icon: Check, label: 'Claimed donations', value: String(ngoStats.claimedDonationCount) },
      { icon: ClipboardList, label: 'Active requirements', value: String(ngoStats.activeRequirementCount) },
      { icon: Truck, label: 'Incoming pickups', value: String(ngoStats.incomingPickupCount) },
    ]
  }
  if (role === 'logistics') {
    return [
      { icon: Truck, label: 'Assigned pickups', value: String(logisticsStats.assignedPickupCount) },
      { icon: Activity, label: 'Active deliveries', value: String(logisticsStats.activeDeliveryCount) },
      { icon: CheckCircle2, label: 'Completed deliveries', value: String(logisticsStats.completedDeliveryCount) },
    ]
  }
  if (role === 'volunteer') {
    return [
      { icon: Truck, label: 'Assigned pickups', value: String(logisticsStats.assignedPickupCount) },
      { icon: Activity, label: 'Active pickup', value: String(logisticsStats.activeDeliveryCount) },
      { icon: CheckCircle2, label: 'Completed pickups', value: String(logisticsStats.completedDeliveryCount) },
    ]
  }
  if (role === 'admin') {
    return [
      { icon: PackageCheck, label: 'Total donations', value: String(donationCount) },
      { icon: Truck, label: 'Total pickups', value: String(pickupCount) },
    ]
  }
  return [
    { icon: Leaf, label: 'Food diverted', value: `${donorStats.totalKgDiverted} kg` },
    { icon: PackageCheck, label: 'Active donations', value: String(donorStats.activeDonationCount) },
    { icon: Truck, label: 'Completed pickups', value: String(donorStats.completedPickupCount) },
    { icon: Activity, label: 'CO₂ avoided', value: `${donorStats.estimatedCo2AvoidedKg} kg`, hint: 'Estimate' },
  ]
}

// One surface divided by hairlines rather than a row of identical cards.
function StatStrip({ stats }: { stats: Stat[] }) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[stats.length as 2 | 3 | 4] ?? 'grid-cols-2'
  return <dl className={`grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 ${cols}`}>
    {stats.map(({ icon: Icon, label, value, hint }) => <div key={label} className="bg-white px-4 py-4 sm:px-5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-600 sm:text-[13px]"><Icon className="h-3.5 w-3.5 shrink-0 text-forest-600" aria-hidden />{label}</dt>
      <dd className="mt-2 font-display text-2xl font-medium tracking-tight text-ink tabular-nums sm:text-[1.75rem]"><AnimatedNumber value={value} />{hint && <span className="mt-0.5 block font-sans text-[11px] font-medium tracking-normal text-stone-500">{hint}</span>}</dd>
    </div>)}
  </dl>
}

const ROLE_INTRO: Record<Role, string> = {
  donor: 'Surplus you list here is scored against nearby organizations and tracked until it is delivered.',
  ngo: 'Donations that fit your requirements, and the pickups heading your way.',
  logistics: 'Pickups waiting for a partner, and the deliveries you are responsible for.',
  volunteer: 'The collections assigned to you, from pickup to hand-over.',
  admin: 'Donations and pickups across every organization on FoodBridge.',
}

const ROLE_STEPS: Record<Role, string[]> = {
  donor: ['List surplus food with an accurate expiry time.', 'FoodBridge scores nearby organizations against it.', 'An organization accepts, and a logistics partner and volunteer collect it.'],
  ngo: ['Keep your requirements current.', 'Review recommended matches — accepting one claims the donation.', 'Track the pickup until it arrives.'],
  logistics: ['Accept a scheduled pickup from the Pickups view.', 'Assign a volunteer to carry it out.', 'Follow it through to delivery.'],
  volunteer: ['Check My Pickups for collections assigned to you.', 'Mark a pickup in transit once the food is collected.', 'Mark it delivered at hand-over.'],
  admin: ['Monitor donations as they are listed.', 'Watch pickups move through the lifecycle.', 'Review organizations and accounts.'],
}

const PRIMARY_ACTION: Partial<Record<Role, { label: string; view: View; icon: typeof Plus }>> = {
  donor: { label: 'New donation', view: 'Donations', icon: Plus },
  ngo: { label: 'Manage requirements', view: 'Requirements', icon: ClipboardList },
}

function OrganizationOnboardingCard({ notify }: { notify: (text: string, view: View) => void }) {
  const router = useRouter()
  const { createOrganization } = useDashboardActions()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [dailyCapacityKg, setDailyCapacityKg] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError('')
    if (isPending) return
    if (!name.trim()) { setError('Please enter your organization name.'); return }
    if (!address.trim()) { setError('Please enter your organization address.'); return }
    const parsedCapacity = dailyCapacityKg.trim() ? Number(dailyCapacityKg) : undefined
    if (parsedCapacity !== undefined && !Number.isFinite(parsedCapacity)) { setError('Daily capacity must be a valid number.'); return }
    const parsedLatitude = latitude.trim() ? Number(latitude) : undefined
    const parsedLongitude = longitude.trim() ? Number(longitude) : undefined
    if ((parsedLatitude !== undefined && !Number.isFinite(parsedLatitude)) || (parsedLongitude !== undefined && !Number.isFinite(parsedLongitude))) {
      setError('Latitude and longitude must be valid numbers.')
      return
    }
    startTransition(async () => {
      const result = await createOrganization({
        name: name.trim(),
        description: description.trim() || undefined,
        address: address.trim(),
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        daily_capacity_kg: parsedCapacity,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
      })
      if (!result.success) { setError(result.error); return }
      notify('Organization created', 'Overview')
      router.refresh()
    })
  }

  return <div className={`mx-auto max-w-xl p-6 sm:p-8 ${surface}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-600">One-time setup</p>
    <h2 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink">Set up your organization</h2>
    <p className="mt-2 text-sm leading-6 text-stone-600">You need an organization profile before you can publish requirements and receive matches.</p>
    <div className="mt-6 space-y-4">
      <label className={labelClass}>Organization name <span className="text-tomato-600" aria-hidden>*</span><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hope Foundation" required className={inputClass} /></label>
      <label className={labelClass}>Description <span className="font-normal text-stone-500">(optional)</span><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does your organization do?" rows={2} className={`${inputClass} resize-none`} /></label>
      <label className={labelClass}>Address <span className="text-tomato-600" aria-hidden>*</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City" required className={inputClass} /></label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>Contact email <span className="font-normal text-stone-500">(optional)</span><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" placeholder="contact@org.com" className={inputClass} /></label>
        <label className={labelClass}>Contact phone <span className="font-normal text-stone-500">(optional)</span><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 555 0100" className={inputClass} /></label>
      </div>
      <label className={labelClass}>Daily capacity in kg <span className="font-normal text-stone-500">(optional)</span><input value={dailyCapacityKg} onChange={e => setDailyCapacityKg(e.target.value)} inputMode="decimal" placeholder="150" className={inputClass} /></label>
      <fieldset>
        <legend className={labelClass}>Location <span className="font-normal text-stone-500">(optional)</span></legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-stone-600">Latitude<input value={latitude} onChange={e => setLatitude(e.target.value)} inputMode="decimal" placeholder="e.g. 40.7128" className={inputClass} /></label>
          <label className="block text-xs text-stone-600">Longitude<input value={longitude} onChange={e => setLongitude(e.target.value)} inputMode="decimal" placeholder="e.g. -74.0060" className={inputClass} /></label>
        </div>
        <p className="mt-2 text-xs text-stone-600">Coordinates enable real distance scoring to nearby donors.</p>
      </fieldset>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button onClick={handleSubmit} disabled={isPending} className={`${btnPrimary} w-full`}>{isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isPending ? 'Setting up...' : 'Set up organization'}</button>
    </div>
  </div>
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end">
    <div className="min-w-0">
      <p suppressHydrationWarning className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-forest-600">{eyebrow}</p>
      <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-ink sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
  </div>
}

function Overview({
  role, donations, donationsError, pickups, pickupsError, matches, donorStats, ngoStats, logisticsStats, displayName, go, notify, showOrganizationOnboarding,
}: {
  role: Role; donations: Donation[]; donationsError?: string | null; pickups: Pickup[]; pickupsError?: string | null; matches: Match[]
  donorStats: DonorImpactStats; ngoStats: NgoStats; logisticsStats: LogisticsStats; displayName: string
  go: (view: View) => void; notify: (text: string, view: View) => void; showOrganizationOnboarding?: boolean
}) {
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const activePickups = pickups.filter((p) => p.statusValue === 'driver_assigned' || p.statusValue === 'in_transit')
  const showsPickupsPanel = role === 'logistics' || role === 'volunteer'
  const primary = PRIMARY_ACTION[role]

  if (role === 'ngo' && showOrganizationOnboarding) {
    return <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageHeader eyebrow={today} title={`Welcome, ${displayName}`} />
      <OrganizationOnboardingCard notify={notify} />
    </main>
  }

  const task = getPriorityTask(role, { donations, pickups, matches })
  const featured = pickFeaturedJourney(pickups, donations)
  const stats = statsForRole({ role, donorStats, ngoStats, logisticsStats, donationCount: donations.length, pickupCount: pickups.length })

  return <motion.main variants={STAGGER_PARENT} initial="hidden" animate="show" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
    <motion.div variants={STAGGER_CHILD}>
      <PageHeader
        eyebrow={today}
        title={`Welcome back, ${displayName}`}
        description={ROLE_INTRO[role]}
        actions={primary && <button onClick={() => go(primary.view)} className={btnPrimary}><primary.icon className="h-4 w-4" />{primary.label}</button>}
      />
    </motion.div>

    <motion.div variants={STAGGER_CHILD} className="mb-5"><StatStrip stats={stats} /></motion.div>

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      {/* The single most important thing to do next. */}
      <motion.section variants={STAGGER_CHILD} aria-labelledby="next-task" className={`flex flex-col justify-between rounded-xl p-5 sm:p-6 ${task.urgency === 'action' ? 'bg-forest-800 text-paper' : 'border border-stone-200 bg-sage-50 text-ink'}`}>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${task.urgency === 'action' ? 'text-forest-200' : 'text-forest-600'}`}>{task.urgency === 'action' ? 'Needs your attention' : 'Up next'}</p>
          <h2 id="next-task" className="mt-3 font-display text-xl font-medium leading-snug tracking-tight sm:text-2xl">{task.title}</h2>
          <p className={`mt-2 text-sm leading-6 ${task.urgency === 'action' ? 'text-forest-100' : 'text-stone-700'}`}>{task.detail}</p>
        </div>
        <button onClick={() => go(task.view)} className={`group mt-5 inline-flex min-h-10 items-center gap-2 self-start rounded-lg px-4 text-sm font-semibold transition active:scale-[.98] ${task.urgency === 'action' ? 'bg-paper text-forest-900 hover:bg-white' : 'bg-forest-700 text-paper hover:bg-forest-800'}`}>{task.actionLabel}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></button>
      </motion.section>

      <motion.div variants={STAGGER_CHILD}>
        <section aria-labelledby="journey-heading" className={`h-full p-5 sm:p-6 ${surface}`}>
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="journey-heading" className="text-base font-semibold tracking-tight text-ink">Food journey</h2>
            {featured && <p className="min-w-0 truncate text-sm text-stone-600"><span className="font-medium text-ink">{featured.title}</span> · {featured.subtitle}</p>}
          </div>
          {featured
            ? <FoodJourney key={featured.id} journey={featured.journey} label={`Journey for ${featured.title}`} />
            : <p className="text-sm leading-6 text-stone-600">{role === 'donor' ? 'Once you list a donation, you can follow it here from match to delivery.' : 'Nothing is moving yet. When a donation is claimed, its journey appears here.'}</p>}
        </section>
      </motion.div>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <motion.section variants={STAGGER_CHILD} className={`p-5 sm:p-6 ${surface}`}>
        <SectionTitle title={showsPickupsPanel ? 'Active pickups' : 'Recent donations'} action={showsPickupsPanel ? 'All pickups' : 'All donations'} onAction={() => go(showsPickupsPanel ? (role === 'volunteer' ? 'My Pickups' : 'Pickups') : 'Donations')} />
        {showsPickupsPanel ? (
          pickupsError ? <ErrorNote>We couldn&apos;t load your pickups right now. Please refresh the page.</ErrorNote>
            : activePickups.length ? <PickupList pickups={activePickups} /> : <EmptyState icon={Truck} title={role === 'volunteer' ? 'No pickups assigned yet' : 'No active deliveries'} description={role === 'volunteer' ? 'When a logistics partner assigns a collection to you, it shows up here.' : 'Accept a scheduled pickup and it will appear here while it is on the move.'} action={role === 'logistics' ? { label: 'Find pickups', onClick: () => go('Pickups'), icon: ArrowRight } : undefined} />
        ) : (
          donationsError ? <ErrorNote>We couldn&apos;t load your donations right now. Please refresh the page.</ErrorNote>
            : donations.length ? <DonationList donations={donations.slice(0, 5)} onSelect={() => go('Donations')} /> : <EmptyState icon={PackagePlus} title={role === 'donor' ? 'No donations yet' : 'No donations to show'} description={role === 'donor' ? 'List your first surplus and FoodBridge will find organizations that can use it.' : role === 'ngo' ? 'Donations that match your requirements will appear here.' : 'Donations appear here as donors list them.'} action={role === 'donor' ? { label: 'New donation', onClick: () => go('Donations') } : undefined} />
        )}
      </motion.section>
      <motion.section variants={STAGGER_CHILD} className="rounded-xl border border-dashed border-stone-300 p-5 sm:p-6">
        <SectionTitle eyebrow="How it works" title={role === 'admin' ? 'Your role' : 'Your part in the journey'} />
        <ol className="space-y-3">
          {ROLE_STEPS[role].map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-stone-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-300 font-display text-xs text-forest-700 tabular-nums">{index + 1}</span>{step}</li>)}
        </ol>
      </motion.section>
    </div>
  </motion.main>
}

function DonationList({ donations, onSelect, onDeleteRequest, canDelete }: { donations: Donation[]; onSelect: (d: Donation) => void; onDeleteRequest?: (d: Donation) => void; canDelete?: boolean }) {
  return <ul className="-my-1 divide-y divide-stone-100">{donations.map((item, index) => <motion.li key={item.id} layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * .03, duration: DURATION.base, ease: EASE_OUT }} className="flex items-center justify-between gap-3 py-3">
    <button onClick={() => onSelect(item)} className="group min-w-0 flex-1 rounded-md text-left">
      <p className="truncate text-sm font-semibold text-ink group-hover:text-forest-700">{item.name}</p>
      <p className="mt-0.5 truncate text-xs text-stone-600"><span className="tabular-nums">{item.amount}</span> · {item.org} · {item.date}</p>
    </button>
    <div className="flex shrink-0 items-center gap-2">
      <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
      {canDelete && item.statusValue === 'available' && <button onClick={() => onDeleteRequest?.(item)} aria-label={`Delete ${item.name}`} className={btnSmallDanger}><Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Delete</span></button>}
    </div>
  </motion.li>)}</ul>
}
function PickupList({ pickups }: { pickups: Pickup[] }) { return <ul className="-my-1 divide-y divide-stone-100">{pickups.map((item, index) => <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * .03, duration: DURATION.base, ease: EASE_OUT }} key={item.id} className="py-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{item.title}</p><p className="mt-0.5 truncate text-xs text-stone-600">{item.organizationName} · {item.scheduledAt}</p></div><StatusBadge tone={item.tone}>{item.status}</StatusBadge></div><div className="mt-3"><JourneyTrack journey={getPickupJourney(item)} /></div></motion.li>)}</ul> }

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

function DonationsView({ role, donations, donationsError, notify, go }: { role: Role; donations: Donation[]; donationsError?: string | null; notify: (text: string, view: View) => void; go: (view: View) => void }) {
  const router = useRouter()
  const { createDonation, deleteDonation } = useDashboardActions()
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [foodCategory, setFoodCategory] = useState<string>(FOOD_CATEGORIES[0])
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryTime, setExpiryTime] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const [deletingDonation, setDeletingDonation] = useState<Donation | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [isDeletePending, startDeleteTransition] = useTransition()

  const todayDateString = new Date().toISOString().slice(0, 10)

  function resetForm() {
    setTitle(''); setFoodCategory(FOOD_CATEGORIES[0]); setQuantity(''); setExpiryDate(''); setExpiryTime(''); setPickupAddress(''); setLatitude(''); setLongitude(''); setDescription(''); setError('')
  }

  function handleDeleteDialogChange(open: boolean) {
    if (!open) { setDeletingDonation(null); setDeleteError('') }
  }

  function handleDeleteConfirm() {
    if (!deletingDonation) return
    setDeleteError('')
    startDeleteTransition(async () => {
      const result = await deleteDonation({ donationId: deletingDonation.id })
      if (!result.success) {
        setDeleteError(result.error)
        return
      }
      setDeletingDonation(null)
      notify('Donation deleted', 'Donations')
      router.refresh()
    })
  }

  // Two native inputs (date + time) rather than one <input type="datetime-local">:
  // that single-control widget returns an empty .value whenever either of its
  // two internal segments is incomplete — e.g. a user fills only the time
  // segment — while still visually rendering the filled segment next to an
  // empty "dd/mm/yyyy" placeholder for the other, which reads as "I filled
  // this in" even though the submitted value is blank. Two separate,
  // independently-labeled inputs make each field's empty state unambiguous.
  function buildExpiryIso(): string | null {
    if (!expiryDate || !expiryTime) return null
    const combined = new Date(`${expiryDate}T${expiryTime}`)
    if (Number.isNaN(combined.getTime())) return null
    return combined.toISOString()
  }

  function handleCreate() {
    setError('')
    if (!title.trim()) {
      setError('Please enter a food title.')
      return
    }
    if (!foodCategory.trim()) {
      setError('Please select a food category.')
      return
    }
    const parsedQuantity = Number(quantity)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Please enter a valid quantity.')
      return
    }
    if (!expiryDate || !expiryTime) {
      setError('Please select both an expiry date and time.')
      return
    }
    const expiryIso = buildExpiryIso()
    if (!expiryIso) {
      setError('Please enter a valid expiry date and time.')
      return
    }
    if (new Date(expiryIso).getTime() <= Date.now()) {
      setError(EXPIRY_FUTURE_MESSAGE)
      return
    }
    if (!pickupAddress.trim()) {
      setError('Please enter a pickup address.')
      return
    }
    const parsedLatitude = latitude.trim() ? Number(latitude) : undefined
    const parsedLongitude = longitude.trim() ? Number(longitude) : undefined
    if ((parsedLatitude !== undefined && !Number.isFinite(parsedLatitude)) || (parsedLongitude !== undefined && !Number.isFinite(parsedLongitude))) {
      setError('Latitude and longitude must be valid numbers.')
      return
    }
    startTransition(async () => {
      const result = await createDonation({
        title,
        description: description.trim() || undefined,
        food_category: foodCategory,
        quantity: parsedQuantity,
        unit: 'kg',
        expires_at: expiryIso,
        pickup_address: pickupAddress,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setFormOpen(false)
      resetForm()
      notify('Donation created and ready for matching', 'Donations')
      router.refresh()
    })
  }

  return <PageFrame
    eyebrow="Workspace"
    title="Donations"
    description={role === 'donor' ? 'Everything you have listed, from awaiting a match to delivered.' : 'Donations visible to your workspace and where each one stands.'}
    actions={<button onClick={() => setFormOpen(true)} className={btnPrimary}><Plus className="h-4 w-4" />New donation</button>}
  >
    <section className={`p-4 sm:p-6 ${surface}`} aria-label="Donations">
      {!donationsError && donations.length > 0 && <p className="mb-2 text-xs font-medium text-stone-600 tabular-nums">{donations.length} {donations.length === 1 ? 'donation' : 'donations'}</p>}
      {donationsError ? <ErrorNote>We couldn&apos;t load your donations right now. Please refresh the page.</ErrorNote> : donations.length ? <DonationList donations={donations} onSelect={() => go('Matches')} onDeleteRequest={(d) => setDeletingDonation(d)} canDelete={role === 'donor'} /> : <EmptyState icon={PackagePlus} title={role === 'donor' ? 'Nothing listed yet' : 'No donations to show'} description={role === 'donor' ? 'Bakery leftovers, unsold produce, catering trays — list it with an expiry time and FoodBridge finds who can use it.' : 'Donations appear here once donors list surplus food.'} action={role === 'donor' ? { label: 'List your first donation', onClick: () => setFormOpen(true) } : undefined} />}
    </section>
    <AnimatePresence>{formOpen && <Modal title="New donation" description="Describe what you have. Recommended organizations are scored as soon as you save it." onClose={() => setFormOpen(false)}>
      <div className="space-y-4">
        <label className={labelClass}>What food is it?<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fresh vegetables" className={inputClass} /></label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr]">
          <label className={labelClass}>Category<select value={foodCategory} onChange={e => setFoodCategory(e.target.value)} className={inputClass}>{FOOD_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
          <label className={labelClass}>Amount (kg)<input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" placeholder="40" className={inputClass} /></label>
        </div>
        <label className={labelClass}>Notes for the organization <span className="font-normal text-stone-500">(optional)</span><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Packaging, allergens, storage…" rows={2} className={`${inputClass} resize-none`} /></label>
        <fieldset>
          <legend className={labelClass}>Available until</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            <div><p className="mb-1 text-xs text-stone-600">Date</p><ExpiryDatePicker value={expiryDate} onChange={setExpiryDate} min={todayDateString} ariaLabel="Expiry date" /></div>
            <div><p className="mb-1 text-xs text-stone-600">Time</p><input type="time" value={expiryTime} onChange={e => setExpiryTime(e.target.value)} aria-label="Expiry time" className={`${inputClass} mt-0`} /></div>
          </div>
        </fieldset>
        <label className={labelClass}>Pickup address<input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="123 Main St" className={inputClass} /></label>
        <fieldset>
          <legend className={labelClass}>Location <span className="font-normal text-stone-500">(optional)</span></legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-stone-600">Latitude<input value={latitude} onChange={e => setLatitude(e.target.value)} inputMode="decimal" placeholder="e.g. 40.7128" className={inputClass} /></label>
            <label className="block text-xs text-stone-600">Longitude<input value={longitude} onChange={e => setLongitude(e.target.value)} inputMode="decimal" placeholder="e.g. -74.0060" className={inputClass} /></label>
          </div>
          <p className="mt-2 text-xs text-stone-600">Coordinates enable real distance scoring to nearby organizations.</p>
        </fieldset>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => setFormOpen(false)} className={btnSecondary}>Cancel</button>
        <button onClick={handleCreate} disabled={isPending} className={btnPrimary}>{isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isPending ? 'Creating...' : 'Create donation'}</button>
      </div>
    </Modal>}</AnimatePresence>
    <AlertDialog.Root open={deletingDonation !== null} onOpenChange={handleDeleteDialogChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[70] bg-ink/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-float outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[.97] data-ending-style:opacity-0 data-starting-style:scale-[.97] data-starting-style:opacity-0 [color-scheme:light]">
          <AlertDialog.Title className="font-display text-xl font-medium text-ink">Delete donation?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-stone-600">&quot;{deletingDonation?.name}&quot; will be removed and organizations will no longer see it. This can&apos;t be undone.</AlertDialog.Description>
          {deleteError && <div className="mt-3"><ErrorNote>{deleteError}</ErrorNote></div>}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Close disabled={isDeletePending} className={btnSecondary}>Cancel</AlertDialog.Close>
            <button onClick={handleDeleteConfirm} disabled={isDeletePending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-tomato-600 px-4 text-sm font-semibold text-white transition hover:bg-tomato-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60">{isDeletePending && <Loader2 className="h-4 w-4 animate-spin" />}{isDeletePending ? 'Deleting...' : 'Delete donation'}</button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

function RequirementRow({ req, onToggle, onDelete, isPending }: { req: NgoRequirementRow; onToggle: () => void; onDelete: () => void; isPending: boolean }) {
  const urgencyTone: Tone = req.urgency_level === 'critical' || req.urgency_level === 'high' ? 'rose' : req.urgency_level === 'medium' ? 'amber' : 'slate'
  return <motion.li layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between ${req.is_active ? '' : 'opacity-70'}`}>
    <div className="min-w-0">
      <p className="font-semibold text-ink">{req.food_categories.length ? req.food_categories.join(', ') : 'Any category'}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600"><span className="tabular-nums">{req.daily_capacity_kg} kg/day</span><StatusBadge tone={urgencyTone}>{req.urgency_level} urgency</StatusBadge><StatusBadge tone={req.is_active ? 'green' : 'slate'}>{req.is_active ? 'Active' : 'Paused'}</StatusBadge></p>
    </div>
    <div className="flex shrink-0 gap-2">
      <button disabled={isPending} onClick={onToggle} className={btnSmallSecondary}>{req.is_active ? 'Pause' : 'Activate'}</button>
      <button disabled={isPending} onClick={onDelete} className={btnSmallDanger}><Trash2 className="h-3.5 w-3.5" />Delete</button>
    </div>
  </motion.li>
}

function RequirementsView({ requirements, requirementsError, hasOrganization, showOrganizationOnboarding, notify }: { requirements: NgoRequirementRow[]; requirementsError?: string | null; hasOrganization: boolean; showOrganizationOnboarding?: boolean; notify: (text: string, view: View) => void }) {
  const router = useRouter()
  const { createRequirement, updateRequirement, deleteRequirement } = useDashboardActions()
  const [formOpen, setFormOpen] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [capacity, setCapacity] = useState('')
  const [urgency, setUrgency] = useState<(typeof URGENCY_LEVELS)[number]>('medium')
  const [minQty, setMinQty] = useState('')
  const [maxQty, setMaxQty] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function toggleCategory(category: string) {
    setCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]))
  }

  function handleCreate() {
    setError('')
    const parsedCapacity = Number(capacity)
    if (categories.length === 0 || !Number.isFinite(parsedCapacity) || parsedCapacity < 0) {
      setError('Select at least one food category and a valid daily capacity.')
      return
    }
    startTransition(async () => {
      const result = await createRequirement({
        food_categories: categories,
        daily_capacity_kg: parsedCapacity,
        urgency_level: urgency,
        dietary_requirements: [],
        preferred_quantity_min: minQty ? Number(minQty) : 0,
        preferred_quantity_max: maxQty ? Number(maxQty) : undefined,
        is_active: true,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setFormOpen(false)
      setCategories([]); setCapacity(''); setUrgency('medium'); setMinQty(''); setMaxQty('')
      notify('Requirement saved', 'Requirements')
      router.refresh()
    })
  }

  function handleToggle(req: NgoRequirementRow) {
    startTransition(async () => {
      await updateRequirement(req.id, {
        food_categories: req.food_categories,
        daily_capacity_kg: req.daily_capacity_kg,
        urgency_level: req.urgency_level,
        dietary_requirements: req.dietary_requirements,
        preferred_quantity_min: req.preferred_quantity_min ?? 0,
        preferred_quantity_max: req.preferred_quantity_max ?? undefined,
        is_active: !req.is_active,
      })
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteRequirement(id)
      notify('Requirement removed', 'Requirements')
      router.refresh()
    })
  }

  const description = 'What your organization can accept. New donations are scored against every active requirement.'

  if (!hasOrganization) {
    return <PageFrame eyebrow="Organization" title="Requirements" description={description}>
      {showOrganizationOnboarding
        ? <OrganizationOnboardingCard notify={notify} />
        : <EmptyState icon={Users} title="No organization linked" description="Your account isn't linked to an organization yet. Ask an administrator to connect you before configuring requirements." />}
    </PageFrame>
  }

  return <PageFrame eyebrow="Organization" title="Requirements" description={description} actions={<button onClick={() => setFormOpen(true)} className={btnPrimary}><Plus className="h-4 w-4" />New requirement</button>}>
    {requirementsError ? <ErrorNote>We couldn&apos;t load your requirements right now. Please refresh the page.</ErrorNote>
      : requirements.length === 0 ? <EmptyState icon={ClipboardList} title="No requirements yet" description="Tell donors what you can use — categories, daily capacity and urgency — and matching starts with the next donation." action={{ label: 'Add a requirement', onClick: () => setFormOpen(true) }} />
      : <section className={`px-4 sm:px-6 ${surface}`} aria-label="Requirements"><ul className="divide-y divide-stone-100">{requirements.map((req) => <RequirementRow key={req.id} req={req} isPending={isPending} onToggle={() => handleToggle(req)} onDelete={() => handleDelete(req.id)} />)}</ul></section>}
    <AnimatePresence>{formOpen && <Modal title="New requirement" description="What can your organization accept? Matching uses these to score every new donation." onClose={() => setFormOpen(false)}>
      <fieldset>
        <legend className={labelClass}>Food categories</legend>
        <div className="mt-2 flex flex-wrap gap-2">{FOOD_CATEGORIES.map((category) => {
          const selected = categories.includes(category)
          return <button type="button" key={category} aria-pressed={selected} onClick={() => toggleCategory(category)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition active:scale-[.97] ${selected ? 'border-forest-700 bg-forest-700 text-paper' : 'border-stone-300 bg-white text-stone-700 hover:border-forest-400'}`}>{selected && <Check className="h-3 w-3" />}{category}</button>
        })}</div>
      </fieldset>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>Daily capacity (kg)<input value={capacity} onChange={e => setCapacity(e.target.value)} inputMode="decimal" placeholder="150" className={inputClass} /></label>
        <label className={labelClass}>Urgency<select value={urgency} onChange={e => setUrgency(e.target.value as typeof urgency)} className={`${inputClass} capitalize`}>{URGENCY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className={labelClass}>Min quantity<input value={minQty} onChange={e => setMinQty(e.target.value)} inputMode="decimal" placeholder="0" className={inputClass} /></label>
        <label className={labelClass}>Max quantity<input value={maxQty} onChange={e => setMaxQty(e.target.value)} inputMode="decimal" placeholder="Optional" className={inputClass} /></label>
      </div>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => setFormOpen(false)} className={btnSecondary}>Cancel</button>
        <button onClick={handleCreate} disabled={isPending} className={btnPrimary}>{isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isPending ? 'Saving...' : 'Save requirement'}</button>
      </div>
    </Modal>}</AnimatePresence>
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------

function PickupRow({
  pickup, role, isPending, onAccept, onAdvance, volunteers, onAssignVolunteer, isAssigningVolunteer,
}: {
  pickup: Pickup; role: Role; isPending: boolean; onAccept: () => void; onAdvance: (status: 'in_transit' | 'completed') => void
  volunteers?: { id: string; fullName: string }[]; onAssignVolunteer?: (volunteerId: string) => void; isAssigningVolunteer?: boolean
}) {
  const [selectedVolunteer, setSelectedVolunteer] = useState('')
  const canAccept = role === 'logistics' && pickup.statusValue === 'scheduled' && !pickup.isAssignedToMe
  const canAdvance = (role === 'logistics' || role === 'volunteer') && pickup.isAssignedToMe && (pickup.statusValue === 'driver_assigned' || pickup.statusValue === 'in_transit')
  const nextStatus: 'in_transit' | 'completed' | null = pickup.statusValue === 'driver_assigned' ? 'in_transit' : pickup.statusValue === 'in_transit' ? 'completed' : null
  const nextLabel = nextStatus === 'in_transit' ? 'Mark in transit' : nextStatus === 'completed' ? 'Mark delivered' : null
  const canAssignVolunteerHere =
    role === 'logistics' && pickup.isAssignedToMe && !pickup.hasVolunteerAssigned &&
    pickup.statusValue !== 'completed' && pickup.statusValue !== 'cancelled' && pickup.statusValue !== 'failed'
  const volunteerSelectId = useId()

  return <motion.article layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className={`flex flex-col p-5 transition-shadow hover:shadow-lift ${surface}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="truncate font-semibold text-ink">{pickup.title}</h3><p className="mt-0.5 truncate text-sm text-stone-600">For {pickup.organizationName}</p></div>
      <StatusBadge tone={pickup.tone}>{pickup.status}</StatusBadge>
    </div>
    <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-600"><Clock3 className="h-3.5 w-3.5" aria-hidden />Scheduled {pickup.scheduledAt}</p>
    <div className="mt-4"><JourneyTrack journey={getPickupJourney(pickup)} /></div>
    {(canAccept || (canAdvance && nextStatus && nextLabel) || (role === 'logistics' && pickup.isAssignedToMe && pickup.hasVolunteerAssigned) || canAssignVolunteerHere) && <div className="mt-4 border-t border-stone-100 pt-4">
      {canAccept && <button disabled={isPending} onClick={onAccept} className={`${btnSmallDark} w-full`}>Accept pickup</button>}
      {canAdvance && nextStatus && nextLabel && <button disabled={isPending} onClick={() => onAdvance(nextStatus)} className={`${btnSmallPrimary} w-full`}>{nextStatus === 'in_transit' ? <Truck className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{nextLabel}</button>}
      {role === 'logistics' && pickup.isAssignedToMe && pickup.hasVolunteerAssigned && <p className={`flex items-center gap-1.5 text-xs font-medium text-forest-700 ${canAdvance ? 'mt-3' : ''}`}><CheckCircle2 className="h-3.5 w-3.5" />Volunteer assigned</p>}
      {canAssignVolunteerHere && onAssignVolunteer && (
        !volunteers || volunteers.length === 0 ? <p className={`text-xs text-stone-600 ${canAdvance ? 'mt-3' : ''}`}>No volunteers available to assign yet.</p> : (
          <div className={canAdvance ? 'mt-3' : ''}>
            <label htmlFor={volunteerSelectId} className="text-xs font-medium text-stone-700">Assign a volunteer</label>
            <div className="mt-1.5 flex gap-2">
              <select id={volunteerSelectId} value={selectedVolunteer} onChange={(e) => setSelectedVolunteer(e.target.value)} className="min-h-9 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 text-sm outline-none focus:border-forest-500 focus:ring-3 focus:ring-forest-100">
                <option value="">Choose…</option>
                {volunteers.map((v) => <option key={v.id} value={v.id}>{v.fullName}</option>)}
              </select>
              <button disabled={!selectedVolunteer || isAssigningVolunteer} onClick={() => selectedVolunteer && onAssignVolunteer(selectedVolunteer)} className={`${btnSmallDark} shrink-0`}>{isAssigningVolunteer ? 'Assigning...' : 'Assign'}</button>
            </div>
          </div>
        )
      )}
    </div>}
  </motion.article>
}

function PickupsView({ pickups, pickupsError, role, notify }: { pickups: Pickup[]; pickupsError?: string | null; role: Role; notify: (text: string, view: View) => void }) {
  const router = useRouter()
  const { acceptPickup, assignVolunteerToPickup, listAvailableVolunteers, updatePickupStatus } = useDashboardActions()
  const [isPending, startTransition] = useTransition()
  const [isAssigningVolunteer, startAssignTransition] = useTransition()
  const [actionError, setActionError] = useState('')
  const [volunteers, setVolunteers] = useState<{ id: string; fullName: string }[]>([])

  useEffect(() => {
    if (role !== 'logistics') return
    let isMounted = true
    listAvailableVolunteers().then((result) => {
      if (isMounted && result.success) setVolunteers(result.data)
    })
    return () => { isMounted = false }
  }, [role, listAvailableVolunteers])

  function handleAccept(pickupId: string) {
    setActionError('')
    startTransition(async () => {
      const result = await acceptPickup({ pickupId })
      if (!result.success) { setActionError(result.error); return }
      notify('Pickup accepted', 'Pickups')
      router.refresh()
    })
  }

  function handleAdvance(pickupId: string, status: 'in_transit' | 'completed') {
    setActionError('')
    startTransition(async () => {
      const result = await updatePickupStatus({ pickupId, status })
      if (!result.success) { setActionError(result.error); return }
      notify(`Pickup marked as ${status.replace('_', ' ')}`, 'Pickups')
      router.refresh()
    })
  }

  function handleAssignVolunteer(pickupId: string, volunteerId: string) {
    setActionError('')
    startAssignTransition(async () => {
      const result = await assignVolunteerToPickup({ pickupId, volunteerId })
      if (!result.success) { setActionError(result.error); return }
      notify('Volunteer assigned to pickup', 'Pickups')
      router.refresh()
    })
  }

  const isVolunteerView = role === 'volunteer'
  const emptyCopy: Record<Role, { title: string; description: string }> = {
    donor: { title: 'No pickups yet', description: 'When an organization accepts one of your donations, its pickup is scheduled here.' },
    ngo: { title: 'No pickups yet', description: 'Accept a recommended match and the pickup for it is scheduled here.' },
    logistics: { title: 'No pickups waiting', description: 'Pickups appear as soon as an organization claims a donation. Nothing needs collecting right now.' },
    volunteer: { title: 'No pickups assigned yet', description: 'When a logistics partner assigns a collection to you, it appears here with what to do next.' },
    admin: { title: 'No pickups yet', description: 'Pickups appear here once organizations start claiming donations.' },
  }

  return <PageFrame eyebrow={isVolunteerView ? 'Volunteer' : role === 'logistics' ? 'Logistics' : 'Workspace'} title={isVolunteerView ? 'My Pickups' : 'Pickups'} description={
    role === 'logistics' ? 'Accept open pickups, assign volunteers, and follow each delivery through.'
      : isVolunteerView ? 'Your collections. Update each one as you pick it up and hand it over.'
        : 'Where each claimed donation is on its way to the organization.'
  }>
    {actionError && <div className="mb-4"><ErrorNote>{actionError}</ErrorNote></div>}
    {pickupsError ? <ErrorNote>We couldn&apos;t load pickups right now. Please refresh the page.</ErrorNote>
      : pickups.length === 0 ? <EmptyState icon={Truck} title={emptyCopy[role].title} description={emptyCopy[role].description} />
      : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">{pickups.map((pickup) => <PickupRow key={pickup.id} pickup={pickup} role={role} isPending={isPending} onAccept={() => handleAccept(pickup.id)} onAdvance={(status) => handleAdvance(pickup.id, status)} volunteers={volunteers} onAssignVolunteer={(volunteerId) => handleAssignVolunteer(pickup.id, volunteerId)} isAssigningVolunteer={isAssigningVolunteer} />)}</div>}
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

function ScoreMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return <div>
    <div className="flex items-baseline justify-between text-xs"><span className="text-stone-600">{label}</span><span className="font-medium text-ink tabular-nums">{pct}</span></div>
    <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200" aria-hidden><motion.div className="h-full origin-left rounded-full bg-sage-400" initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ duration: DURATION.slow, ease: EASE_OUT }} /></div>
  </div>
}

function MatchCard({ match, role, isPending, onRespond }: { match: Match; role: Role; isPending: boolean; onRespond: (decision: 'accepted' | 'rejected') => void }) {
  const canRespond = role === 'ngo' && match.status === 'pending'
  return <motion.article layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className={`flex flex-col p-5 transition-shadow hover:shadow-lift ${surface}`}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><h3 className="truncate font-semibold text-ink">{match.donationTitle}</h3><p className="mt-0.5 truncate text-sm text-stone-600">{match.organizationName}{match.distanceKm !== null && <span className="tabular-nums"> · {match.distanceKm.toFixed(1)} km</span>}</p></div>
      <div className="shrink-0 text-right"><p className="font-display text-3xl font-medium leading-none text-forest-700 tabular-nums">{Math.round(match.finalScore)}<span className="text-lg text-stone-500">%</span></p><p className="mt-1 text-[11px] text-stone-600">match score</p></div>
    </div>
    <p className="mt-3 text-sm leading-6 text-stone-700">{match.explanation}</p>
    <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
      <ScoreMeter label="Semantic" value={match.semanticScore} />
      <ScoreMeter label="Distance" value={match.distanceScore} />
      <ScoreMeter label="Capacity" value={match.capacityScore} />
      <ScoreMeter label="Urgency" value={match.urgencyScore} />
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
      <StatusBadge tone={match.status === 'accepted' ? 'green' : match.status === 'rejected' ? 'rose' : match.status === 'expired' ? 'slate' : 'amber'}>{match.status}</StatusBadge>
      {canRespond && <div className="flex gap-2">
        <button disabled={isPending} onClick={() => onRespond('rejected')} className={btnSmallSecondary}>Decline</button>
        <button disabled={isPending} onClick={() => onRespond('accepted')} className={btnSmallPrimary}>{isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept match</button>
      </div>}
    </div>
  </motion.article>
}

function MatchesView({ matches, matchesError, role, notify }: { matches: Match[]; matchesError?: string | null; role: Role; notify: (text: string, view: View) => void }) {
  const router = useRouter()
  const { respondToMatch } = useDashboardActions()
  const [isPending, startTransition] = useTransition()
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  function handleRespond(matchId: string, decision: 'accepted' | 'rejected') {
    setActionError('')
    setRespondingId(matchId)
    startTransition(async () => {
      const result = await respondToMatch({ matchId, decision })
      if (!result.success) {
        setActionError(result.error)
        return
      }
      notify(decision === 'accepted' ? 'Match accepted — pickup scheduled' : 'Match declined', 'Matches')
      router.refresh()
    })
  }

  return <PageFrame eyebrow="Matching" title="Recommended matches" description="Ranked by semantic fit, distance, organization capacity and urgency — scored automatically when a donation is listed.">
    {actionError && <div className="mb-4"><ErrorNote>{actionError}</ErrorNote></div>}
    {matchesError ? <ErrorNote>We couldn&apos;t load matches right now. Please refresh the page.</ErrorNote>
      : matches.length === 0 ? <EmptyState icon={Handshake} title="No matches yet" description={role === 'ngo' ? 'Matches appear when a new donation fits one of your active requirements.' : role === 'donor' ? 'List a donation and FoodBridge scores it against every organization’s active requirements.' : 'Matches appear when donations are scored against active requirements.'} />
      : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{matches.map((match) => <MatchCard key={match.id} match={match} role={role} isPending={isPending && respondingId === match.id} onRespond={(decision) => handleRespond(match.id, decision)} />)}</div>}
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Previews and directory
// ---------------------------------------------------------------------------

function AssistantView({ notify }: { notify: (text: string, view: View) => void }) { const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hi. I can help with donation safety, partner needs, and pickup planning. What would you like to know?' }]); const [input, setInput] = useState(''); const [typing, setTyping] = useState(false); const send = (text = input) => { if (!text.trim()) return; setMessages(prev => [...prev, { role: 'user', text }]); setInput(''); setTyping(true); setTimeout(() => { setMessages(prev => [...prev, { role: 'assistant', text: text.toLowerCase().includes('rice') ? 'Cooked rice can be donated when it has been cooled quickly, stored below 5°C, and delivered within the recommended safety window. I recommend labeling the preparation time and allergen details.' : 'Based on your current network, Hope Foundation and Community Table are the strongest matches. I can help you create a donation or prepare a pickup.' }]); setTyping(false) }, 700) }; return <PageFrame eyebrow="FoodBridge AI (preview)" title="AI Assistant" description="This assistant is a design preview — it is not yet grounded in your real data."><div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"><section className={`flex min-h-[520px] flex-col ${surface}`}><div className="flex items-center justify-between border-b border-stone-100 p-4 sm:p-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-50 text-forest-700"><Sparkles className="h-4 w-4" /></div><div><p className="font-semibold">FoodBridge Copilot</p><p className="text-xs text-stone-600">Preview · canned responses</p></div></div><button onClick={() => setMessages([])} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" aria-label="Clear chat"><RefreshCw className="h-4 w-4" /></button></div><div className="flex-1 space-y-4 overflow-auto p-4 sm:p-5">{messages.map((m, i) => <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} key={i} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'ml-auto bg-ink text-paper' : 'bg-sage-50 text-stone-800'}`}>{m.text}{m.role === 'assistant' && <div className="mt-3 flex gap-3 border-t border-sage-200 pt-2 text-xs font-semibold text-forest-700"><button onClick={() => navigator.clipboard?.writeText(m.text)}><Copy className="mr-1 inline h-3 w-3" />Copy</button><button onClick={() => notify('Response marked helpful', 'AI Assistant')}>Helpful</button></div>}</motion.div>)}{typing && <div className="flex gap-1 px-4 py-3" aria-label="Assistant is typing"><i className="h-2 w-2 animate-bounce rounded-full bg-forest-500" /><i className="h-2 w-2 animate-bounce rounded-full bg-forest-500 [animation-delay:120ms]" /><i className="h-2 w-2 animate-bounce rounded-full bg-forest-500 [animation-delay:240ms]" /></div>}</div><div className="border-t border-stone-100 p-4"><div className="flex flex-wrap gap-2">{prompts.map(p => <button key={p} onClick={() => send(p)} className="hidden rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-forest-400 hover:text-forest-700 sm:block">{p}</button>)}</div><div className="mt-3 flex gap-2"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && send()} placeholder="Ask about your food recovery program..." aria-label="Message" className={`${inputClass} mt-0 min-w-0 flex-1`} /><button onClick={() => send()} className={`${btnPrimary} px-3`} aria-label="Send message"><Send className="h-4 w-4" /></button></div></div></section><section className="rounded-xl border border-dashed border-stone-300 p-5"><div className="flex items-center gap-2 text-forest-700"><BookOpen className="h-4 w-4" /><h3 className="font-semibold">Suggested sources</h3></div><p className="mt-3 text-sm leading-6 text-stone-700">Answers are prepared from your donation policies, partner requirements, and food safety guidance.</p><div className="mt-5 divide-y divide-stone-200 border-y border-stone-200">{['Food safety checklist', 'Partner intake requirements', 'Pickup preparation guide'].map(x => <button key={x} className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-stone-800 hover:text-forest-700">{x}<ExternalLink className="h-4 w-4 text-stone-500" /></button>)}</div></section></div></PageFrame> }
function AnalyticsView() { const [range, setRange] = useState('Last 30 days'); return <PageFrame eyebrow="Insights (preview)" title="Analytics" description="This view is a design preview — connect it to real aggregate queries in a follow-up pass." actions={<><div className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium"><CalendarDays className="h-4 w-4 text-stone-500" /><select value={range} onChange={e => setRange(e.target.value)} aria-label="Date range" className="bg-transparent outline-none"><option>Last 30 days</option><option>Last 90 days</option><option>This year</option></select></div><button onClick={() => alert('Analytics export is not yet connected to real data.')} className={btnSecondary}><ArrowDownToLine className="h-4 w-4" />Download report</button></>}><div className={`p-5 sm:p-6 ${surface}`}><SectionTitle eyebrow="Illustrative data" title={`Donation volume · ${range}`} /><Chart /></div></PageFrame> }
function GenericView({ view, go }: { view: View; go: (view: View) => void }) { const data: Record<string, { icon: typeof Home; title: string; description: string }> = { Organizations: { icon: Users, title: 'Partner organizations', description: 'Explore the local organizations turning surplus into meals.' }, 'Knowledge Base': { icon: FileText, title: 'Knowledge base', description: 'Keep policies, safety guidance, and partner requirements in one place.' }, Settings: { icon: Settings, title: 'Workspace settings', description: 'Manage your profile, notification preferences, and organization details.' } }; const item = data[view] ?? data.Settings; const Icon = item.icon; return <PageFrame eyebrow="Workspace (preview)" title={item.title} description={item.description}><div className="rounded-xl border border-dashed border-stone-300 px-6 py-12 text-center"><Icon className="mx-auto h-6 w-6 text-forest-600" /><h2 className="mt-4 font-display text-xl font-medium">Not connected yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">The {view.toLowerCase()} section is a preview and isn&apos;t connected to real data.</p><button onClick={() => go('Overview')} className={`${btnSecondary} mt-6`}>Back to overview</button></div></PageFrame> }
function PageFrame({ eyebrow, title, description, actions, children }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) { return <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10"><PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />{children}</main> }
function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId()
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION.fast }} className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-5 [color-scheme:light]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <motion.div role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-xl sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id={titleId} className="font-display text-xl font-medium tracking-tight text-ink">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>}</div><button onClick={onClose} className="-mr-2 -mt-1 rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-ink" aria-label="Close dialog"><X className="h-5 w-5" /></button></div>
      {children}
    </motion.div>
  </motion.div>
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function FoodBridgeDashboard({
  role = 'donor',
  donations = [],
  donationsError = null,
  pickups = [],
  pickupsError = null,
  requirements = [],
  requirementsError = null,
  matches = [],
  matchesError = null,
  hasOrganization = false,
  showOrganizationOnboarding = false,
  displayName = 'there',
  donorStats = { totalKgDiverted: 0, estimatedMeals: 0, estimatedCo2AvoidedKg: 0, activeDonationCount: 0, completedPickupCount: 0 },
  ngoStats = { availableDonationCount: 0, claimedDonationCount: 0, activeRequirementCount: 0, incomingPickupCount: 0 },
  logisticsStats = { assignedPickupCount: 0, activeDeliveryCount: 0, completedDeliveryCount: 0 },
  actions = realDashboardActions,
  demo,
  directory,
}: {
  role?: Role
  donations?: Donation[]
  donationsError?: string | null
  pickups?: Pickup[]
  pickupsError?: string | null
  requirements?: NgoRequirementRow[]
  requirementsError?: string | null
  matches?: Match[]
  matchesError?: string | null
  hasOrganization?: boolean
  showOrganizationOnboarding?: boolean
  displayName?: string
  donorStats?: DonorImpactStats
  ngoStats?: NgoStats
  logisticsStats?: LogisticsStats
  actions?: DashboardActions
  demo?: DashboardDemoChrome
  directory?: OrganizationDirectory
}) {
  const navItems = useMemo(() => getNavItems(role), [role])
  const [sidebarOpen, setSidebarOpen] = useState(false); const [active, setActive] = useState<View>('Overview'); const [notices, setNotices] = useState(initialNotices); const [showNotifications, setShowNotifications] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(''); const [toast, setToast] = useState('')
  const unread = demo ? demo.notifications.filter(n => !n.read).length : notices.filter(n => !n.read).length
  const notify = (text: string, view: View) => { setToast(text); setNotices(prev => [{ id: Date.now(), text, detail: 'FoodBridge workspace', read: false, view }, ...prev]); setTimeout(() => setToast(''), 3200) }
  const go = (view: View) => { setActive(view); setSidebarOpen(false); setShowNotifications(false); setSearchOpen(false); window.scrollTo({ top: 0 }) }
  useEffect(() => { const handler = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) } if (e.key === 'Escape') { setSearchOpen(false); setShowNotifications(false); setSidebarOpen(false) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [])
  const results = useMemo(() => [...donations.map(d => ({ label: d.name, detail: 'Donation', view: 'Donations' as View })), ...navItems.map(n => ({ label: n.label, detail: 'Page', view: n.label })), ...insightItems.map(n => ({ label: n.label, detail: 'Page', view: n.label }))].filter(x => x.label.toLowerCase().includes(query.toLowerCase())), [donations, navItems, query])
  const workspaceLabel = getWorkspaceLabel(role)

  return <MotionConfig reducedMotion="user"><DashboardActionsContext.Provider value={actions}><div className="min-h-screen bg-paper text-ink [color-scheme:light]">
    <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-stone-200 bg-[#fbfaf6] transition-transform duration-300 ease-out-soft lg:w-64 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0 shadow-float lg:shadow-none' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center justify-between px-5">
        <BrandMark subtitle={workspaceLabel} />
        <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <NavGroup title="Workspace" items={navItems} active={active} go={go} />
        <NavGroup title="Insights · preview" items={insightItems} active={active} go={go} />
      </nav>
      <div className="border-t border-stone-200 p-3"><NavButton label="Settings" icon={Settings} active={active === 'Settings'} onClick={() => go('Settings')} /></div>
    </aside>
    <AnimatePresence>{sidebarOpen && <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION.base }} className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation overlay" />}</AnimatePresence>

    <div className="lg:pl-64">
      {demo && <div role="region" aria-label="Demo controls" className="bg-forest-900 text-paper">{demo.controls}</div>}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-stone-200 bg-paper/90 px-4 backdrop-blur-md sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => setSidebarOpen(true)} className="-ml-1 rounded-lg p-2 text-stone-700 hover:bg-stone-200/60 lg:hidden" aria-label="Open navigation" aria-expanded={sidebarOpen}><Menu className="h-5 w-5" /></button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="hidden text-stone-600 sm:inline">{workspaceLabel}</span>
            <ChevronRight className="hidden h-3.5 w-3.5 text-stone-400 sm:block" aria-hidden />
            <AnimatePresence mode="wait" initial={false}><motion.span key={active} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: DURATION.fast }} aria-current="page" className="truncate font-semibold text-ink">{active}</motion.span></AnimatePresence>
          </nav>
          {demo && <span title="All data on this page is simulated and stored only in this browser tab" className="ml-1 hidden shrink-0 items-center gap-1 rounded-md bg-tomato-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-tomato-700 ring-1 ring-inset ring-tomato-200 sm:inline-flex"><FlaskConical className="h-3 w-3" />Demo</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button onClick={() => setSearchOpen(true)} className="hidden min-h-9 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-600 transition hover:border-stone-400 md:flex"><Search className="h-4 w-4" />Search<kbd className="ml-4 rounded border border-stone-200 bg-stone-50 px-1.5 font-sans text-[10px] text-stone-600">⌘K</kbd></button>
          <button onClick={() => setSearchOpen(true)} className="rounded-lg p-2.5 text-stone-700 hover:bg-stone-200/60 md:hidden" aria-label="Search"><Search className="h-5 w-5" /></button>
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative rounded-lg p-2.5 text-stone-700 hover:bg-stone-200/60" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={showNotifications}><Bell className="h-5 w-5" /><AnimatePresence>{unread > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute right-2 top-2 h-2 w-2 rounded-full bg-tomato-500 ring-2 ring-paper" />}</AnimatePresence></button>
            <AnimatePresence>{showNotifications && <motion.div initial={{ opacity: 0, y: -4, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .98 }} transition={{ duration: DURATION.fast, ease: EASE_OUT }} className="fixed inset-x-3 top-[4.25rem] origin-top-right rounded-xl border border-stone-200 bg-white p-4 shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80">{demo ? <DemoNotificationList notifications={demo.notifications} onMarkAllRead={demo.onMarkAllNotificationsRead} /> : <><div className="flex items-center justify-between"><p className="font-semibold">Notifications</p><a href="/notifications" className="text-xs font-semibold text-forest-700 hover:text-forest-900">View all</a></div><div className="mt-3 space-y-1">{notices.length ? notices.slice(0, 4).map(n => <button key={n.id} onClick={() => go(n.view)} className={`w-full rounded-lg p-3 text-left hover:bg-stone-50 ${!n.read ? 'bg-sage-50' : ''}`}><p className="text-sm font-semibold">{n.text}</p><p className="mt-0.5 text-xs text-stone-600">{n.detail}</p></button>) : <p className="py-5 text-center text-sm text-stone-600">Nothing new in this session — your full inbox has everything else.</p>}</div></>}</motion.div>}</AnimatePresence>
          </div>
          {!demo && <AccountMenu />}
        </div>
      </header>

      <AnimatePresence>{searchOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION.fast }} className="fixed inset-0 z-50 bg-ink/30 p-4 sm:p-5" onMouseDown={e => e.target === e.currentTarget && setSearchOpen(false)}><motion.div role="dialog" aria-modal="true" aria-label="Search workspace" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className="mx-auto mt-12 max-w-xl overflow-hidden rounded-xl bg-white shadow-float sm:mt-20"><div className="flex items-center gap-3 border-b border-stone-200 px-4"><Search className="h-5 w-5 text-stone-500" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search donations and pages…" aria-label="Search" className="h-14 min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-500" /><kbd className="rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-600">ESC</kbd></div><div className="max-h-80 overflow-auto p-2">{results.map(r => <button key={`${r.detail}-${r.label}`} onClick={() => go(r.view)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-sage-50"><span className="font-medium text-ink">{r.label}</span><span className="text-xs text-stone-600">{r.detail}</span></button>)}{!results.length && <p className="p-5 text-center text-sm text-stone-600">No results for &ldquo;{query}&rdquo;</p>}</div></motion.div></motion.div>}</AnimatePresence>

      <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }}>
        {active === 'Overview' && <Overview role={role} donations={donations} donationsError={donationsError} pickups={pickups} pickupsError={pickupsError} matches={matches} donorStats={donorStats} ngoStats={ngoStats} logisticsStats={logisticsStats} displayName={displayName} go={go} notify={notify} showOrganizationOnboarding={showOrganizationOnboarding} />}
        {active === 'Donations' && <DonationsView role={role} donations={donations} donationsError={donationsError} notify={notify} go={go} />}
        {active === 'Requirements' && <RequirementsView requirements={requirements} requirementsError={requirementsError} hasOrganization={hasOrganization} showOrganizationOnboarding={showOrganizationOnboarding} notify={notify} />}
        {(active === 'Pickups' || active === 'My Pickups') && <PickupsView pickups={pickups} pickupsError={pickupsError} role={role} notify={notify} />}
        {active === 'Matches' && <MatchesView matches={matches} matchesError={matchesError} role={role} notify={notify} />}
        {active === 'AI Assistant' && <AssistantView notify={notify} />}
        {active === 'Analytics' && <AnalyticsView />}
        {active === 'Organizations' && directory && <OrganizationsView directory={directory} role={role} />}
        {((active === 'Organizations' && !directory) || active === 'Knowledge Base' || active === 'Settings') && <GenericView view={active} go={go} />}
      </motion.div>
      <AnimatePresence>{toast && <Toast message={toast} onClose={() => setToast('')} />}</AnimatePresence>
    </div>
  </div></DashboardActionsContext.Provider></MotionConfig>
}
function BrandMark({ subtitle }: { subtitle?: string }) {
  return <div className="flex items-center gap-2.5">
    <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 text-paper"><Leaf className="h-4 w-4" /><span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-tomato-500 ring-2 ring-[#fbfaf6]" /></span>
    <span className="leading-tight"><span className="block font-display text-lg font-medium tracking-tight text-ink">FoodBridge</span>{subtitle && <span className="block text-[11px] font-medium text-stone-600">{subtitle}</span>}</span>
  </div>
}
function DemoNotificationList({ notifications, onMarkAllRead }: { notifications: DashboardDemoChrome['notifications']; onMarkAllRead: () => void }) {
  const hasUnread = notifications.some(n => !n.read)
  return <><div className="flex items-center justify-between"><p className="font-semibold">Notifications <span className="ml-1 rounded bg-tomato-50 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tomato-700">Simulated</span></p>{hasUnread && <button onClick={onMarkAllRead} className="text-xs font-semibold text-forest-700 hover:text-forest-900">Mark all read</button>}</div><ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">{notifications.length ? notifications.slice(0, 8).map(n => <li key={n.id} className={`rounded-lg p-3 transition-colors duration-300 ${!n.read ? 'bg-sage-50' : ''}`}><p className="flex items-start gap-2 text-sm font-semibold">{!n.read && <span aria-label="Unread" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tomato-500" />}{n.title}</p><p className="mt-0.5 text-xs leading-5 text-stone-600">{n.message}</p></li>) : <li className="py-5 text-center text-sm text-stone-600">Nothing yet for this role — actions taken in other roles show up here.</li>}</ul></>
}
function OrganizationsView({ directory, role }: { directory: OrganizationDirectory; role: Role }) {
  const title = role === 'admin' ? 'Users & organizations' : role === 'ngo' ? 'Organization details' : 'Partner organizations'
  const description = role === 'admin' ? 'Every account and organization on the platform.' : role === 'ngo' ? 'Your organization profile and the partner network.' : 'The local organizations turning surplus into meals.'
  return <PageFrame eyebrow="Network" title={title} description={description}>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{directory.organizations.map(org => <motion.article key={org.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className={`rounded-xl border bg-white p-5 ${org.isMine ? 'border-forest-300 ring-1 ring-forest-200' : 'border-stone-200'}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-display text-lg font-medium text-ink">{org.name}</h3><p className="mt-1 flex items-center gap-1 truncate text-sm text-stone-600"><MapPin className="h-3.5 w-3.5 shrink-0" />{org.address}</p></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5">{org.isMine && <StatusBadge tone="green">Yours</StatusBadge>}<StatusBadge tone="slate">{org.type}</StatusBadge></div></div>
      {org.description && <p className="mt-3 text-sm leading-6 text-stone-700">{org.description}</p>}
      <dl className="mt-4 grid grid-cols-3 divide-x divide-stone-200 border-t border-stone-100 pt-4 text-xs">
        <div className="pr-3"><dt className="text-stone-600">Capacity</dt><dd className="mt-1 font-semibold tabular-nums text-ink">{org.dailyCapacityKg} kg/day</dd></div>
        <div className="px-3"><dt className="text-stone-600">Requirements</dt><dd className="mt-1 font-semibold tabular-nums text-ink">{org.activeRequirementCount} active</dd></div>
        <div className="pl-3"><dt className="text-stone-600">Status</dt><dd className="mt-1 font-semibold text-ink">{org.isVerified ? 'Verified' : 'Unverified'}</dd></div>
      </dl>
      {org.contactEmail && <p className="mt-3 text-xs text-stone-600">{org.contactEmail}</p>}
    </motion.article>)}</div>
    {directory.users && <section className={`mt-6 p-5 sm:p-6 ${surface}`}><SectionTitle title="Users" /><ul className="divide-y divide-stone-100">{directory.users.map(u => <li key={u.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{u.fullName}</p><p className="mt-0.5 truncate text-xs text-stone-600">{u.organizationName ?? 'No organization'}</p></div><StatusBadge tone="slate">{u.role}</StatusBadge></li>)}</ul></section>}
  </PageFrame>
}
function NavButton({ label, icon: Icon, active, onClick, badge }: { label: string; icon: typeof Home; active: boolean; onClick: () => void; badge?: string }) {
  return <button onClick={onClick} aria-current={active ? 'page' : undefined} className={`relative flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors ${active ? 'text-forest-900' : 'text-stone-700 hover:bg-stone-200/50 hover:text-ink'}`}>
    {active && <motion.span layoutId="nav-active" aria-hidden className="absolute inset-0 rounded-lg bg-sage-100" transition={{ duration: DURATION.base, ease: EASE_OUT }} />}
    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-forest-700" />}
    <span className="relative flex items-center gap-3"><Icon className={`h-[18px] w-[18px] ${active ? 'text-forest-700' : 'text-stone-500'}`} />{label}</span>
    {badge && <span className="relative rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">{badge}</span>}
  </button>
}
function NavGroup({ title, items, active, go }: { title: string; items: { label: View; icon: typeof Home; count?: string; badge?: string }[]; active: View; go: (v: View) => void }) { return <div><p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</p><div className="space-y-0.5">{items.map(({ label, icon, badge }) => <NavButton key={label} label={label} icon={icon} badge={badge} active={active === label} onClick={() => go(label)} />)}</div></div> }
export function DashboardIcon({ type }: { type: string }) { const icons: Record<string, typeof Home> = { home: Home, donations: PackageCheck, matches: Users, pickups: Truck, organizations: ClipboardList, analytics: LineChart, assistant: Bot, knowledge: FileText, settings: Settings, help: CircleHelp, database: Database, clock: Clock3 }; const Icon = icons[type] || Home; return <Icon className="h-5 w-5" /> }
export function MapPlaceholder() { return <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-sage-50 text-center"><div><MapPin className="mx-auto h-8 w-8 text-forest-600" /><p className="mt-3 font-semibold text-stone-800">Partner network map</p><p className="mt-1 text-sm text-stone-600">Map provider ready for integration</p></div></div> }
export function EmptyState({ title = 'Nothing here yet', description = 'New activity will appear here when it is available.', icon: Icon = Database, action }: { title?: string; description?: string; icon?: typeof Home; action?: { label: string; onClick: () => void; icon?: typeof Home } }) {
  return <div className="rounded-xl border border-dashed border-stone-300 px-6 py-10 text-center">
    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-forest-700"><Icon className="h-5 w-5" aria-hidden /></span>
    <p className="mt-4 font-display text-lg font-medium text-ink">{title}</p>
    <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-stone-600">{description}</p>
    {action && <button onClick={action.onClick} className={`${btnPrimary} mt-5`}>{action.icon ? <action.icon className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{action.label}</button>}
  </div>
}
export function TopLevelShell() { return <FoodBridgeDashboard /> }
export default FoodBridgeDashboard
