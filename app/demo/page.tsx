import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DemoDashboard from '@/components/demo/demo-dashboard'
import { isDemoModeEnabled } from '@/lib/demo/config'

export const metadata: Metadata = {
  title: 'FoodBridge | Demo workspace',
  robots: { index: false, follow: false },
}

// Public, unauthenticated demo. It renders only simulated data held in the
// visitor's browser and never touches Supabase. When demo mode isn't
// explicitly enabled for this deployment the route doesn't exist.
export default function DemoPage() {
  if (!isDemoModeEnabled()) notFound()
  return <DemoDashboard />
}
