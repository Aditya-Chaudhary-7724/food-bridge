import Link from 'next/link'
import { Leaf } from 'lucide-react'

// Shared frame for the sign-in and registration pages: a quiet brand panel
// on wide screens and a single focused form column everywhere.

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-paper text-ink [color-scheme:light] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-forest-800 p-10 text-paper lg:flex xl:p-14">
        <Link href="/" className="flex w-fit items-center gap-2.5 rounded-md">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-forest-800">
            <Leaf className="h-4 w-4" aria-hidden />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-tomato-500 ring-2 ring-forest-800" />
          </span>
          <span className="font-display text-lg font-medium tracking-tight">FoodBridge</span>
        </Link>
        <div>
          <p className="max-w-md font-display text-4xl font-medium leading-tight tracking-tight">
            Surplus food, matched and moved before it expires.
          </p>
          <p className="mt-5 max-w-sm text-sm leading-6 text-forest-100">
            Donors, organizations and delivery teams working from the same pickup, from listing to hand-over.
          </p>
        </div>
        <p className="text-xs text-forest-200">Donation created → NGO match → Pickup → Delivery → Completed</p>
      </aside>

      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="flex w-fit items-center gap-2 rounded-md lg:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-forest-700 text-paper"><Leaf className="h-3.5 w-3.5" aria-hidden /></span>
          <span className="font-display text-base font-medium">FoodBridge</span>
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  )
}

export const authInputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-ink placeholder:text-stone-500 outline-none transition focus:border-forest-500 focus:ring-3 focus:ring-forest-100'
export const authLabelClass = 'mb-1.5 block text-sm font-medium text-ink'
export const authPrimaryButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-forest-700 px-4 font-semibold text-paper transition hover:bg-forest-800 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60'
