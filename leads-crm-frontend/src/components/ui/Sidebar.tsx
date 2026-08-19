'use client'

import React, { useState, useEffect } from 'react'
import { LayoutDashboard, Users, Settings, LogOut, Kanban, ListTodo, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

type SidebarProps = {
  profile: { full_name: string; role_level: number } | null
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    if (saved) setIsCollapsed(saved === 'true')
  }, [])

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
    localStorage.setItem('sidebarCollapsed', String(!isCollapsed))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} h-screen bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-800 flex flex-col shrink-0 hidden md:flex transition-all duration-300 relative`}>
      <button 
        onClick={toggleCollapse}
        className="absolute -right-3 top-20 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-full p-1 shadow-sm text-gray-500 hover:text-gray-900 dark:hover:text-white z-10"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-6'} border-b border-gray-100 dark:border-neutral-800 transition-all overflow-hidden`}>
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt="Workfloww.ai Logo"
            className="w-8 h-8 shrink-0 object-contain rounded-md"
          />
          {!isCollapsed && <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">Workfloww.ai CRM</span>}
        </div>
      </div>

      <div className={`flex-1 py-6 ${isCollapsed ? 'px-3' : 'px-4'} space-y-1 overflow-x-hidden`}>
        <Link
          href="/leads"
          title={isCollapsed ? "Leads" : ""}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${pathname === '/leads' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
        >
          <Users className={`w-5 h-5 shrink-0 ${isCollapsed ? 'mx-auto' : ''}`} />
          {!isCollapsed && <span>Leads</span>}
        </Link>
        <Link
          href="/pipeline"
          title={isCollapsed ? "Pipeline" : ""}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${pathname === '/pipeline' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
        >
          <Kanban className={`w-5 h-5 shrink-0 ${isCollapsed ? 'mx-auto' : ''}`} />
          {!isCollapsed && <span>Pipeline</span>}
        </Link>
        <Link
          href="/queue"
          title={isCollapsed ? "Queue" : ""}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${pathname === '/queue' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400' : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}
        >
          <ListTodo className={`w-5 h-5 shrink-0 ${isCollapsed ? 'mx-auto' : ''}`} />
          {!isCollapsed && <span>Queue</span>}
        </Link>
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-neutral-800 overflow-hidden">
        {profile ? (
          <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-2' : 'gap-3 px-3'} py-2`}>
            <div className="w-8 h-8 shrink-0 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-400 flex items-center justify-center font-bold text-sm" title={profile.full_name}>
              {profile.full_name.charAt(0)}
            </div>
            {!isCollapsed && (
              <>
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
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
            {isCollapsed && (
                <button
                  onClick={handleLogout}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 mt-2"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
            )}
          </div>
        ) : (
          <div className="h-12 animate-pulse bg-gray-100 dark:bg-neutral-800 rounded-lg"></div>
        )}
      </div>
    </div>
  )
}
