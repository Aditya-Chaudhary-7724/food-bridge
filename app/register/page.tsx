"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { getFriendlyAuthError } from "@/lib/services/auth-error-mapping"
import { SIGNUP_ROLE_OPTIONS, type SignupRole } from "@/lib/validations/auth"
import AuthShell, { authInputClass, authLabelClass, authPrimaryButtonClass } from "@/components/auth-shell"

export default function RegisterPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<SignupRole>(SIGNUP_ROLE_OPTIONS[0].value)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    let isMounted = true

    async function redirectIfUserExists() {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted) return

      if (user) {
        router.replace("/dashboard")
      }
    }

    redirectIfUserExists()

    return () => {
      isMounted = false
    }
  }, [router])

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setLoading(true)
    setError("")
    setSuccess("")

    const supabase = createClient()

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
        },
      },
    })

    if (error) {
      setError(getFriendlyAuthError(error))
      setLoading(false)
      return
    }

    if (data.user) {
      if (data.session) {
        router.replace("/dashboard")
        router.refresh()
        return
      }

      setSuccess(
        "Account created successfully. Please check your email to confirm your account before signing in."
      )

      setEmail("")
      setPassword("")
      setFullName("")
      setRole(SIGNUP_ROLE_OPTIONS[0].value)
    }

    setLoading(false)
  }

  return (
    <AuthShell title="Join FoodBridge" subtitle="Create an account to donate surplus, receive it for your organization, or help deliver it.">
          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-5" noValidate>

            {/* Full Name */}
            <div>
              <label
                htmlFor="fullName"
                className={authLabelClass}
              >
                Full name
              </label>

              <input
                id="fullName"
                required
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className={authInputClass}
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className={authLabelClass}
              >
                Email
              </label>

              <input
                id="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={authInputClass}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className={authLabelClass}
              >
                Password
              </label>

              <input
                id="password"
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={authInputClass}
              />

              <p className="mt-1.5 text-xs text-stone-600">
                Minimum 6 characters
              </p>
            </div>

            {/* Role */}
            <div>
              <label
                htmlFor="role"
                className={authLabelClass}
              >
                I am joining as
              </label>

              <select
                id="role"
                value={role}
                onChange={(event) => setRole(event.target.value as SignupRole)}
                className={authInputClass}
              >
                {SIGNUP_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Error */}
            {error && (
              <div
                aria-live="polite"
                role="alert"
                className="rounded-lg border border-tomato-200 bg-tomato-50 p-3 text-sm text-tomato-800"
              >
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div
                aria-live="polite"
                className="rounded-lg border border-forest-200 bg-forest-50 p-3 text-sm text-forest-800"
              >
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              disabled={loading}
              type="submit"
              className={authPrimaryButtonClass}
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          {/* Login Link */}
          <p className="mt-6 text-sm text-stone-700">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-forest-700 underline-offset-4 hover:text-forest-900 hover:underline"
            >
              Sign in
            </Link>
          </p>
    </AuthShell>
  )
}
