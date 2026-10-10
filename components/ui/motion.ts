// Shared motion tokens. Durations are in seconds (Motion's unit). Keep
// animations short and decelerating; nothing here should delay interaction.

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

export const DURATION = {
  fast: 0.16,
  base: 0.24,
  slow: 0.6,
} as const

/** Staggered section entrance: parent `variants` + `initial="hidden" animate="show"`. */
export const STAGGER_PARENT = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
} as const

export const STAGGER_CHILD = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
} as const
