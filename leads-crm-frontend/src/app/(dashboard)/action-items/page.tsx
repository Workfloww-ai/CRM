'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Menu,
  CheckSquare,
  Square,
  Clock,
  Calendar,
  User,
  Trash2,
  Search,
  RefreshCw,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  MessageSquare
} from 'lucide-react'
import { useSidebar } from '@/contexts/SidebarContext'
import { API_URL } from '@/lib/api'
import Link from 'next/link'

type ActionItem = {
  id: string
  lead_id?: string | null
  training_partner_id?: string | null
  fractional_leader_id?: string | null
  channel?: 'direct_channel' | 'consulting_partner' | 'fractional_leader' | string | null
  source_insight?: string | null
  user_id: string
  activity_id: string | null
  task: string
  due_date: string | null
  status: 'pending' | 'completed'
  created_at: string
  completed_at: string | null
  leads?: {
    id: string
    first_name: string
    last_name: string | null
    org: string | null
    title: string | null
    status: string | null
  } | null
  training_partners?: {
    id: string
    first_name: string
    last_name: string | null
    organization: string | null
    title: string | null
    status: string | null
  } | null
  fractional_leaders?: {
    id: string
    first_name: string
    last_name: string | null
    domain: string | null
    title: string | null
    status: string | null
  } | null
  profiles?: {
    id: string
    full_name: string
    email: string
  } | null
  lead_activities?: {
    id: string
    content: string
  } | null
}

function getEntityInfo(item: ActionItem) {
  if (item.channel === 'consulting_partner' || item.training_partner_id) {
    const tp = item.training_partners
    return {
      name: tp ? `${tp.first_name} ${tp.last_name || ''}`.trim() : 'Consulting Partner',
      subtitle: tp?.organization || tp?.title || '',
      href: tp ? `/training-partners?id=${tp.id}` : '/training-partners',
      channelBadge: 'Consulting Partner',
      channelBadgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900',
      exists: !!tp
    }
  }
  if (item.channel === 'fractional_leader' || item.fractional_leader_id) {
    const fl = item.fractional_leaders
    return {
      name: fl ? `${fl.first_name} ${fl.last_name || ''}`.trim() : 'Fractional Leader',
      subtitle: fl?.domain || fl?.title || '',
      href: fl ? `/fractional-leaders?id=${fl.id}` : '/fractional-leaders',
      channelBadge: 'Fractional Leader',
      channelBadgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-900',
      exists: !!fl
    }
  }
  const l = item.leads
  return {
    name: l ? `${l.first_name} ${l.last_name || ''}`.trim() : 'Direct Channel Lead',
    subtitle: l?.org || l?.title || '',
    href: l ? `/leads?id=${l.id}` : '/leads',
    channelBadge: 'Direct Channel',
    channelBadgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    exists: !!l
  }
}

function formatUserName(fullName: string | null | undefined) {
  if (!fullName) return 'Unknown'
  if (fullName.includes('@')) {
    const namePart = fullName.split('@')[0]
    return namePart
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
  }
  return fullName
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getDueDateStatus(dueDateStr: string | null | undefined, isCompleted: boolean) {
  if (isCompleted || !dueDateStr) return 'normal'
  const due = new Date(dueDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'overdue'
  if (diffDays <= 2) return 'due_soon'
  return 'normal'
}

export default function ActionItemsPage() {
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('pending')
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar()

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  async function fetchActionItems(showSpinner = true) {
    if (showSpinner) setRefreshing(true)
    const token = await getToken()
    if (!token) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      // Get current user id
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user?.id) {
        setCurrentUserId(sessionData.session.user.id)
      }

      const res = await fetch(`${API_URL}/action-items`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setActionItems(data || [])
      }
    } catch (err) {
      console.error('Failed to load action items:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchActionItems(false)
  }, [])

  async function handleToggleStatus(item: ActionItem) {
    const newStatus: 'pending' | 'completed' = item.status === 'completed' ? 'pending' : 'completed'
    const newCompletedAt = newStatus === 'completed' ? new Date().toISOString() : null

    // Optimistic UI update
    setActionItems(prev =>
      prev.map(i =>
        i.id === item.id
          ? { ...i, status: newStatus, completed_at: newCompletedAt }
          : i
      )
    )

    const token = await getToken()
    if (!token) return

    try {
      const res = await fetch(`${API_URL}/action-items/${item.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      })

      if (!res.ok) {
        // Revert on error
        setActionItems(prev =>
          prev.map(i => (i.id === item.id ? item : i))
        )
      }
    } catch (err) {
      console.error('Failed to update status:', err)
      setActionItems(prev =>
        prev.map(i => (i.id === item.id ? item : i))
      )
    }
  }

  async function handleDelete(itemId: string) {
    const confirmed = confirm('Delete this action item? This cannot be undone.')
    if (!confirmed) return

    setActionItems(prev => prev.filter(i => i.id !== itemId))

    const token = await getToken()
    if (!token) return

    try {
      await fetch(`${API_URL}/action-items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch (err) {
      console.error('Failed to delete action item:', err)
      fetchActionItems(false)
    }
  }

  const filteredItems = useMemo(() => {
    return actionItems.filter(item => {
      // Tab filter
      if (activeTab === 'pending' && item.status !== 'pending') return false
      if (activeTab === 'completed' && item.status !== 'completed') return false

      // My tasks filter
      if (myTasksOnly && currentUserId && item.user_id !== currentUserId) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const taskMatch = item.task.toLowerCase().includes(q)
        const entity = getEntityInfo(item)
        const entityMatch =
          entity.name.toLowerCase().includes(q) ||
          entity.subtitle.toLowerCase().includes(q) ||
          entity.channelBadge.toLowerCase().includes(q)
        const userMatch = item.profiles?.full_name?.toLowerCase().includes(q) || false
        if (!taskMatch && !entityMatch && !userMatch) return false
      }

      return true
    })
  }, [actionItems, activeTab, myTasksOnly, currentUserId, searchQuery])

  const pendingCount = useMemo(() => actionItems.filter(i => i.status === 'pending').length, [actionItems])
  const completedCount = useMemo(() => actionItems.filter(i => i.status === 'completed').length, [actionItems])

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-[#09090b]">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 -ml-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight flex items-center gap-2">
                Insights Analysis
              </h1>
              
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Tasks automatically extracted when insights are documented after calls
            </p>
          </div>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, leads, assignee..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white shadow-sm"
            />
          </div>

          <button
            onClick={() => fetchActionItems(true)}
            disabled={refreshing}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-800 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            title="Refresh action items"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Tabs & Controls */}
      <div className="px-6 py-3 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800'
            }`}
          >
            <span>Pending</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'pending' ? 'bg-gray-800 dark:bg-gray-100 text-gray-200 dark:text-gray-800' : 'bg-gray-200 dark:bg-neutral-800 text-gray-700 dark:text-gray-300'
            }`}>
              {pendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800'
            }`}
          >
            <span>Completed</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'completed' ? 'bg-gray-800 dark:bg-gray-100 text-gray-200 dark:text-gray-800' : 'bg-gray-200 dark:bg-neutral-800 text-gray-700 dark:text-gray-300'
            }`}>
              {completedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800'
            }`}
          >
            <span>All</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'all' ? 'bg-gray-800 dark:bg-gray-100 text-gray-200 dark:text-gray-800' : 'bg-gray-200 dark:bg-neutral-800 text-gray-700 dark:text-gray-300'
            }`}>
              {actionItems.length}
            </span>
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={myTasksOnly}
            onChange={(e) => setMyTasksOnly(e.target.checked)}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-gray-300 dark:border-neutral-700"
          />
          <span>My Tasks Only</span>
        </label>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mb-3"></div>
            <p className="text-xs text-gray-500">Loading action items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-gray-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-900 max-w-2xl mx-auto shadow-sm">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <CheckSquare className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
              {activeTab === 'pending'
                ? 'No pending action items!'
                : activeTab === 'completed'
                ? 'No completed action items yet'
                : 'No action items found'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
              When call insights are recorded across Direct Channel, Consulting Partners, or Fractional Leaders, the AI model automatically detects actionable commitments, assigns them to you, and lists them here.
            </p>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors"
            >
              Go to Direct Channel
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50/75 dark:bg-neutral-950/50 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <th className="py-3.5 pl-6 pr-3 w-12 text-center">Status</th>
                    <th className="py-3.5 px-4 min-w-[280px]">Action Item / Task</th>
                    <th className="py-3.5 px-4 min-w-[200px]">Contact & Organization</th>
                    <th className="py-3.5 px-4 min-w-[140px]">Assignee (Insight Creator)</th>
                    <th className="py-3.5 px-4 min-w-[110px]">Date Added</th>
                    <th className="py-3.5 px-4 min-w-[120px]">Closed By (Due)</th>
                    <th className="py-3.5 pl-3 pr-6 text-right w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {filteredItems.map((item) => {
                    const isCompleted = item.status === 'completed'
                    const dueStatus = getDueDateStatus(item.due_date, isCompleted)

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-gray-50/80 dark:hover:bg-neutral-950/40 group ${
                          isCompleted ? 'bg-gray-50/40 dark:bg-neutral-950/20' : ''
                        }`}
                      >
                        {/* Toggle Checkbox */}
                        <td className="py-4 pl-6 pr-3 text-center align-top">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            className="inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-brand-600 transition-colors cursor-pointer"
                            title={isCompleted ? 'Mark as Pending' : 'Mark as Completed'}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-300 hover:text-brand-500 dark:text-neutral-700" />
                            )}
                          </button>
                        </td>

                        {/* Task Description */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1">
                            <p
                              className={`text-sm font-semibold transition-all ${
                                isCompleted
                                  ? 'line-through text-gray-400 dark:text-neutral-500'
                                  : 'text-gray-900 dark:text-white'
                              }`}
                            >
                              {item.task}
                            </p>

                            {/* Source insight preview snippet */}
                            {(item.source_insight || item.lead_activities?.content) && (
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1 bg-gray-50 dark:bg-neutral-950/70 p-2 rounded-md border border-gray-100 dark:border-neutral-800 mt-1 max-w-xl">
                                <MessageSquare className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2 italic">
                                  &quot;{item.source_insight || item.lead_activities?.content}&quot;
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Contact & Organization */}
                        <td className="py-4 px-4 align-top">
                          {(() => {
                            const entity = getEntityInfo(item)
                            return (
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Link
                                    href={entity.href}
                                    className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:underline inline-flex items-center gap-1 group/lead"
                                  >
                                    <span>{entity.name}</span>
                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover/lead:opacity-100 transition-opacity" />
                                  </Link>
                                </div>
                                {entity.subtitle && (
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[180px]">
                                    {entity.subtitle}
                                  </p>
                                )}
                                <div className="mt-1">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border ${entity.channelBadgeClass}`}>
                                    {entity.channelBadge}
                                  </span>
                                </div>
                              </div>
                            )
                          })()}
                        </td>

                        {/* Assignee / Creator */}
                        <td className="py-4 px-4 align-top">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {item.profiles?.full_name?.charAt(0) || 'U'}
                            </div>
                            <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[130px]">
                              {formatUserName(item.profiles?.full_name)}
                            </span>
                          </div>
                        </td>

                        {/* Added Date */}
                        <td className="py-4 px-4 align-top text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span>{formatDate(item.created_at)}</span>
                          </div>
                        </td>

                        {/* Closed By / Due Date */}
                        <td className="py-4 px-4 align-top whitespace-nowrap">
                          {item.due_date ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300 font-medium">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span>{formatDate(item.due_date)}</span>
                              </div>

                              {dueStatus === 'overdue' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                                  <AlertCircle className="w-2.5 h-2.5" /> Overdue
                                </span>
                              )}
                              {dueStatus === 'due_soon' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                                  Due soon
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">No deadline</span>
                          )}
                        </td>

                        {/* Delete Action */}
                        <td className="py-4 pl-3 pr-6 text-right align-top">
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Delete action item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

