'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSidebar } from '@/contexts/SidebarContext'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Search, Plus, Download, Upload, Trash2, History, ChevronLeft, ChevronRight, File, X, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown, Filter, User, Edit2, Save, Loader2, Menu } from 'lucide-react'

type Lead = {
  id: string
  first_name: string
  last_name: string | null
  title: string | null
  org: string | null
  industry: string | null
  email: string | null
  phone: string | null
  phone_2: string | null
  linkedin: string | null
  location: string | null
  status: string
  next_action: string | null
  due_date: string | null
  revenue?: number | null
  currency?: string | null
  lead_activities?: { created_at: string, profiles: { full_name: string } | null }[]
}

function isUrgent(dueDateStr: string | null) {
  if (!dueDateStr) return false
  const dueDate = new Date(dueDateStr)
  const today = new Date()
  const diffTime = dueDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays <= 2
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

type Attachment = {
  id: string
  file_name: string
  created_at: string
  profiles: { full_name: string } | null
}

function fullName(lead: Lead) {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ')
}

function formatDesignation(title: string | null) {
  if (!title) return '—'
  const words = title.split(' ')
  if (words.length > 3) {
    return words.slice(0, 3).join(' ') + '...'
  }
  return title
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

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [title, setTitle] = useState('')
  const [org, setOrg] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState('New')
  const [revenue, setRevenue] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [phone, setPhone] = useState('')
  const [phone2, setPhone2] = useState('')
  const [email, setEmail] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [designationFilter, setDesignationFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [openFilter, setOpenFilter] = useState<'name' | 'org' | 'title' | 'location' | 'industry' | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [importResult, setImportResult] = useState<{ imported_count: number; errors: string[] } | null>(null)
  const [importProgress, setImportProgress] = useState<{ processed: number, total: number, percentage: number } | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'org' | 'status' | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' })

  const [isEditingContact, setIsEditingContact] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Lead>>({})
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar()

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }
  const [page, setPage] = useState(1)
  const [totalLeads, setTotalLeads] = useState(0)
  const [selectedLeads, setSelectedLeads] = useState<string[]>([])
  const pageSize = 20

  const fetchLeads = useCallback(async () => {
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
    if (nameFilter) params.set('name', nameFilter)
    if (companyFilter) params.set('org', companyFilter)
    if (designationFilter) params.set('title', designationFilter)
    if (locationFilter) params.set('location', locationFilter)
    if (industryFilter) params.set('industry', industryFilter)
    if (sortConfig.key) {
      params.set('sort_by', sortConfig.key)
      params.set('sort_dir', sortConfig.direction)
    }

    const res = await fetch(`http://localhost:8000/leads?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      setError('Failed to fetch leads')
      setLoading(false)
      return
    }

    const data = await res.json()
    setLeads(data.leads)
    setTotalLeads(data.total)
    setLoading(false)
  }, [page, search, nameFilter, companyFilter, sortConfig])

  async function fetchProfile() {
    const token = await getToken()
    if (!token) return

    const res = await fetch('http://localhost:8000/me', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json()
      setProfile(data)
    }
  }

  async function toggleActivities(leadId: string) {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null)
      return
    }

    const token = await getToken()
    if (!token) return

    const res = await fetch(`http://localhost:8000/leads/${leadId}/activities`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json()
      setActivities(data)
      setExpandedLeadId(leadId)
      fetchAttachments(leadId)
    }
  }

  async function fetchAttachments(leadId: string) {
    const token = await getToken()
    if (!token) return

    const res = await fetch(`http://localhost:8000/leads/${leadId}/attachments`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json()
      setAttachments(data)
    }
  }

  async function handleUploadAttachment(leadId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const token = await getToken()
    if (!token) return

    const formData = new FormData()
    formData.append('file', file)

    await fetch(`http://localhost:8000/leads/${leadId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    fetchAttachments(leadId)
    e.target.value = ''
  }

  async function handleDownloadAttachment(attachmentId: string) {
    const token = await getToken()
    if (!token) return

    const res = await fetch(`http://localhost:8000/attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    window.open(data.url, '_blank')
  }

  async function handleDeleteAttachment(attachmentId: string, leadId: string) {
    const confirmed = confirm('Delete this attachment?')
    if (!confirmed) return

    const token = await getToken()
    if (!token) return

    await fetch(`http://localhost:8000/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    fetchAttachments(leadId)
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault()
    const token = await getToken()
    if (!token) return

    const res = await fetch('http://localhost:8000/leads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        title,
        org,
        industry,
        status,
        phone,
        phone_2: phone2,
        email,
        next_action: nextAction,
        due_date: dueDate || null,
        revenue: revenue ? Number(revenue) : null,
        currency
      }),
    })

    if (res.ok) {
      setFirstName('')
      setLastName('')
      setTitle('')
      setOrg('')
      setNextAction('')
      setDueDate('')
      setIndustry('')
      setStatus('New')
      setRevenue('')
      setCurrency('INR')
      setPhone('')
      setPhone2('')
      setEmail('')
      setIsAddLeadModalOpen(false)
      fetchLeads()
    }
  }

  useEffect(() => {
    setPage(1)
  }, [search, nameFilter, companyFilter, designationFilter, locationFilter, industryFilter, sortConfig])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeads()
    }, 300)
    return () => clearTimeout(timer)
  }, [fetchLeads])

  useEffect(() => {
    fetchProfile()
  }, [])

  async function handleStatusChange(leadId: string, newStatus: string) {
    const token = await getToken()
    if (!token) return

    await fetch(`http://localhost:8000/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus }),
    })

    fetchLeads()
  }

  async function handleFieldUpdate(leadId: string, field: string, value: string) {
    const token = await getToken()
    if (!token) return

    await fetch(`http://localhost:8000/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ [field]: value || null }),
    })
    fetchLeads()
  }

  async function handleUpdateContact(leadId: string) {
    setIsSavingContact(true)
    const token = await getToken()
    if (!token) {
      setIsSavingContact(false)
      return
    }

    const res = await fetch(`http://localhost:8000/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(editForm),
    })

    if (res.ok) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...editForm } as Lead : l))
      setIsEditingContact(false)
      fetchLeads()
    }
    setIsSavingContact(false)
  }

  async function handleQuickActionSubmit(leadId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSavingContact(true)
    const formData = new FormData(e.currentTarget)
    const status = formData.get('status') as string
    const next_action = formData.get('next_action') as string
    const due_date = formData.get('due_date') as string

    const token = await getToken()
    if (!token) {
      setIsSavingContact(false)
      return
    }

    const payload = {
      status,
      next_action: next_action || null,
      due_date: due_date || null
    }

    const res = await fetch(`http://localhost:8000/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...payload } as Lead : l))
      fetchLeads()
    }
    setIsSavingContact(false)
  }

  async function handleAddComment(leadId: string, e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return

    setIsPostingComment(true)
    const token = await getToken()
    if (!token) {
      setIsPostingComment(false)
      return
    }

    const res = await fetch(`http://localhost:8000/leads/${leadId}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: commentText }),
    })

    if (res.ok) {
      setCommentText('')
      const actsRes = await fetch(`http://localhost:8000/leads/${leadId}/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (actsRes.ok) {
        const data = await actsRes.json()
        setActivities(data)
      }
    }
    setIsPostingComment(false)
  }

  async function handleDelete(leadId: string) {
    const confirmed = confirm('Delete this lead? This cannot be undone.')
    if (!confirmed) return

    const token = await getToken()
    if (!token) return

    await fetch(`http://localhost:8000/leads/${leadId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    fetchLeads()
  }

  async function handleBulkDelete() {
    if (selectedLeads.length === 0) return
    const confirmed = confirm(`Delete ${selectedLeads.length} leads? This cannot be undone.`)
    if (!confirmed) return

    const token = await getToken()
    if (!token) return

    await Promise.all(selectedLeads.map(leadId =>
      fetch(`http://localhost:8000/leads/${leadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    ))

    setSelectedLeads([])
    fetchLeads()
  }

  async function handleExport() {
    const token = await getToken()
    if (!token) return

    const res = await fetch('http://localhost:8000/leads/export', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_export.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  async function handleDownloadTemplate() {
    const token = await getToken()
    if (!token) return

    const res = await fetch('http://localhost:8000/leads/import-template-xlsx', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_import_template.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const token = await getToken()
    if (!token) return

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('http://localhost:8000/leads/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json()
      setImportResult({ imported_count: 0, errors: [data.detail || 'Import failed'] })
      e.target.value = ''
      return
    }

    setImportResult(null)
    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.type === 'progress') {
            setImportProgress({ processed: data.processed, total: data.total, percentage: data.percentage })
          } else if (data.type === 'complete') {
            setImportProgress(null)
            setImportResult({ imported_count: data.imported_count, errors: data.errors })
            fetchLeads()
          }
        } catch (err) {
          console.error('Failed to parse NDJSON line', line)
        }
      }
    }

    e.target.value = '' // reset the file input so the same file can be re-selected if needed
  }

  const handleSort = (key: 'name' | 'org' | 'status') => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const SortIcon = ({ columnKey }: { columnKey: 'name' | 'org' | 'status' }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
  }

  if (loading) return (
    <main className="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
    </main>
  )
  if (error) return (
    <main className="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
      <div className="text-red-500 bg-red-50 p-4 rounded-lg">Error: {error}</div>
    </main>
  )

  const expandedLead = leads.find(l => l.id === expandedLeadId)

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
            <h1 className="text-xl font-semibold">Leads</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {/* <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
              title="Download a blank Excel template with a status dropdown"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Template
            </button> */}
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              Import
              <input type="file" accept=".csv,.xlsx" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={() => setIsAddLeadModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col p-6 min-h-0">
          <div className="w-full flex flex-col h-full space-y-6">
            <div className="shrink-0 space-y-6">
              {importProgress && (
                <div className="bg-white dark:bg-neutral-900 border border-brand-200 dark:border-brand-800/50 p-4 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">Importing Leads...</span>
                    <span className="text-gray-500 dark:text-gray-400">{importProgress.processed} / {importProgress.total} ({importProgress.percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-brand-600 h-2 rounded-full transition-all duration-300" style={{ width: `${importProgress.percentage}%` }}></div>
                  </div>
                </div>
              )}

              {importResult && (
                <div className="bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 p-4 rounded-lg text-sm border border-brand-100 dark:border-brand-800/50">
                  <p className="font-medium">Imported {importResult.imported_count} lead(s).</p>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-red-600 dark:text-red-400">
                      {importResult.errors.map((err, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <X className="w-4 h-4 shrink-0" /> {err}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    placeholder="Search by name, org, or title..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors outline-none text-sm shadow-sm"
                  />
                </div>
                {selectedLeads.length > 0 && profile?.role_level && profile.role_level >= 1 ? (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete ({selectedLeads.length})
                  </button>
                ) : null}
              </div>

            </div>

            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm flex flex-col min-h-0 flex-1">
              <div className="overflow-auto flex-1">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800">
                  <thead className="bg-gray-50 dark:bg-neutral-900/50">
                    <tr>
                      <th scope="col" className="w-12 px-3 py-2 text-left align-top">
                        <input
                          type="checkbox"
                          checked={leads.length > 0 && selectedLeads.length === leads.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeads(leads.map(l => l.id))
                            } else {
                              setSelectedLeads([])
                            }
                          }}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top relative">
                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit">
                          <div className="cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors p-1 -ml-1 rounded flex items-center" onClick={() => handleSort('name')}>
                            Name <SortIcon columnKey="name" />
                          </div>
                          <button
                            onClick={() => setOpenFilter(openFilter === 'name' ? null : 'name')}
                            className={`ml-1 p-1 rounded transition-colors ${nameFilter ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-800'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openFilter === 'name' && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenFilter(null)}></div>
                            <div className="absolute top-full left-6 mt-1 z-20 w-48 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg p-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Filter name..."
                                value={nameFilter}
                                onChange={(e) => setNameFilter(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-brand-500 outline-none font-normal"
                              />
                            </div>
                          </>
                        )}
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top relative">
                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit">
                          <div className="p-1 -ml-1 flex items-center">
                            Designation
                          </div>
                          <button
                            onClick={() => setOpenFilter(openFilter === 'title' ? null : 'title')}
                            className={`ml-1 p-1 rounded transition-colors ${designationFilter ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-800'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openFilter === 'title' && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenFilter(null)}></div>
                            <div className="absolute top-full left-6 mt-1 z-20 w-48 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg p-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Filter designation..."
                                value={designationFilter}
                                onChange={(e) => setDesignationFilter(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-brand-500 outline-none font-normal"
                              />
                            </div>
                          </>
                        )}
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top relative">
                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit">
                          <div className="cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors p-1 -ml-1 rounded flex items-center" onClick={() => handleSort('org')}>
                            Company <SortIcon columnKey="org" />
                          </div>
                          <button
                            onClick={() => setOpenFilter(openFilter === 'org' ? null : 'org')}
                            className={`ml-1 p-1 rounded transition-colors ${companyFilter ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-800'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openFilter === 'org' && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenFilter(null)}></div>
                            <div className="absolute top-full left-6 mt-1 z-20 w-48 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg p-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Filter company..."
                                value={companyFilter}
                                onChange={(e) => setCompanyFilter(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-brand-500 outline-none font-normal"
                              />
                            </div>
                          </>
                        )}
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top relative">
                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit">
                          <div className="p-1 -ml-1 flex items-center">
                            Location
                          </div>
                          <button
                            onClick={() => setOpenFilter(openFilter === 'location' ? null : 'location')}
                            className={`ml-1 p-1 rounded transition-colors ${locationFilter ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-800'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openFilter === 'location' && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenFilter(null)}></div>
                            <div className="absolute top-full left-6 mt-1 z-20 w-48 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg p-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Filter location..."
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-brand-500 outline-none font-normal"
                              />
                            </div>
                          </>
                        )}
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top relative">
                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit">
                          <div className="p-1 -ml-1 flex items-center">
                            Industry
                          </div>
                          <button
                            onClick={() => setOpenFilter(openFilter === 'industry' ? null : 'industry')}
                            className={`ml-1 p-1 rounded transition-colors ${industryFilter ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-800'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openFilter === 'industry' && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenFilter(null)}></div>
                            <div className="absolute top-full left-6 mt-1 z-20 w-48 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg p-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Filter industry..."
                                value={industryFilter}
                                onChange={(e) => setIndustryFilter(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-brand-500 outline-none font-normal"
                              />
                            </div>
                          </>
                        )}
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top">
                        <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors p-1 -ml-1 rounded w-fit" onClick={() => handleSort('status')}>
                          Status <SortIcon columnKey="status" />
                        </div>
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider p-1">
                          Next Action
                        </div>
                      </th>
                      <th scope="col" className="px-3 py-2 text-left align-top">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider p-1">
                          Last Contacted
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-800">
                    {leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors group">
                        <td className="px-3 py-3 ">
                          <input
                            type="checkbox"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeads([...selectedLeads, lead.id])
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id))
                              }
                            }}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-3 ">
                          <button onClick={() => toggleActivities(lead.id)} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                            {fullName(lead)}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          <div title={lead.title || ''}>{formatDesignation(lead.title)}</div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          {lead.org || '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          {lead.location || '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          {lead.industry || '—'}
                        </td>
                        <td className="px-3 py-3 ">
                          <div className="relative inline-block w-fit">
                            <select
                              value={lead.status}
                              onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            >
                              <option>New</option>
                              <option>Contacted</option>
                              <option>Follow-up</option>
                              <option>Won</option>
                              <option>Lost</option>
                            </select>
                            <Badge status={lead.status} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          {lead.next_action && <div className="text-gray-900 dark:text-gray-200 font-medium truncate w-40" title={lead.next_action}>{lead.next_action}</div>}
                          {lead.due_date && <div className={`text-xs mt-0.5 ${isUrgent(lead.due_date) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500'}`}>{new Date(lead.due_date).toLocaleDateString()}</div>}
                          {!lead.next_action && !lead.due_date && <span className="text-gray-500 dark:text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-sm">
                          {lead.lead_activities && lead.lead_activities.length > 0 ? (
                            <div>
                              <div className="text-gray-900 dark:text-gray-200 font-medium truncate w-32" title={formatUserName(lead.lead_activities[0].profiles?.full_name)}>
                                {formatUserName(lead.lead_activities[0].profiles?.full_name)}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {new Date(lead.lead_activities[0].created_at).toLocaleDateString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-12 text-center text-sm text-gray-500">
                          No leads found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-200 dark:border-neutral-800 px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-neutral-900/50 shrink-0">
                <div className="text-sm text-gray-500">
                  Page <span className="font-medium">{page}</span> of <span className="font-medium">{Math.max(1, Math.ceil(totalLeads / pageSize))}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    disabled={page >= Math.ceil(totalLeads / pageSize)}
                    onClick={() => setPage(page + 1)}
                    className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Modal
        isOpen={isAddLeadModalOpen}
        onClose={() => setIsAddLeadModalOpen(false)}
        title="Add New Lead"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAddLead} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">First Name *</label>
              <input
                placeholder="e.g. Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Last Name</label>
              <input
                placeholder="e.g. Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Title</label>
              <input
                placeholder="e.g. CEO"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Organization</label>
              <input
                placeholder="e.g. Acme Corp"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Industry</label>
              <input
                placeholder="e.g. Technology"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              >
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Revenue</label>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-24 px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  className="flex-1 w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Phone 1</label>
              <input
                placeholder="+1 234 567 890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Phone 2</label>
              <input
                placeholder="+1 234 567 891"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Email</label>
              <input
                type="email"
                placeholder="e.g. name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Next Action</label>
              <input
                placeholder="e.g. Follow up email"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setIsAddLeadModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-lg transition-colors border border-gray-200 dark:border-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm"
            >
              Create Lead
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={expandedLeadId !== null}
        onClose={() => {
          setExpandedLeadId(null)
          setIsEditingContact(false)
        }}
        title=""
        maxWidth="max-w-3xl"
        hideHeader
      >
        <div className="max-h-[85vh] overflow-y-auto">
          {expandedLead && (
            <div className="p-8">
              {!isEditingContact ? (
                <>
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{fullName(expandedLead)}</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                        {expandedLead.title || 'Unknown Position'} &bull; {expandedLead.org || 'Unknown Company'} &bull; {expandedLead.industry || 'Unknown Industry'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditForm(expandedLead); setIsEditingContact(true); }} className="text-brand-600 hover:text-brand-700 hover:bg-brand-50 transition-colors p-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium mr-2">
                        <Edit2 className="w-4 h-4" /> Edit
                      </button>
                      <button onClick={() => { setExpandedLeadId(null); setIsEditingContact(false) }} className="text-gray-400 hover:text-gray-500 transition-colors p-1 -mt-2 -mr-2">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-y-6 gap-x-8 mb-8 border-b border-gray-100 dark:border-neutral-800 pb-8">
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Email</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">{expandedLead.email || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Phone</div>
                      <div className="text-sm font-mono text-gray-900 dark:text-gray-200">{expandedLead.phone || '—'}</div>
                      {expandedLead.phone_2 && <div className="text-sm font-mono text-gray-500 dark:text-gray-400 mt-1">{expandedLead.phone_2}</div>}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Location</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200">{expandedLead.location || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Revenue</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                        {expandedLead.revenue != null ? `${expandedLead.currency} ${expandedLead.revenue.toLocaleString()}` : '—'}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-8">
                    <div className="w-full max-w-lg space-y-3">
                      <div className="flex gap-3">
                        <input value={editForm.first_name || ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} placeholder="First Name" className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/2 pb-1" />
                        <input value={editForm.last_name || ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} placeholder="Last Name" className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/2 pb-1" />
                      </div>
                      <div className="flex items-center gap-3">
                        <input value={editForm.title || ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Position" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/3 pb-1" />
                        <span className="text-gray-400">&bull;</span>
                        <input value={editForm.org || ''} onChange={(e) => setEditForm({ ...editForm, org: e.target.value })} placeholder="Company" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/3 pb-1" />
                        <span className="text-gray-400">&bull;</span>
                        <input value={editForm.industry || ''} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} placeholder="Industry" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/3 pb-1" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-4">
                      <button onClick={() => setIsEditingContact(false)} className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                      <button onClick={() => handleUpdateContact(expandedLead.id)} disabled={isSavingContact} className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50 shadow-sm">{isSavingContact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-y-6 gap-x-8 mb-8 border-b border-gray-100 dark:border-neutral-800 pb-8">
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Email</div>
                      <input value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Phone</div>
                      <div className="flex gap-2">
                        <input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone 1" className="w-1/2 px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                        <input value={editForm.phone_2 || ''} onChange={(e) => setEditForm({ ...editForm, phone_2: e.target.value })} placeholder="Phone 2" className="w-1/2 px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Location</div>
                      <input value={editForm.location || ''} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="w-full px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Revenue</div>
                      <div className="flex gap-2">
                        <select
                          value={editForm.currency || 'INR'}
                          onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                          className="w-16 px-1 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                        <input
                          type="number"
                          value={editForm.revenue || ''}
                          onChange={(e) => setEditForm({ ...editForm, revenue: e.target.value ? Number(e.target.value) : null })}
                          className="flex-1 px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={(e) => handleQuickActionSubmit(expandedLead.id, e)} className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 mb-10 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gray-200 dark:bg-neutral-800 group-hover:bg-brand-500 transition-colors"></div>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-base font-bold text-gray-900 dark:text-white">Update status & next action</h4>
                  <button type="submit" disabled={isSavingContact} className="text-xs font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm cursor-pointer">
                    {isSavingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Updates
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Status</label>
                    <select
                      name="status"
                      defaultValue={expandedLead.status}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg text-sm font-medium text-gray-900 dark:text-white focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm"
                    >
                      <option>New</option>
                      <option>Contacted</option>
                      <option>Follow-up</option>
                      <option>Won</option>
                      <option>Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Next Action</label>
                    <input
                      name="next_action"
                      defaultValue={expandedLead.next_action || ''}
                      placeholder="e.g. Follow up email"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg text-sm text-gray-900 dark:text-white focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Due Date</label>
                    <input
                      name="due_date"
                      type="date"
                      defaultValue={expandedLead.due_date ? expandedLead.due_date.split('T')[0] : ''}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg text-sm text-gray-900 dark:text-white focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
              </form>
              <div>
                {/* <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" /> Activity Timeline
            </h3> */}

                {/* {expandedLeadId && (
              <form onSubmit={(e) => handleAddComment(expandedLeadId, e)} className="mb-6">
                <div className="relative">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a note or comment..."
                    className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm resize-none min-h-[80px]"
                  />
                  <div className="absolute bottom-2 right-2">
                    <button
                      type="submit"
                      disabled={isPostingComment || !commentText.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isPostingComment && <Loader2 className="w-3 h-3 animate-spin" />}
                      Post
                    </button>
                  </div>
                </div>
              </form>
            )} */}

                <div className="space-y-4">
                  {activities.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No activity yet.</p>
                  )}
                  {activities.map((a) => (
                    <div key={a.id} className="relative pl-4 border-l-2 border-gray-200 dark:border-neutral-800 pb-4 last:pb-0 last:border-transparent">
                      <div className="absolute w-2 h-2 bg-brand-500 rounded-full -left-[5px] top-1.5 ring-4 ring-white dark:ring-neutral-900"></div>
                      <p className="text-xs text-gray-500 mb-0.5">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-200">
                        <span className="font-medium text-gray-900 dark:text-white">{formatUserName(a.profiles?.full_name)}</span>{' '}
                        <span className="text-gray-600 dark:text-gray-400">{a.content}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <File className="w-4 h-4 text-gray-400" /> Attachments
                  </h3>
                  <label className="cursor-pointer text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
                    Upload
                    <input
                      type="file"
                      onChange={(e) => expandedLeadId && handleUploadAttachment(expandedLeadId, e)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {attachments.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No attachments.</p>
                  )}
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-neutral-800/50 border border-gray-100 dark:border-neutral-800 rounded-lg group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <File className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={a.file_name}>{a.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDownloadAttachment(a.id)}
                          className="text-gray-400 hover:text-brand-600 transition-colors p-1"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {profile?.role_level && profile.role_level >= 1 && (
                          <button
                            onClick={() => expandedLeadId && handleDeleteAttachment(a.id, expandedLeadId)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}