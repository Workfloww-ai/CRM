'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Sidebar } from '@/components/ui/Sidebar'
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext'

type Profile = {
  full_name: string
  email: string
  role_level: number
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const { isSidebarOpen } = useSidebar()

  useEffect(() => {
    async function fetchProfile() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return

      const res = await fetch('http://localhost:8000/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setProfile(await res.json())
      }
    }
    fetchProfile()
  }, [])

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-[#09090b] text-gray-900 dark:text-gray-100 font-sans">
      {isSidebarOpen && <Sidebar profile={profile} />}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SidebarProvider>
  )
}
