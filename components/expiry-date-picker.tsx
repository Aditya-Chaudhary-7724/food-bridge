'use client'

import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Replaces the native <input type="date"> for the donation expiry field.
// The native control was unreliable here: opening its calendar depends on
// clicking the browser's own tiny icon/hit-area, which is inconsistent
// across browsers and unreliable on touch — sometimes it opens, sometimes
// nothing happens. This is a fully controlled popover + hand-built month
// grid instead, so "click the field" always opens the same calendar.
//
// Built on @base-ui/react's Popover primitive (already a project
// dependency, used elsewhere via components/ui/button.tsx's Base UI
// Button) rather than adding a date-picking library — a single-month,
// single-date grid needs nothing a date library would provide beyond
// plain Date arithmetic.

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Deliberately parses the y/m/d components into a local Date (never via
// `new Date(value)`, which would interpret a bare "YYYY-MM-DD" as UTC
// midnight and can render as the previous day in timezones behind UTC).
function parseDateOnlyString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDisplayDate(value: string): string {
  const date = parseDateOnlyString(value)
  if (!date) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function ExpiryDatePicker({
  value,
  onChange,
  min,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  min?: string
  ariaLabel?: string
}) {
  const selected = parseDateOnlyString(value)
  const minDate = min ? parseDateOnlyString(min) : null
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => selected ?? minDate ?? new Date())

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setViewDate(selected ?? minDate ?? new Date())
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day))

  function isBeforeMin(date: Date): boolean {
    if (!minDate) return false
    return toDateOnlyString(date) < toDateOnlyString(minDate)
  }

  function selectDate(date: Date) {
    onChange(toDateOnlyString(date))
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        type="button"
        aria-label={ariaLabel}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm outline-none focus:border-emerald-500 aria-expanded:border-emerald-500 aria-expanded:ring-2 aria-expanded:ring-emerald-100"
      >
        {selected ? <span className="text-slate-900">{formatDisplayDate(value)}</span> : <span className="text-slate-400">Select date</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="z-[80]">
          <Popover.Popup className="w-72 origin-[var(--transform-origin)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                aria-label="Previous month"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold text-slate-900">
                {viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                aria-label="Next month"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={`empty-${i}`} />
                const disabled = isBeforeMin(date)
                const isSelected = Boolean(selected && toDateOnlyString(date) === toDateOnlyString(selected))
                return (
                  <button
                    key={toDateOnlyString(date)}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDate(date)}
                    aria-current={isSelected ? 'date' : undefined}
                    className={`h-8 w-8 rounded-lg text-sm font-medium transition ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : disabled
                          ? 'cursor-not-allowed text-slate-300'
                          : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
