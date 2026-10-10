// Demo mode is opt-in per deployment. Only the exact (case-insensitive,
// whitespace-trimmed) string "true" enables it — unset, empty, "1", "yes",
// "false" or any typo all leave it disabled, so it can't be switched on by
// accident.

export function parseDemoModeFlag(raw: string | undefined | null): boolean {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'true'
}

export function isDemoModeEnabled(): boolean {
  // Literal `process.env.NEXT_PUBLIC_…` access (not a dynamic key) so Next.js
  // inlines the build-time value into client bundles.
  return parseDemoModeFlag(process.env.NEXT_PUBLIC_FOODBRIDGE_DEMO_MODE)
}

// The public demo route. Matched exactly (or as a path prefix) so e.g.
// "/demonstration" or "/dashboard" can never be treated as the demo.
export function isDemoPath(pathname: string): boolean {
  return pathname === '/demo' || pathname.startsWith('/demo/')
}
