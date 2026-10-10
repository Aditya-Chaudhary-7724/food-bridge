'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Check, ClipboardCheck, Handshake, PackagePlus, PartyPopper, Truck, X } from 'lucide-react'

import { EASE_OUT, DURATION } from '@/components/ui/motion'
import type { FoodJourney as Journey, JourneyStageKey, JourneyStageState } from '@/lib/services/food-journey'

// The FoodBridge "food journey": where a donation is in its path from
// donor to organization. Rendered purely from a FoodJourney computed from
// real (or simulated) status — never from a timer or a hardcoded state.

const STAGE_ICONS: Record<JourneyStageKey, typeof Truck> = {
  created: PackagePlus,
  matched: Handshake,
  coordinated: ClipboardCheck,
  delivery: Truck,
  completed: PartyPopper,
}

const PROGRESS_TRANSITION = { duration: DURATION.slow, ease: EASE_OUT }

function StageMarker({ stageKey, state, size = 'md' }: { stageKey: JourneyStageKey; state: JourneyStageState; size?: 'sm' | 'md' }) {
  const Icon = state === 'done' ? Check : state === 'halted' ? X : STAGE_ICONS[stageKey]
  const dims = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const tone = {
    done: 'border-forest-700 bg-forest-700 text-paper',
    current: 'border-forest-700 bg-white text-forest-700 ring-4 ring-forest-100',
    upcoming: 'border-stone-300 bg-white text-stone-400',
    halted: 'border-tomato-600 bg-tomato-50 text-tomato-700',
  }[state]
  return (
    <motion.span
      layout="position"
      initial={false}
      animate={{ scale: state === 'current' ? 1.04 : 1 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ${dims} ${tone}`}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
    </motion.span>
  )
}

const STATE_TEXT: Record<JourneyStageState, string> = { done: 'complete', current: 'in progress', upcoming: 'not started', halted: 'stopped' }

/** Full journey: horizontal stepper from `md`, vertical timeline below. */
export function FoodJourney({ journey, label = 'Food journey' }: { journey: Journey; label?: string }) {
  const { stages, progress, isHalted } = journey
  return (
    <div>
      <ol aria-label={label} className="relative hidden md:grid md:grid-cols-5">
        {/* Track sits behind the markers, from the first marker's centre to the last. */}
        <span aria-hidden className="absolute left-[10%] right-[10%] top-[18px] h-0.5 rounded-full bg-stone-200" />
        <motion.span
          aria-hidden
          className={`absolute left-[10%] top-[18px] h-0.5 origin-left rounded-full ${isHalted ? 'bg-tomato-500' : 'bg-forest-700'}`}
          style={{ width: '80%' }}
          initial={false}
          animate={{ scaleX: progress }}
          transition={PROGRESS_TRANSITION}
        />
        {stages.map((stage) => (
          <li key={stage.key} className="flex flex-col items-center px-2 text-center" aria-current={stage.state === 'current' ? 'step' : undefined}>
            <StageMarker stageKey={stage.key} state={stage.state} />
            <span className={`mt-3 text-[13px] leading-tight ${stage.state === 'upcoming' ? 'text-stone-500' : 'font-semibold text-ink'}`}>{stage.label}</span>
            <span className="sr-only">, {STATE_TEXT[stage.state]}</span>
          </li>
        ))}
      </ol>

      <ol aria-label={label} className="relative space-y-4 md:hidden">
        <span aria-hidden className="absolute bottom-3.5 left-3.5 top-3.5 w-0.5 -translate-x-1/2 rounded-full bg-stone-200" />
        <motion.span
          aria-hidden
          className={`absolute left-3.5 top-3.5 w-0.5 origin-top -translate-x-1/2 rounded-full ${isHalted ? 'bg-tomato-500' : 'bg-forest-700'}`}
          style={{ height: 'calc(100% - 1.75rem)' }}
          initial={false}
          animate={{ scaleY: progress }}
          transition={PROGRESS_TRANSITION}
        />
        {stages.map((stage) => (
          <li key={stage.key} className="flex items-center gap-3" aria-current={stage.state === 'current' ? 'step' : undefined}>
            <StageMarker stageKey={stage.key} state={stage.state} size="sm" />
            <span className={`text-sm ${stage.state === 'upcoming' ? 'text-stone-500' : 'font-semibold text-ink'}`}>{stage.label}</span>
            <span className="sr-only">, {STATE_TEXT[stage.state]}</span>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="mt-5 min-h-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={journey.summary}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            className={`text-sm ${isHalted ? 'text-tomato-700' : 'text-stone-700'}`}
          >
            {journey.summary}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Compact five-segment track for list rows and cards. */
export function JourneyTrack({ journey }: { journey: Journey }) {
  const current = journey.stages[journey.currentIndex]
  const done = journey.stages.filter((s) => s.state === 'done').length
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Food journey progress"
        aria-valuemin={0}
        aria-valuemax={journey.stages.length}
        aria-valuenow={done}
        aria-valuetext={journey.isComplete ? 'Completed' : `${current.label}, ${STATE_TEXT[current.state]}`}
        className="relative h-1.5 overflow-hidden rounded-full bg-stone-200"
      >
        <motion.span
          className={`absolute inset-y-0 left-0 w-full origin-left rounded-full ${journey.isHalted ? 'bg-tomato-500' : journey.isComplete ? 'bg-forest-700' : 'bg-forest-500'}`}
          initial={false}
          animate={{ scaleX: Math.max(journey.progress, 0.04) }}
          transition={PROGRESS_TRANSITION}
        />
      </div>
      <p className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-600">
        <span className="truncate">{journey.isComplete ? 'Journey complete' : current.label}</span>
        <span className="shrink-0 tabular-nums">{done}/{journey.stages.length}</span>
      </p>
    </div>
  )
}
