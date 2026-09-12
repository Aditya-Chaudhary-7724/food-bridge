'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import {
  Activity, ArrowDownToLine, ArrowRight, Bell, Bot, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Copy, Database, FileText,
  Home, Leaf, LineChart, MapPin, Menu, PackageCheck,
  Plus, Search, Settings, Sparkles, Truck, Users, X, Send, RefreshCw,
  Filter, ExternalLink, AlertCircle, BookOpen, Loader2, Trash2,
} from 'lucide-react'

import AccountMenu from '@/components/account-menu'
import { ExpiryDatePicker } from '@/components/expiry-date-picker'
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

type Role = 'donor' | 'ngo' | 'volunteer' | 'logistics' | 'admin'
type View = 'Overview' | 'Donations' | 'Requirements' | 'Matches' | 'Pickups' | 'My Pickups' | 'Organizations' | 'AI Assistant' | 'Analytics' | 'Knowledge Base' | 'Settings'
type Tone = 'green' | 'blue' | 'amber' | 'slate' | 'rose'
type Donation = DonationCardModel
type Pickup = PickupCardModel
type Match = MatchCardModel
type Notice = { id: number; text: string; detail: string; read: boolean; view: View }

function getNavItems(role: Role): { label: View; icon: typeof Home; count?: string }[] {
  if (role === 'ngo') {
    return [
      { label: 'Overview', icon: Home },
      { label: 'Donations', icon: PackageCheck },
      { label: 'Requirements', icon: ClipboardList },
      { label: 'Matches', icon: Users },
      { label: 'Pickups', icon: Truck },
      { label: 'Organizations', icon: ClipboardList },
    ]
  }
  if (role === 'logistics') {
    return [
      { label: 'Overview', icon: Home },
      { label: 'Pickups', icon: Truck },
    ]
  }
  if (role === 'volunteer') {
    return [
      { label: 'Overview', icon: Home },
      { label: 'My Pickups', icon: Truck },
    ]
  }
  if (role === 'admin') {
    return [
      { label: 'Overview', icon: Home },
      { label: 'Donations', icon: PackageCheck },
      { label: 'Pickups', icon: Truck },
      { label: 'Organizations', icon: ClipboardList },
    ]
  }
  return [
    { label: 'Overview', icon: Home },
    { label: 'Donations', icon: PackageCheck },
    { label: 'Matches', icon: Users },
    { label: 'Pickups', icon: Truck },
    { label: 'Organizations', icon: ClipboardList },
  ]
}

const insightItems: { label: View; icon: typeof Home; badge?: string }[] = [
  { label: 'AI Assistant', icon: Bot, badge: 'Beta' }, { label: 'Analytics', icon: LineChart }, { label: 'Knowledge Base', icon: FileText },
]
const initialNotices: Notice[] = []
const prompts = ['Can I donate cooked rice?', 'Which partners need produce?', 'How do I prepare a safe pickup?']

function StatusBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: Tone }) {
  const styles: Record<Tone, string> = { green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', blue: 'bg-sky-50 text-sky-700 ring-sky-200', amber: 'bg-amber-50 text-amber-700 ring-amber-200', slate: 'bg-slate-100 text-slate-600 ring-slate-200', rose: 'bg-rose-50 text-rose-700 ring-rose-200' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[tone]}`}>{children}</span>
}
function SectionTitle({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">{eyebrow}</p>}<h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2></div>{action && <button onClick={onAction} className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-900">{action}<ChevronRight className="ml-1 inline h-4 w-4" /></button>}</div>
}
function AnimatedNumber({ value }: { value: string }) {
  const reduce = useReducedMotion(); const numeric = Number(value.replace(/[^0-9.]/g, ''))
  const [shown, setShown] = useState(reduce ? numeric : 0)
  useEffect(() => { if (reduce) return; let frame = 0; const start = performance.now(); const tick = (now: number) => { const p = Math.min((now - start) / 850, 1); setShown(value.includes('.') ? Math.round(numeric * (1 - Math.pow(1 - p, 3)) * 10) / 10 : Math.round(numeric * (1 - Math.pow(1 - p, 3)))); if (p < 1) frame = requestAnimationFrame(tick) }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame) }, [numeric, reduce])
  return <>{value.includes('.') ? shown.toFixed(1) : shown.toLocaleString()}{value.replace(/[0-9.,]/g, '')}</>
}
function StatCard({ icon: Icon, label, value, change, tone }: { icon: typeof Leaf; label: string; value: string; change?: string; tone: Tone }) {
  const colors = { green: 'bg-emerald-50 text-emerald-700', blue: 'bg-sky-50 text-sky-700', amber: 'bg-amber-50 text-amber-700', slate: 'bg-slate-100 text-slate-700', rose: 'bg-rose-50 text-rose-700' }
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }} transition={{ duration: .35 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="h-5 w-5" /></div>{change && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{change}</span>}</div><p className="mt-5 text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-950"><AnimatedNumber value={value} /></p></motion.div>
}
function Chart() { const points = '4,89 34,77 64,82 94,54 124,64 154,39 184,47 214,22 244,30 274,12 304,28'; return <div className="relative h-56 w-full overflow-hidden"><div className="absolute inset-0 flex flex-col justify-between text-xs text-slate-400"><span>1,200 kg</span><span>800 kg</span><span>400 kg</span><span>0 kg</span></div><motion.svg initial={{ opacity: 0, pathLength: 0 }} animate={{ opacity: 1, pathLength: 1 }} transition={{ duration: 1 }} className="absolute inset-0 ml-14 h-full w-[calc(100%-3.5rem)]" viewBox="0 0 308 100" preserveAspectRatio="none" role="img" aria-label="Monthly donation trend chart"><path d="M4,89 L34,77 L64,82 L94,54 L124,64 L154,39 L184,47 L214,22 L244,30 L274,12 L304,28 L304,100 L4,100 Z" fill="rgba(16,185,129,.10)" /><polyline points={points} fill="none" stroke="#10b981" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><circle cx="274" cy="12" r="3.5" fill="#10b981" /></motion.svg><div className="absolute bottom-0 left-14 right-0 flex justify-between text-xs text-slate-400"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span></div></div> }
function Toast({ message, onClose }: { message: string; onClose: () => void }) { return <motion.div initial={{ opacity: 0, y: 20, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-5 right-5 z-[70] flex max-w-sm items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl"><CheckCircle2 className="h-5 w-5 text-emerald-400" />{message}<button onClick={onClose} aria-label="Close toast" className="ml-2 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></motion.div> }

function StatCardsForRole({ role, donorStats, ngoStats, logisticsStats, donationCount, pickupCount }: { role: Role; donorStats: DonorImpactStats; ngoStats: NgoStats; logisticsStats: LogisticsStats; donationCount: number; pickupCount: number }) {
  if (role === 'ngo') {
    return <>
      <StatCard icon={PackageCheck} label="Available donations" value={String(ngoStats.availableDonationCount)} tone="amber" />
      <StatCard icon={Check} label="Claimed donations" value={String(ngoStats.claimedDonationCount)} tone="green" />
      <StatCard icon={ClipboardList} label="Active requirements" value={String(ngoStats.activeRequirementCount)} tone="blue" />
      <StatCard icon={Truck} label="Incoming pickups" value={String(ngoStats.incomingPickupCount)} tone="slate" />
    </>
  }
  if (role === 'logistics') {
    return <>
      <StatCard icon={Truck} label="Assigned pickups" value={String(logisticsStats.assignedPickupCount)} tone="blue" />
      <StatCard icon={Activity} label="Active deliveries" value={String(logisticsStats.activeDeliveryCount)} tone="amber" />
      <StatCard icon={CheckCircle2} label="Completed deliveries" value={String(logisticsStats.completedDeliveryCount)} tone="green" />
    </>
  }
  if (role === 'volunteer') {
    return <>
      <StatCard icon={Truck} label="Assigned pickups" value={String(logisticsStats.assignedPickupCount)} tone="blue" />
      <StatCard icon={Activity} label="Active pickup" value={String(logisticsStats.activeDeliveryCount)} tone="amber" />
      <StatCard icon={CheckCircle2} label="Completed pickups" value={String(logisticsStats.completedDeliveryCount)} tone="green" />
    </>
  }
  if (role === 'admin') {
    return <>
      <StatCard icon={PackageCheck} label="Total donations" value={String(donationCount)} tone="amber" />
      <StatCard icon={Truck} label="Total pickups" value={String(pickupCount)} tone="blue" />
    </>
  }
  return <>
    <StatCard icon={Leaf} label="Food diverted" value={`${donorStats.totalKgDiverted} kg`} tone="green" />
    <StatCard icon={PackageCheck} label="Active donations" value={String(donorStats.activeDonationCount)} tone="blue" />
    <StatCard icon={Truck} label="Completed pickups" value={String(donorStats.completedPickupCount)} tone="amber" />
    <StatCard icon={Activity} label="Est. CO₂ avoided" value={`${donorStats.estimatedCo2AvoidedKg} kg`} tone="green" />
  </>
}

function OrganizationOnboardingCard({ notify }: { notify: (text: string, view: View) => void }) {
  const router = useRouter()
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

  return <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ClipboardList className="h-6 w-6" /></div>
    <h2 className="mt-4 text-center text-xl font-bold text-slate-950">Set up your organization</h2>
    <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-slate-500">You need to set up your organization before you can configure requirements and receive matches.</p>
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-semibold">Organization name<span className="text-rose-500">*</span><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hope Foundation" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      <label className="block text-sm font-semibold">Description (optional)<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does your organization do?" rows={2} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      <label className="block text-sm font-semibold">Address<span className="text-rose-500">*</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Contact email (optional)<input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email" placeholder="contact@org.com" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
        <label className="block text-sm font-semibold">Contact phone (optional)<input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 555 0100" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      </div>
      <label className="block text-sm font-semibold">Daily capacity in kg (optional)<input value={dailyCapacityKg} onChange={e => setDailyCapacityKg(e.target.value)} inputMode="decimal" placeholder="150" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Latitude (optional)<input value={latitude} onChange={e => setLatitude(e.target.value)} inputMode="decimal" placeholder="e.g. 40.7128" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
        <label className="block text-sm font-semibold">Longitude (optional)<input value={longitude} onChange={e => setLongitude(e.target.value)} inputMode="decimal" placeholder="e.g. -74.0060" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      </div>
      <p className="text-xs text-slate-400">Adding coordinates improves match accuracy by enabling real distance scoring to nearby donors.</p>
      {error && <p className="text-sm text-rose-600"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</p>}
      <button onClick={handleSubmit} disabled={isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isPending ? 'Setting up...' : 'Set up organization'}</button>
    </div>
  </div>
}

function Overview({
  role, donations, donationsError, pickups, pickupsError, donorStats, ngoStats, logisticsStats, displayName, go, notify, showOrganizationOnboarding,
}: {
  role: Role; donations: Donation[]; donationsError?: string | null; pickups: Pickup[]; pickupsError?: string | null
  donorStats: DonorImpactStats; ngoStats: NgoStats; logisticsStats: LogisticsStats; displayName: string
  go: (view: View) => void; notify: (text: string, view: View) => void; showOrganizationOnboarding?: boolean
}) {
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())
  const activePickups = pickups.filter((p) => p.statusValue === 'driver_assigned' || p.statusValue === 'in_transit')
  const showsPickupsPanel = role === 'logistics' || role === 'volunteer'

  if (role === 'ngo' && showOrganizationOnboarding) {
    return <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-emerald-700">{today}</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Welcome, {displayName}</h1>
      </div>
      <OrganizationOnboardingCard notify={notify} />
    </main>
  }

  return <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10">
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-sm font-semibold text-emerald-700">{today}</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Good morning, {displayName}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Here&apos;s what&apos;s happening with your food recovery program today.</p>
      </div>
      {role === 'donor' && <motion.button whileTap={{ scale: .97 }} onClick={() => go('Donations')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"><Plus className="h-4 w-4" />New donation</motion.button>}
      {role === 'ngo' && <motion.button whileTap={{ scale: .97 }} onClick={() => go('Requirements')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"><Plus className="h-4 w-4" />Manage requirements</motion.button>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCardsForRole role={role} donorStats={donorStats} ngoStats={ngoStats} logisticsStats={logisticsStats} donationCount={donations.length} pickupCount={pickups.length} />
    </div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <SectionTitle title={showsPickupsPanel ? 'Active pickups' : 'Recent donations'} action={showsPickupsPanel ? 'View all pickups' : 'View all donations'} onAction={() => go(showsPickupsPanel ? (role === 'volunteer' ? 'My Pickups' : 'Pickups') : 'Donations')} />
        {showsPickupsPanel ? (
          pickupsError ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">We couldn&apos;t load your pickups right now. Please refresh the page.</p>
            : activePickups.length ? <PickupList pickups={activePickups} /> : <EmptyState title={role === 'volunteer' ? 'No pickups assigned yet' : 'No active deliveries'} description={role === 'volunteer' ? "You'll see pickups here once a logistics partner assigns one to you." : 'Accept a pickup to see it appear here.'} />
        ) : (
          donationsError ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">We couldn&apos;t load your donations right now. Please refresh the page.</p>
            : donations.length ? <DonationList donations={donations} onSelect={() => go('Donations')} /> : <EmptyState title="No donations yet" description="Create your first donation to see it appear here." />
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <SectionTitle eyebrow="Getting started" title="Next steps" />
        <div className="space-y-3 text-sm text-slate-600">
          {role === 'donor' && <>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Create a donation with an accurate expiry time so NGOs can plan pickup.</p>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Once an NGO claims your donation, track its pickup status here.</p>
          </>}
          {role === 'ngo' && <>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Configure your requirements so donors and the matching engine can find you.</p>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Claim an available donation from the Donations tab.</p>
          </>}
          {role === 'logistics' && <>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Accept a scheduled pickup from the Pickups tab.</p>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Assign a volunteer to help execute a pickup you're responsible for.</p>
          </>}
          {role === 'volunteer' && <>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />A logistics partner will assign you to a pickup — check My Pickups regularly.</p>
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Update the pickup status as you progress from pickup to delivery.</p>
          </>}
          {role === 'admin' && <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Monitor donations and pickups across the platform.</p>}
        </div>
      </section>
    </div>
  </main>
}
function DonationList({ donations, onSelect, onDeleteRequest, canDelete }: { donations: Donation[]; onSelect: (d: Donation) => void; onDeleteRequest?: (d: Donation) => void; canDelete?: boolean }) {
  return <div className="space-y-3">{donations.map((item, index) => <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .06 }} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 transition hover:bg-slate-50">
    <button onClick={() => onSelect(item)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-semibold text-slate-800">{item.name}</p><p className="mt-1 truncate text-xs text-slate-400">{item.org} · {item.amount}</p></button>
    <div className="flex shrink-0 items-center gap-2">
      <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
      {canDelete && item.statusValue === 'available' && <button onClick={() => onDeleteRequest?.(item)} aria-label={`Delete ${item.name}`} className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3 w-3" />Delete</button>}
    </div>
  </motion.div>)}</div>
}
function PickupList({ pickups }: { pickups: Pickup[] }) { return <div className="space-y-3">{pickups.map((item, index) => <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .06 }} key={item.id} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 transition hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-1 truncate text-xs text-slate-400">{item.organizationName} · {item.scheduledAt}</p></div><StatusBadge tone={item.tone}>{item.status}</StatusBadge></motion.div>)}</div> }

function DonationsView({ role, donations, donationsError, notify, go }: { role: Role; donations: Donation[]; donationsError?: string | null; notify: (text: string, view: View) => void; go: (view: View) => void }) {
  const router = useRouter()
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

  return <PageFrame eyebrow="Workspace" title="Donations" description="Create, track, and manage every recovered food donation."><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><button className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><Filter className="mr-2 inline h-4 w-4" />All donations</button></div><button onClick={() => setFormOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"><Plus className="mr-2 inline h-4 w-4" />New donation</button></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">{donationsError ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">We couldn&apos;t load your donations right now. Please refresh the page.</p> : donations.length ? <DonationList donations={donations} onSelect={() => go('Matches')} onDeleteRequest={(d) => setDeletingDonation(d)} canDelete={role === 'donor'} /> : <EmptyState title="No donations yet" description="Create your first donation and it will show up here." />}</div><AnimatePresence>{formOpen && <Modal title="Create donation" onClose={() => setFormOpen(false)}><p className="text-sm text-slate-500">Tell us what you have available. FoodBridge AI will find the best matches.</p><label className="mt-5 block text-sm font-semibold">Food details<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fresh vegetables" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label><label className="mt-4 block text-sm font-semibold">Description (optional)<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Any additional detail for the receiving organization" rows={2} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label><label className="mt-4 block text-sm font-semibold">Category<select value={foodCategory} onChange={e => setFoodCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500">{FOOD_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}</select></label><label className="mt-4 block text-sm font-semibold">Amount in kilograms<input value={quantity} onChange={e => setQuantity(e.target.value)} inputMode="decimal" placeholder="40" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label><label className="mt-4 block text-sm font-semibold">Available until<div className="mt-2 grid grid-cols-2 gap-3"><div><p className="mb-1 text-xs font-medium text-slate-400">Expiry date</p><ExpiryDatePicker value={expiryDate} onChange={setExpiryDate} min={todayDateString} ariaLabel="Expiry date" /></div><div><p className="mb-1 text-xs font-medium text-slate-400">Expiry time</p><input type="time" value={expiryTime} onChange={e => setExpiryTime(e.target.value)} aria-label="Expiry time" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></div></div></label><label className="mt-4 block text-sm font-semibold">Pickup address<input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="123 Main St" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Latitude (optional)<input value={latitude} onChange={e => setLatitude(e.target.value)} inputMode="decimal" placeholder="e.g. 40.7128" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label><label className="block text-sm font-semibold">Longitude (optional)<input value={longitude} onChange={e => setLongitude(e.target.value)} inputMode="decimal" placeholder="e.g. -74.0060" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label></div><p className="mt-2 text-xs text-slate-400">Adding coordinates improves match accuracy by enabling real distance scoring to nearby organizations.</p>{error && <p className="mt-3 text-sm text-rose-600"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</p>}<button onClick={handleCreate} disabled={isPending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isPending ? 'Creating...' : 'Create donation'}</button></Modal>}</AnimatePresence>
    <AlertDialog.Root open={deletingDonation !== null} onOpenChange={handleDeleteDialogChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-sm transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <AlertDialog.Title className="text-lg font-bold text-slate-950">Delete donation?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-slate-500">Are you sure you want to delete &quot;{deletingDonation?.name}&quot;? This action cannot be undone.</AlertDialog.Description>
          {deleteError && <p className="mt-3 text-sm text-rose-600"><AlertCircle className="mr-1 inline h-4 w-4" />{deleteError}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Close disabled={isDeletePending} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel</AlertDialog.Close>
            <button onClick={handleDeleteConfirm} disabled={isDeletePending} className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">{isDeletePending && <Loader2 className="h-4 w-4 animate-spin" />}{isDeletePending ? 'Deleting...' : 'Delete donation'}</button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </PageFrame>
}

function RequirementCard({ req, onToggle, onDelete, isPending }: { req: NgoRequirementRow; onToggle: () => void; onDelete: () => void; isPending: boolean }) {
  const urgencyTone: Tone = req.urgency_level === 'critical' || req.urgency_level === 'high' ? 'rose' : req.urgency_level === 'medium' ? 'amber' : 'slate'
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-bold text-slate-900">{req.food_categories.length ? req.food_categories.join(', ') : 'Any category'}</p>
        <p className="mt-1 text-sm text-slate-500">{req.daily_capacity_kg} kg/day capacity</p>
      </div>
      <StatusBadge tone={req.is_active ? 'green' : 'slate'}>{req.is_active ? 'Active' : 'Paused'}</StatusBadge>
    </div>
    <div className="mt-3"><StatusBadge tone={urgencyTone}>{req.urgency_level} urgency</StatusBadge></div>
    <div className="mt-4 flex gap-2">
      <button disabled={isPending} onClick={onToggle} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">{req.is_active ? 'Pause' : 'Activate'}</button>
      <button disabled={isPending} onClick={onDelete} className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"><Trash2 className="h-3 w-3" />Delete</button>
    </div>
  </motion.div>
}

function RequirementsView({ requirements, requirementsError, hasOrganization, showOrganizationOnboarding, notify }: { requirements: NgoRequirementRow[]; requirementsError?: string | null; hasOrganization: boolean; showOrganizationOnboarding?: boolean; notify: (text: string, view: View) => void }) {
  const router = useRouter()
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

  if (!hasOrganization) {
    return <PageFrame eyebrow="NGO" title="Requirements" description="Define what your organization needs so donors and the matching engine can find you.">
      {showOrganizationOnboarding
        ? <OrganizationOnboardingCard notify={notify} />
        : <EmptyState title="No organization linked" description="Your account isn't linked to an organization yet. Contact an administrator to get set up before configuring requirements." />}
    </PageFrame>
  }

  return <PageFrame eyebrow="NGO" title="Requirements" description="Define what your organization needs so donors and the matching engine can find you.">
    <div className="mb-6 flex justify-end"><button onClick={() => setFormOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"><Plus className="mr-2 inline h-4 w-4" />New requirement</button></div>
    {requirementsError ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">We couldn&apos;t load your requirements right now. Please refresh the page.</p>
      : requirements.length === 0 ? <EmptyState title="No requirements yet" description="Add your first requirement to start receiving matched donations." />
      : <div className="grid gap-4 lg:grid-cols-2">{requirements.map((req) => <RequirementCard key={req.id} req={req} isPending={isPending} onToggle={() => handleToggle(req)} onDelete={() => handleDelete(req.id)} />)}</div>}
    <AnimatePresence>{formOpen && <Modal title="New requirement" onClose={() => setFormOpen(false)}>
      <p className="text-sm text-slate-500">Tell donors and the matching engine what your organization needs.</p>
      <div className="mt-5">
        <p className="text-sm font-semibold">Food categories</p>
        <div className="mt-2 flex flex-wrap gap-2">{FOOD_CATEGORIES.map((category) => <button type="button" key={category} onClick={() => toggleCategory(category)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${categories.includes(category) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-emerald-300'}`}>{category}</button>)}</div>
      </div>
      <label className="mt-4 block text-sm font-semibold">Daily capacity (kg)<input value={capacity} onChange={e => setCapacity(e.target.value)} inputMode="decimal" placeholder="150" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      <label className="mt-4 block text-sm font-semibold">Urgency<select value={urgency} onChange={e => setUrgency(e.target.value as typeof urgency)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500">{URGENCY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">Min quantity<input value={minQty} onChange={e => setMinQty(e.target.value)} inputMode="decimal" placeholder="0" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
        <label className="block text-sm font-semibold">Max quantity<input value={maxQty} onChange={e => setMaxQty(e.target.value)} inputMode="decimal" placeholder="Optional" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" /></label>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600"><AlertCircle className="mr-1 inline h-4 w-4" />{error}</p>}
      <button onClick={handleCreate} disabled={isPending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isPending ? 'Saving...' : 'Save requirement'}</button>
    </Modal>}</AnimatePresence>
  </PageFrame>
}

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

  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-slate-900">{pickup.title}</p><p className="mt-1 truncate text-sm text-slate-500">{pickup.organizationName}</p></div><StatusBadge tone={pickup.tone}>{pickup.status}</StatusBadge></div>
    <p className="mt-3 text-xs text-slate-400">Scheduled {pickup.scheduledAt}</p>
    {canAccept && <button disabled={isPending} onClick={onAccept} className="mt-4 w-full rounded-xl bg-slate-950 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">Accept pickup</button>}
    {canAdvance && nextStatus && nextLabel && <button disabled={isPending} onClick={() => onAdvance(nextStatus)} className="mt-4 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{nextLabel}</button>}
    {role === 'logistics' && pickup.isAssignedToMe && pickup.hasVolunteerAssigned && <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Volunteer assigned</p>}
    {canAssignVolunteerHere && onAssignVolunteer && (
      !volunteers || volunteers.length === 0 ? <p className="mt-4 text-xs text-slate-400">No volunteers available to assign yet.</p> : (
        <div className="mt-4 flex gap-2">
          <select value={selectedVolunteer} onChange={(e) => setSelectedVolunteer(e.target.value)} aria-label="Select a volunteer to assign" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500">
            <option value="">Assign a volunteer...</option>
            {volunteers.map((v) => <option key={v.id} value={v.id}>{v.fullName}</option>)}
          </select>
          <button disabled={!selectedVolunteer || isAssigningVolunteer} onClick={() => selectedVolunteer && onAssignVolunteer(selectedVolunteer)} className="shrink-0 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{isAssigningVolunteer ? 'Assigning...' : 'Assign'}</button>
        </div>
      )
    )}
  </motion.div>
}

function PickupsView({ pickups, pickupsError, role, notify }: { pickups: Pickup[]; pickupsError?: string | null; role: Role; notify: (text: string, view: View) => void }) {
  const router = useRouter()
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
  }, [role])

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

  return <PageFrame eyebrow={isVolunteerView ? 'Volunteer' : 'Logistics'} title={isVolunteerView ? 'My Pickups' : 'Pickups'} description={
    role === 'logistics' ? 'Accept available pickups, track deliveries, and assign volunteers to execute them.'
      : isVolunteerView ? 'Track and update the pickups assigned to you.'
        : 'Track pickups for your donations and matches.'
  }>
    {actionError && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}
    {pickupsError ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">We couldn&apos;t load pickups right now. Please refresh the page.</p>
      : pickups.length === 0 ? <EmptyState title={isVolunteerView ? 'No pickups assigned yet' : 'No pickups yet'} description={isVolunteerView ? "You'll see pickups here once a logistics partner assigns one to you." : 'Pickups will appear here once a donation is claimed.'} />
      : <div className="grid gap-4 lg:grid-cols-2">{pickups.map((pickup) => <PickupRow key={pickup.id} pickup={pickup} role={role} isPending={isPending} onAccept={() => handleAccept(pickup.id)} onAdvance={(status) => handleAdvance(pickup.id, status)} volunteers={volunteers} onAssignVolunteer={(volunteerId) => handleAssignVolunteer(pickup.id, volunteerId)} isAssigningVolunteer={isAssigningVolunteer} />)}</div>}
  </PageFrame>
}

function MatchCard({ match, role, isPending, onRespond }: { match: Match; role: Role; isPending: boolean; onRespond: (decision: 'accepted' | 'rejected') => void }) {
  const canRespond = role === 'ngo' && match.status === 'pending'
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <div className="min-w-0"><p className="truncate font-bold text-slate-900">{match.donationTitle}</p><p className="mt-1 truncate text-sm text-slate-500">{match.organizationName}</p></div>
      <div className="shrink-0 text-right"><p className="text-2xl font-bold text-emerald-600">{Math.round(match.finalScore)}%</p><p className="text-[10px] uppercase tracking-wider text-slate-400">match score</p></div>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-600">{match.explanation}</p>
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-slate-400">Semantic</p><p className="mt-1 font-bold">{Math.round(match.semanticScore)}%</p></div>
      <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-slate-400">Distance</p><p className="mt-1 font-bold">{Math.round(match.distanceScore)}%</p></div>
      <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-slate-400">Capacity</p><p className="mt-1 font-bold">{Math.round(match.capacityScore)}%</p></div>
      <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-slate-400">Urgency</p><p className="mt-1 font-bold">{Math.round(match.urgencyScore)}%</p></div>
    </div>
    <div className="mt-4 flex items-center justify-between">
      <StatusBadge tone={match.status === 'accepted' ? 'green' : match.status === 'rejected' ? 'rose' : match.status === 'expired' ? 'slate' : 'amber'}>{match.status}</StatusBadge>
      {canRespond && <div className="flex gap-2">
        <button disabled={isPending} onClick={() => onRespond('rejected')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Decline</button>
        <button disabled={isPending} onClick={() => onRespond('accepted')} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">Accept match</button>
      </div>}
    </div>
  </motion.div>
}

function MatchesView({ matches, matchesError, role, notify }: { matches: Match[]; matchesError?: string | null; role: Role; notify: (text: string, view: View) => void }) {
  const router = useRouter()
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

  return <PageFrame eyebrow="Smart matching" title="Recommended matches" description="Ranked by semantic compatibility, distance, NGO capacity, and urgency — generated automatically when a donation is created.">
    {actionError && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}
    {matchesError ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">We couldn&apos;t load matches right now. Please refresh the page.</p>
      : matches.length === 0 ? <EmptyState title="No matches yet" description="Matches appear automatically once a donation is created and there are active NGO requirements to compare it against." />
      : <div className="grid gap-4 lg:grid-cols-2">{matches.map((match) => <MatchCard key={match.id} match={match} role={role} isPending={isPending && respondingId === match.id} onRespond={(decision) => handleRespond(match.id, decision)} />)}</div>}
  </PageFrame>
}
function AssistantView({ notify }: { notify: (text: string, view: View) => void }) { const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hi. I can help with donation safety, partner needs, and pickup planning. What would you like to know?' }]); const [input, setInput] = useState(''); const [typing, setTyping] = useState(false); const send = (text = input) => { if (!text.trim()) return; setMessages(prev => [...prev, { role: 'user', text }]); setInput(''); setTyping(true); setTimeout(() => { setMessages(prev => [...prev, { role: 'assistant', text: text.toLowerCase().includes('rice') ? 'Cooked rice can be donated when it has been cooled quickly, stored below 5°C, and delivered within the recommended safety window. I recommend labeling the preparation time and allergen details.' : 'Based on your current network, Hope Foundation and Community Table are the strongest matches. I can help you create a donation or prepare a pickup.' }]); setTyping(false) }, 700) }; return <PageFrame eyebrow="FoodBridge AI (preview)" title="AI Assistant" description="This assistant is a design preview — it is not yet grounded in your real data."><div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section className="flex min-h-[560px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Sparkles className="h-5 w-5" /></div><div><p className="font-bold">FoodBridge Copilot</p><p className="flex items-center gap-1 text-xs text-emerald-600"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Preview</p></div></div><button onClick={() => setMessages([])} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50" aria-label="Clear chat"><RefreshCw className="h-4 w-4" /></button></div><div className="flex-1 space-y-4 overflow-auto p-5">{messages.map((m, i) => <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={i} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'ml-auto bg-slate-950 text-white' : 'bg-emerald-50 text-slate-700'}`}>{m.text}{m.role === 'assistant' && <div className="mt-3 flex gap-3 border-t border-emerald-100 pt-2 text-xs font-semibold text-emerald-700"><button onClick={() => navigator.clipboard?.writeText(m.text)}><Copy className="mr-1 inline h-3 w-3" />Copy</button><button onClick={() => notify('Response marked helpful', 'AI Assistant')}>Helpful</button></div>}</motion.div>)}{typing && <div className="flex gap-1 px-4 py-3"><i className="h-2 w-2 animate-bounce rounded-full bg-emerald-500" /><i className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:120ms]" /><i className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:240ms]" /></div>}</div><div className="border-t border-slate-100 p-4"><div className="flex gap-2">{prompts.map(p => <button key={p} onClick={() => send(p)} className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 sm:block">{p}</button>)}</div><div className="mt-3 flex gap-2"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && send()} placeholder="Ask about your food recovery program..." className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500" /><button onClick={() => send()} className="rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-700" aria-label="Send message"><Send className="h-4 w-4" /></button></div></div></section><section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"><div className="flex items-center gap-2 text-emerald-700"><BookOpen className="h-5 w-5" /><h3 className="font-bold">Suggested sources</h3></div><p className="mt-3 text-sm leading-6 text-slate-600">Answers are prepared from your donation policies, partner requirements, and food safety guidance.</p><div className="mt-5 space-y-2">{['Food safety checklist', 'Partner intake requirements', 'Pickup preparation guide'].map(x => <button key={x} className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-left text-sm font-semibold text-slate-700 shadow-sm hover:text-emerald-700">{x}<ExternalLink className="h-4 w-4 text-slate-400" /></button>)}</div></section></div></PageFrame> }
function AnalyticsView() { const [range, setRange] = useState('Last 30 days'); return <PageFrame eyebrow="Insights (preview)" title="Analytics" description="This view is a design preview — connect it to real aggregate queries in a follow-up pass."><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-slate-400" /><select value={range} onChange={e => setRange(e.target.value)} className="bg-transparent outline-none"><option>Last 30 days</option><option>Last 90 days</option><option>This year</option></select></div><button onClick={() => alert('Analytics export is not yet connected to real data.')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowDownToLine className="mr-2 inline h-4 w-4" />Download report</button></div><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><SectionTitle title={`Donation volume · ${range}`} /><Chart /></div></PageFrame> }
function GenericView({ view, go }: { view: View; go: (view: View) => void }) { const data: Record<string, { icon: typeof Home; title: string; description: string; cta: string }> = { Organizations: { icon: Users, title: 'Partner organizations', description: 'Explore the local organizations turning surplus into meals.', cta: 'Invite partner' }, 'Knowledge Base': { icon: FileText, title: 'Knowledge base', description: 'Keep policies, safety guidance, and partner requirements in one place.', cta: 'Add document' }, Settings: { icon: Settings, title: 'Workspace settings', description: 'Manage your profile, notification preferences, and organization details.', cta: 'Save changes' } }; const item = data[view] ?? data.Settings; const Icon = item.icon; return <PageFrame eyebrow="Workspace (preview)" title={item.title} description={item.description}><div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="h-7 w-7" /></div><h2 className="mt-5 text-xl font-bold">Your {view.toLowerCase()} workspace is ready</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">This section is not yet connected to real data.</p><button onClick={() => go('Overview')} className="mt-6 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">{item.cta}</button></div></PageFrame> }
function PageFrame({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) { return <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10"><div className="mb-8"><p className="mb-2 text-sm font-semibold text-emerald-700">{eyebrow}</p><h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p></div>{children}</main> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={e => e.target === e.currentTarget && onClose()}><motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close dialog"><X className="h-5 w-5" /></button></div>{children}</motion.div></motion.div> }

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
}) {
  const navItems = useMemo(() => getNavItems(role), [role])
  const [sidebarOpen, setSidebarOpen] = useState(false); const [active, setActive] = useState<View>('Overview'); const [notices, setNotices] = useState(initialNotices); const [showNotifications, setShowNotifications] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(''); const [toast, setToast] = useState('');
  const unread = notices.filter(n => !n.read).length; const notify = (text: string, view: View) => { setToast(text); setNotices(prev => [{ id: Date.now(), text, detail: 'FoodBridge workspace', read: false, view }, ...prev]); setTimeout(() => setToast(''), 3200) }; const go = (view: View) => { setActive(view); setSidebarOpen(false); setShowNotifications(false); setSearchOpen(false) }
  useEffect(() => { const handler = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) } if (e.key === 'Escape') { setSearchOpen(false); setShowNotifications(false) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [])
  const results = useMemo(() => [...donations.map(d => ({ label: d.name, detail: 'Donation', view: 'Donations' as View })), ...navItems.map(n => ({ label: n.label, detail: 'Page', view: n.label })), ...insightItems.map(n => ({ label: n.label, detail: 'Page', view: n.label }))].filter(x => x.label.toLowerCase().includes(query.toLowerCase())), [donations, navItems, query])
  const workspaceLabel = role === 'ngo' ? 'NGO workspace' : role === 'logistics' ? 'Logistics workspace' : role === 'volunteer' ? 'Volunteer workspace' : role === 'admin' ? 'Admin workspace' : 'Donor workspace'
  return <div className="min-h-screen bg-[#f5f8f7] text-slate-900"><aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex h-20 items-center justify-between border-b border-slate-100 px-6"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Leaf className="h-5 w-5" /></div><div><p className="text-lg font-bold tracking-tight">FoodBridge</p><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{workspaceLabel}</p></div></div><button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button></div><div className="flex-1 space-y-7 overflow-y-auto px-4 py-6"><NavGroup title="Workspace" items={navItems} active={active} go={go} /><NavGroup title="Insights" items={insightItems} active={active} go={go} /></div><div className="border-t border-slate-100 p-4"><button onClick={() => go('Settings')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"><Settings className="h-[18px] w-[18px]" />Settings</button></div></aside>{sidebarOpen && <button className="fixed inset-0 z-30 bg-slate-950/25 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation overlay" />}<div className="lg:pl-64"><header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex"><span>Workspace</span><ChevronRight className="h-4 w-4" /><span className="font-semibold text-slate-700">{active}</span></div><span className="text-sm font-semibold text-slate-700 sm:hidden">{active}</span></div><div className="flex items-center gap-2 sm:gap-4"><button onClick={() => setSearchOpen(true)} className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-400 md:flex"><Search className="h-4 w-4" />Search workspace<span className="ml-6 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px]">⌘K</span></button><button onClick={() => setSearchOpen(true)} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Search"><Search className="h-5 w-5" /></button><div className="relative"><button onClick={() => setShowNotifications(!showNotifications)} className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />}</button><AnimatePresence>{showNotifications && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute right-0 top-12 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><div className="flex items-center justify-between"><p className="font-semibold">Notifications</p><a href="/notifications" className="text-xs font-semibold text-emerald-700">View all</a></div><div className="mt-3 space-y-2">{notices.length ? notices.slice(0, 4).map(n => <button key={n.id} onClick={() => go(n.view)} className={`w-full rounded-xl p-3 text-left hover:bg-slate-50 ${!n.read ? 'bg-emerald-50/60' : ''}`}><p className="text-sm font-semibold">{n.text}</p><p className="mt-1 text-xs text-slate-500">{n.detail}</p></button>) : <p className="py-5 text-center text-sm text-slate-400">No notifications yet — see your full inbox for the latest updates.</p>}</div></motion.div>}</AnimatePresence></div><AccountMenu /></div></header><AnimatePresence>{searchOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/25 p-5 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && setSearchOpen(false)}><motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-16 max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center gap-3 border-b border-slate-100 px-4"><Search className="h-5 w-5 text-slate-400" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search donations, pages, organizations..." className="h-14 flex-1 outline-none" /><kbd className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-400">ESC</kbd></div><div className="max-h-80 overflow-auto p-2">{results.map(r => <button key={`${r.detail}-${r.label}`} onClick={() => go(r.view)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-emerald-50"><span className="font-semibold text-slate-700">{r.label}</span><span className="text-xs text-slate-400">{r.detail}</span></button>)}{!results.length && <p className="p-5 text-center text-sm text-slate-400">No results found</p>}</div></motion.div></motion.div>}</AnimatePresence>
    {active === 'Overview' && <Overview role={role} donations={donations} donationsError={donationsError} pickups={pickups} pickupsError={pickupsError} donorStats={donorStats} ngoStats={ngoStats} logisticsStats={logisticsStats} displayName={displayName} go={go} notify={notify} showOrganizationOnboarding={showOrganizationOnboarding} />}
    {active === 'Donations' && <DonationsView role={role} donations={donations} donationsError={donationsError} notify={notify} go={go} />}
    {active === 'Requirements' && <RequirementsView requirements={requirements} requirementsError={requirementsError} hasOrganization={hasOrganization} showOrganizationOnboarding={showOrganizationOnboarding} notify={notify} />}
    {(active === 'Pickups' || active === 'My Pickups') && <PickupsView pickups={pickups} pickupsError={pickupsError} role={role} notify={notify} />}
    {active === 'Matches' && <MatchesView matches={matches} matchesError={matchesError} role={role} notify={notify} />}
    {active === 'AI Assistant' && <AssistantView notify={notify} />}
    {active === 'Analytics' && <AnalyticsView />}
    {['Organizations', 'Knowledge Base', 'Settings'].includes(active) && <GenericView view={active} go={go} />}
  <AnimatePresence>{toast && <Toast message={toast} onClose={() => setToast('')} />}</AnimatePresence></div></div>
}
function NavGroup({ title, items, active, go }: { title: string; items: { label: View; icon: typeof Home; count?: string; badge?: string }[]; active: View; go: (v: View) => void }) { return <div><p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</p>{items.map(({ label, icon: Icon, count, badge }) => <button key={label} onClick={() => go(label)} className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active === label ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><span className="flex items-center gap-3"><Icon className="h-[18px] w-[18px]" />{label}</span>{count && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200">{count}</span>}{badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{badge}</span>}</button>)}</div> }
export function DashboardIcon({ type }: { type: string }) { const icons: Record<string, typeof Home> = { home: Home, donations: PackageCheck, matches: Users, pickups: Truck, organizations: ClipboardList, analytics: LineChart, assistant: Bot, knowledge: FileText, settings: Settings, help: CircleHelp, database: Database, clock: Clock3 }; const Icon = icons[type] || Home; return <Icon className="h-5 w-5" /> }
export function MapPlaceholder() { return <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-[#eef5f1] text-center"><div><MapPin className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-3 font-semibold text-slate-700">Partner network map</p><p className="mt-1 text-sm text-slate-500">Map provider ready for integration</p></div></div> }
export function EmptyState({ title = 'Nothing here yet', description = 'New activity will appear here when it is available.' }: { title?: string; description?: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Database className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-800">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p></div> }
export function TopLevelShell() { return <FoodBridgeDashboard /> }
export default FoodBridgeDashboard
