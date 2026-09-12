"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { getFriendlyAuthError } from "@/lib/services/auth-error-mapping"
import { SIGNUP_ROLE_OPTIONS, type SignupRole } from "@/lib/validations/auth"

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
    <main className="min-h-screen bg-[#f6f8f7] px-6 py-12 text-gray-900">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

          {/* Header */}
          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white">
              🌱
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
              Join FoodBridge
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Create your account and help reduce food waste.
            </p>
          </div>

          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-5" noValidate>

            {/* Full Name */}
            <div>
              <label
                htmlFor="fullName"
                className="mb-2 block text-sm font-medium text-gray-900"
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
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-950 placeholder:text-gray-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-gray-900"
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
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-950 placeholder:text-gray-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-gray-900"
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
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-950 placeholder:text-gray-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />

              <p className="mt-1.5 text-xs text-gray-500">
                Minimum 6 characters
              </p>
            </div>

            {/* Role */}
            <div>
              <label
                htmlFor="role"
                className="mb-2 block text-sm font-medium text-gray-900"
              >
                I am joining as
              </label>

              <select
                id="role"
                value={role}
                onChange={(event) => setRole(event.target.value as SignupRole)}
                className="w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div
                aria-live="polite"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
              >
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          {/* Login Link */}
          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
            >
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </main>
  )
}
