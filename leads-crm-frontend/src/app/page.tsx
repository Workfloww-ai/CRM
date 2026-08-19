'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LogIn, UserPlus, Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'

const ALLOWED_DOMAIN = 'workfloww.ai'

function isAllowedEmail(email: string) {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)
}

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  async function handleSignUp() {
    if (!isAllowedEmail(email)) {
      setMessage('Opps! You are not a part of our team.')
      return
    }
    setIsLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? `Error: ${error.message}` : 'Check your email to confirm signup!')
    setIsLoading(false)
  }

  async function handleLogin() {
    if (!isAllowedEmail(email)) {
      setMessage('Opps! You are not a part of our team..')
      return
    }
    setIsLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(`Error: ${error.message}`)
      setIsLoading(false)
      return
    }
    router.push('/leads')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b] px-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-neutral-900 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-800">
        <div>
          <img
            src="/logo.jpeg"
            alt="Workfloww.ai Logo"
            className="w-12 h-12 mx-auto object-contain rounded-lg"
          />
          <h2 className="mt-6 text-center text-2xl font-bold text-gray-900 dark:text-white">
            Welcome to Workfloww.ai CRM
          </h2>
          <p className="mt-2 text-center text-sm text-gray-500 dark:text-neutral-400">
            Sign in to your account or create a new one
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-2 text-gray-900 dark:text-white bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-colors outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-2 pr-10 text-gray-900 dark:text-white bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-colors outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              onClick={handleLogin}
              disabled={isLoading || !email || !password}
              className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Log In
            </button>
            <button
              onClick={handleSignUp}
              disabled={isLoading || !email || !password}
              className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 border border-gray-300 dark:border-neutral-700 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Sign Up
            </button>
          </div>

          {message && (
            <div className={`p-4 rounded-lg text-sm ${message.startsWith('Error:') || message.startsWith('Opps!') ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}