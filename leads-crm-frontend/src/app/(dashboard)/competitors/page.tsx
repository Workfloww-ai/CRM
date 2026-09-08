'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSidebar } from '@/contexts/SidebarContext'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Search, Plus, Download, Upload, Trash2, History, ChevronLeft, ChevronRight, File, X, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown, Filter, User, Edit2, Save, Loader2, Menu, Copy, Check } from 'lucide-react'
import { API_URL } from '@/lib/api'

type Competitor = {
  id: string
  name: string
  website: string | null
  status: string
  created_at: string
  updated_at: string
  competitor_activities?: { created_at: string, profiles: { full_name: string } | null }[]
}

type Profile = {
  full_name: string
  email: string
  role_level: number
}

type Activity = {
  id: string
  type: string
  content: string
  created_at: string
  profiles: { full_name: string } | null
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text || text === '—') return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0 focus:outline-none"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function formatUserName(fullName: string | null | undefined) {
  if (!fullName) return 'Unknown'
  if (fullName.includes('@')) {
    const namePart = fullName.split('@')[0]
    return namePart.split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ')
  }
  return fullName
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [activities, setActivities] = useState<Activity[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'website' | 'status' | null, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' } as any)

  const [isEditingContact, setIsEditingContact] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Competitor>>({})
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar()

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }
  const [page, setPage] = useState(1)
  const [totalCompetitors, setTotalCompetitors] = useState(0)
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([])
  const pageSize = 20

  const fetchCompetitors = useCallback(async () => {
    const token = await getToken()
    if (!token) {
      setError('Not logged in')
      setLoading(false)
      return
    }

    const params = new URLSearchParams()
    params.set('page', page.toString())
    params.set('page_size', pageSize.toString())
    if (search) params.set('search', search)
    if (sortConfig.key) {
      params.set('sort_by', sortConfig.key)
      params.set('sort_desc', (sortConfig.direction === 'desc').toString())
    }

    try {
      const res = await fetch(`${API_URL}/competitors?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch competitors')
      const data = await res.json()
      setCompetitors(data.data)
      setTotalCompetitors(data.total)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, sortConfig])

  useEffect(() => { fetchCompetitors() }, [fetchCompetitors])

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profileData) setProfile(profileData)
    }
    loadProfile()
  }, [])

  const loadActivities = useCallback(async (id: string) => {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/competitors/${id}/activities`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to fetch activities')
      setActivities(await res.json())
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (expandedId) {
      loadActivities(expandedId)
    }
  }, [expandedId, loadActivities])

  const handleAddCompetitor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const token = await getToken()
    if (!token) return
    const formData = new FormData(e.target as HTMLFormElement)
    const payload = {
      name: formData.get('name') as string,
      website: formData.get('website') as string,
    }
    try {
      const res = await fetch(`${API_URL}/competitors`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to create competitor')
      setIsAddModalOpen(false)
      fetchCompetitors()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const saveContactEdits = async () => {
    if (!expandedId) return
    setIsSavingContact(true)
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/competitors/${expandedId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })
      if (!res.ok) throw new Error('Failed to update competitor')
      setCompetitors(prev => prev.map(c => c.id === expandedId ? { ...c, ...editForm } as Competitor : c))
      setIsEditingContact(false)
      fetchCompetitors()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSavingContact(false)
    }
  }

  const postComment = async () => {
    if (!expandedId || !commentText.trim()) return
    setIsPostingComment(true)
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/competitors/${expandedId}/notes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() })
      })
      if (!res.ok) throw new Error('Failed to post comment')
      setCommentText('')
      loadActivities(expandedId)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsPostingComment(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedCompetitors.length === 0) return
    const confirmed = confirm(`Delete ${selectedCompetitors.length} competitors? This cannot be undone.`)
    if (!confirmed) return
    const token = await getToken()
    if (!token) return
    try {
      await Promise.all(selectedCompetitors.map(id =>
        fetch(`${API_URL}/competitors/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ))
      setSelectedCompetitors([])
      fetchCompetitors()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleExport = async () => {
    const token = await getToken()
    if (!token) return
    try {
      const urlStr = `${API_URL}/competitors/export`
      const res = await fetch(urlStr, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to export')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `competitors_export.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const downloadImportTemplate = async (type: 'csv' | 'xlsx') => {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/competitors/import-template-xlsx`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to download template')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `competitors_import_template.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const token = await getToken()
    if (!token) return
    const formData = new FormData(e.currentTarget)
    const file = formData.get('file') as File
    if (!file || file.size === 0) {
      alert('Please select a file to import')
      return
    }
    setImporting(true)
    try {
      const res = await fetch(`${API_URL}/competitors/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      alert(`Imported ${data.imported_count} competitors successfully.`)
      setIsImportModalOpen(false)
      fetchCompetitors()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setImporting(false)
    }
  }

  const toggleSort = (key: 'name' | 'website' | 'status') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const expandedCompetitor = competitors.find(c => c.id === expandedId)

  if (loading && competitors.length === 0) return <div className="p-8">Loading...</div>

  return (
    <>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 px-3 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Toggle Sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold">Competitors</h1>
          </div>
        </header>

        <div className="flex-1 flex flex-col p-6 min-h-0">
          <div className="w-full flex flex-col h-full space-y-6">
            <div className="shrink-0 space-y-6">

              <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                  <Upload className="w-4 h-4" /> Import
                </button>
                <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                  <Download className="w-4 h-4" /> Export
                </button>
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add New
                </button>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 flex items-center gap-2 sm:gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search competitors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedCompetitors.length > 0 && profile?.role_level && profile.role_level >= 1 ? (
                  <button onClick={handleDeleteSelected} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" /> Delete ({selectedCompetitors.length})
                  </button>
                ) : null}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl overflow-x-auto shadow-sm">
              <div className="min-w-[800px]">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800 uppercase">
                    <tr>
                      <th className="px-4 py-3 w-12">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                          checked={selectedCompetitors.length === competitors.length && competitors.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCompetitors(competitors.map(c => c.id))
                            } else {
                              setSelectedCompetitors([])
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-800" onClick={() => toggleSort('name')}>
                        <div className="flex items-center gap-2">
                          Name
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-800" onClick={() => toggleSort('website')}>
                        <div className="flex items-center gap-2">
                          Website
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-800" onClick={() => toggleSort('status')}>
                        <div className="flex items-center gap-2">
                          Status
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="px-4 py-3 font-medium">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-neutral-800">
                    {competitors.map(competitor => (
                      <tr
                        key={competitor.id}
                        onClick={() => {
                          setExpandedId(competitor.id)
                          setIsEditingContact(false)
                        }}
                        className={`hover:bg-gray-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors ${expandedId === competitor.id ? 'bg-brand-50 dark:bg-brand-900/10' : ''}`}
                      >
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
                            checked={selectedCompetitors.includes(competitor.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCompetitors([...selectedCompetitors, competitor.id])
                              } else {
                                setSelectedCompetitors(selectedCompetitors.filter(id => id !== competitor.id))
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white flex items-center">
                            {competitor.name}
                            <CopyButton text={competitor.name} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-500 dark:text-neutral-400 flex items-center max-w-[200px] truncate" title={competitor.website || ''}>
                            {competitor.website || '—'}
                            <CopyButton text={competitor.website || ''} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={competitor.status === 'New' ? 'default' : 'secondary'} className="font-medium">{competitor.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-500 dark:text-neutral-400">
                            {competitor.competitor_activities?.[0] ? (
                              <span>
                                {new Date(competitor.competitor_activities[0].created_at).toLocaleDateString()}
                                {' · '}
                                {formatUserName(competitor.competitor_activities[0].profiles?.full_name)}
                              </span>
                            ) : (
                              <span>No activity yet</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {competitors.length === 0 && !loading && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-neutral-400">
                          No competitors found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalCompetitors > 0 && (
              <div className="flex items-center justify-between mt-6 px-2">
                <div className="text-sm text-gray-500 dark:text-neutral-400">
                  Showing <span className="font-medium text-gray-900 dark:text-white">{(page - 1) * pageSize + 1}</span> to <span className="font-medium text-gray-900 dark:text-white">{Math.min(page * pageSize, totalCompetitors)}</span> of <span className="font-medium text-gray-900 dark:text-white">{totalCompetitors}</span> results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-200 dark:border-neutral-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * pageSize >= totalCompetitors}
                    className="p-2 rounded-lg border border-gray-200 dark:border-neutral-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Slide-out Panel */}
      {expandedCompetitor && (
        <>
          <div
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-20 lg:hidden"
            onClick={() => setExpandedId(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-white dark:bg-[#111] border-l border-gray-200 dark:border-neutral-800 shadow-2xl z-30 flex flex-col transform transition-transform duration-300">
            {/* Panel Header */}
            <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-400 flex items-center justify-center font-bold text-lg">
                  {expandedCompetitor.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    {expandedCompetitor.name}
                  </h2>
                  <div className="text-sm text-gray-500 dark:text-neutral-400 flex items-center gap-2">
                    {expandedCompetitor.website || 'No website'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setExpandedId(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Contact Info */}
              <div className="p-5 border-b border-gray-200 dark:border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    Details
                  </h3>
                  <button
                    onClick={() => {
                      if (isEditingContact) {
                        saveContactEdits()
                      } else {
                        setEditForm({ name: expandedCompetitor.name, website: expandedCompetitor.website, status: expandedCompetitor.status })
                        setIsEditingContact(true)
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    {isEditingContact ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                  </button>
                </div>

                <div className="space-y-4">
                  {isEditingContact ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Name</label>
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Website</label>
                        <input
                          type="text"
                          value={editForm.website || ''}
                          onChange={e => setEditForm({ ...editForm, website: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border rounded-lg"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-neutral-500 mb-1">Name</div>
                        <div className="text-sm text-gray-900 dark:text-white group flex items-center">
                          {expandedCompetitor.name}
                          <CopyButton text={expandedCompetitor.name} />
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-neutral-500 mb-1">Website</div>
                        <div className="text-sm text-gray-900 dark:text-white group flex items-center">
                          {expandedCompetitor.website || '—'}
                          {expandedCompetitor.website && <CopyButton text={expandedCompetitor.website} />}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="p-5">
                <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                  <History className="w-4 h-4 text-gray-400" />
                  Activity
                </h3>

                <div className="mb-6 relative">
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Add a note..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-h-[80px]"
                  />
                  <button
                    onClick={postComment}
                    disabled={!commentText.trim() || isPostingComment}
                    className="absolute bottom-2 right-2 px-3 py-1 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {isPostingComment && <Loader2 className="w-3 h-3 animate-spin" />}
                    Post
                  </button>
                </div>

                <div className="space-y-4">
                  {activities.map(activity => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                        {activity.type === 'note' ? <History className="w-4 h-4 text-gray-500" /> : <Badge className="w-2 h-2 p-0" variant="secondary" />}
                      </div>
                      <div className="flex-1 bg-gray-50 dark:bg-neutral-900 p-3 rounded-xl rounded-tl-none">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatUserName(activity.profiles?.full_name)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-neutral-500">
                            {new Date(activity.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-neutral-400 whitespace-pre-wrap">
                          {activity.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <div className="text-center text-sm text-gray-500 py-4">No activities yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add Competitor Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Competitor">
        <form onSubmit={handleAddCompetitor} className="space-y-4 p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input required name="name" type="text" className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website Link</label>
            <input name="website" type="text" className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 transition-colors shadow-sm">Save Competitor</button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Import Competitors">
        <div className="p-4">
          <div className="mb-6 bg-blue-50 text-blue-800 p-4 rounded-lg">
            <h4 className="font-medium mb-2">How to import:</h4>
            <ol className="list-decimal list-inside text-sm space-y-1">
              <li>Download the import template</li>
              <li>Fill in your competitor data</li>
              <li>Upload the completed file</li>
            </ol>
            <div className="mt-4 flex gap-2">
              <button onClick={() => downloadImportTemplate('xlsx')} className="px-3 py-1.5 text-sm font-medium bg-white border border-blue-200 rounded-lg hover:bg-blue-50">Download .xlsx</button>
            </div>
          </div>
          <form onSubmit={handleImport} className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input required type="file" name="file" accept=".csv,.xlsx" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg">Cancel</button>
              <button type="submit" disabled={importing} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg flex items-center gap-2">{importing && <Loader2 className="w-4 h-4 animate-spin" />} {importing ? 'Importing...' : 'Import'}</button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  )
}