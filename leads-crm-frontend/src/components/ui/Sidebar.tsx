'use client'

import React from 'react'
import { LayoutDashboard, Users, Settings, LogOut, Kanban } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

type SidebarProps = {
  profile: { full_name: string; role_level: number } | null
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="w-64 h-screen bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-800 flex flex-col shrink-0 hidden md:flex">
      <div className="h-16 flex items-center px-6 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <img 
            src="/logo.jpeg" 
            alt="Workfloww.ai Logo" 
            className="w-8 h-8 shrink-0 object-contain rounded-md"
          />
          <span className="font-semibold text-gray-900 dark:text-white">Workfloww.ai CRM</span>
        </div>
      </div>

      <div className="flex-1 py-6 px-4 space-y-1">
        <Link 
          href="/leads" 
          className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${pathname === '/leads' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
        >
          <Users className="w-5 h-5" />
          Leads
        </Link>
        <Link 
          href="/pipeline" 
          className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${pathname === '/pipeline' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
        >
          <Kanban className="w-5 h-5" />
          Pipeline
        </Link>
        {/* <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-lg font-medium transition-colors pointer-events-none opacity-50">
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </a>
        <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-lg font-medium transition-colors pointer-events-none opacity-50">
          <Settings className="w-5 h-5" />
          Settings
        </a> */}
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-neutral-800">
        {profile ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-400 flex items-center justify-center font-bold text-sm">
              {profile.full_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {profile.full_name}
              </p>
              <p className="text-xs text-gray-500 dark:text-neutral-400 truncate">
                {profile.role_level >= 1 ? 'Admin' : 'Member'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="h-12 animate-pulse bg-gray-100 dark:bg-neutral-800 rounded-lg"></div>
        )}
      </div>
    </div>
  )
}
