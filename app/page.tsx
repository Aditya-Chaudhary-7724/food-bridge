import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import LandingPage from '@/components/landing-page'
import { isDemoModeEnabled } from '@/lib/demo/config'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'FoodBridge | Surplus food, redistributed',
  description: 'FoodBridge matches surplus food from businesses with nearby organizations and coordinates the pickup and delivery.',
}

// Signed-in users go straight to their workspace; everyone else sees the
// public landing page.
export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (!error && user) {
    redirect('/dashboard')
  }

  return <LandingPage demoEnabled={isDemoModeEnabled()} />
}
