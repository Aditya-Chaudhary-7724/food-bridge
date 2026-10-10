import Link from 'next/link'
import { ArrowRight, Building2, Leaf, Store, Truck } from 'lucide-react'

import { FoodJourney } from '@/components/food-journey'
import { getPickupJourney } from '@/lib/services/food-journey'

// Public landing page. Everything here describes what the product actually
// does; the journey on the right is explicitly labelled as an illustration,
// and the page makes no impact, partnership or testimonial claims.

const ROLES = [
  {
    icon: Store,
    title: 'Donors',
    who: 'Restaurants, grocers, caterers, canteens',
    body: 'List surplus with what it is, how much, and when it must be gone. FoodBridge scores nearby organizations against it straight away.',
  },
  {
    icon: Building2,
    title: 'Organizations',
    who: 'Shelters, community kitchens, food banks',
    body: 'Publish what you can accept and how much. Review ranked matches — each with a plain explanation — and accept the ones that fit.',
  },
  {
    icon: Truck,
    title: 'Logistics & volunteers',
    who: 'Delivery partners and the people who drive',
    body: 'Pick up scheduled collections, assign a volunteer, and update the status from collected to delivered so everyone can see where the food is.',
  },
]

const MATCH_FACTORS = [
  { label: 'Fit', detail: 'How closely the food matches what the organization says it needs.' },
  { label: 'Distance', detail: 'How far the food has to travel before it expires.' },
  { label: 'Capacity', detail: 'Whether the organization can actually take that quantity today.' },
  { label: 'Urgency', detail: 'How pressing the organization has marked its need.' },
]

const illustrativeJourney = getPickupJourney({ statusValue: 'in_transit', hasVolunteerAssigned: true })

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700 text-paper">
        <Leaf className="h-4 w-4" aria-hidden />
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-tomato-500 ring-2 ring-paper" />
      </span>
      <span className="font-display text-lg font-medium tracking-tight text-ink">FoodBridge</span>
    </span>
  )
}

export default function LandingPage({ demoEnabled }: { demoEnabled: boolean }) {
  const primaryCta = demoEnabled
    ? { href: '/demo', label: 'Explore the demo' }
    : { href: '/register', label: 'Create an account' }

  return (
    <div className="min-h-screen bg-paper text-ink [color-scheme:light]">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="FoodBridge home" className="rounded-md"><Brand /></Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm sm:gap-2">
          <a href="#how-it-works" className="hidden rounded-md px-3 py-2 text-stone-700 hover:text-ink sm:inline-block">How it works</a>
          <Link href="/login" className="rounded-md px-3 py-2 font-medium text-stone-800 hover:text-ink">Sign in</Link>
          <Link href="/register" className="hidden min-h-9 items-center rounded-lg border border-stone-300 bg-white px-3.5 font-semibold text-ink transition hover:border-stone-400 sm:inline-flex">Create account</Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:pb-24 lg:pt-16">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-600">Surplus food, redistributed</p>
            <h1 className="mt-4 font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Today&apos;s surplus, on someone&apos;s plate <em className="font-normal text-tomato-600">tonight.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-stone-700">
              FoodBridge connects businesses that have food left over with nearby organizations that can use it — then coordinates the pickup and delivery before it expires.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={primaryCta.href} className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-forest-700 px-5 text-sm font-semibold text-paper transition hover:bg-forest-800 active:scale-[.98]">
                {primaryCta.label}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {demoEnabled
                ? <Link href="/register" className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-ink transition hover:border-stone-400 active:scale-[.98]">Create an account</Link>
                : <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-ink transition hover:border-stone-400 active:scale-[.98]">Sign in</Link>}
            </div>
            {demoEnabled && <p className="mt-3 text-sm text-stone-600">The demo needs no account and uses sample data only.</p>}
          </div>

          <figure className="animate-in fade-in slide-in-from-bottom-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-lift duration-700 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">Food journey</p>
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">Illustrative example</span>
            </div>
            <p className="mt-4 font-display text-xl font-medium tracking-tight">Vegetable crates · 18 kg</p>
            <p className="mt-1 text-sm text-stone-600">From a neighbourhood grocer to a community kitchen</p>
            <div className="mt-7">
              <FoodJourney journey={illustrativeJourney} label="Illustrative food journey" />
            </div>
            <figcaption className="mt-6 border-t border-stone-100 pt-4 text-xs leading-5 text-stone-600">
              Every donation moves through the same five steps. Donors, organizations and drivers each see the same status, so nobody has to chase anyone by phone.
            </figcaption>
          </figure>
        </section>

        {/* Why it matters */}
        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-14 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-16 lg:py-20">
            <h2 className="font-display text-3xl font-medium leading-tight tracking-tight">Why it matters</h2>
            <div className="space-y-4 text-base leading-7 text-stone-700">
              <p>Surplus food is usually good for hours, not days. Most of it isn&apos;t wasted for lack of goodwill — it&apos;s wasted because nobody knew in time who could take it, or how it would get there.</p>
              <p>FoodBridge handles exactly that gap: matching each donation to an organization that can use it, and giving everyone involved one shared view of the pickup until the food is handed over.</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-14 sm:px-8 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-600">How it works</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Three groups, one pickup, no phone tag.</h2>
          <ol className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 md:grid-cols-3">
            {ROLES.map(({ icon: Icon, title, who, body }, index) => (
              <li key={title} className="bg-paper p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-forest-700"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="font-display text-2xl text-stone-400 tabular-nums" aria-hidden>0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-stone-600">{who}</p>
                <p className="mt-4 text-sm leading-6 text-stone-700">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Matching transparency */}
        <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-8 lg:pb-20">
          <div className="grid grid-cols-1 gap-10 rounded-2xl bg-forest-800 px-6 py-10 text-paper sm:px-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-14 lg:py-14">
            <div>
              <h2 className="font-display text-3xl font-medium leading-tight tracking-tight">Matches you can read, not a black box.</h2>
              <p className="mt-4 text-sm leading-6 text-forest-100">Each recommendation shows the four numbers behind it, and a sentence built only from those numbers.</p>
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              {MATCH_FACTORS.map(({ label, detail }) => (
                <div key={label} className="border-t border-forest-600 pt-4">
                  <dt className="font-semibold">{label}</dt>
                  <dd className="mt-1 text-sm leading-6 text-forest-100">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-5 pb-20 text-center sm:px-8">
          <h2 className="mx-auto max-w-xl font-display text-3xl font-medium leading-tight tracking-tight">See a donation travel from listing to delivery.</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={primaryCta.href} className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-forest-700 px-5 text-sm font-semibold text-paper transition hover:bg-forest-800 active:scale-[.98]">
              {primaryCta.label}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold text-forest-800 hover:text-forest-950">Sign in</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Brand />
          <p>Coordinating surplus food between donors, organizations and delivery teams.</p>
        </div>
      </footer>
    </div>
  )
}
