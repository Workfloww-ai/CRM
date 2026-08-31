'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSidebar } from '@/contexts/SidebarContext'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Search, Plus, Download, Upload, Trash2, History, ChevronLeft, ChevronRight, File, X, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown, Filter, User, Edit2, Save, Loader2, Menu, Copy, Check, Mail } from 'lucide-react'
import { API_URL } from '@/lib/api'

type FractionalLeader = {
  id: string
  first_name: string
  last_name: string | null
  title: string | null
  domain: string | null
  industry: string | null
  function: string | null
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
  fractional_leader_activities?: { created_at: string, profiles: { full_name: string } | null }[]
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

function fullName(leader: FractionalLeader) {
  return [leader.first_name, leader.last_name].filter(Boolean).join(' ')
}

function formatDesignation(title: string | null) {
  if (!title) return '—'
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

export default function FractionalLeadersPage() {
  const [leaders, setLeaders] = useState<FractionalLeader[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddLeaderModalOpen, setIsAddLeaderModalOpen] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [title, setTitle] = useState('')
  const [org, setOrg] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState('New')
  const [revenue, setRevenue] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [phone, setPhone] = useState('')
  const [phone2, setPhone2] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('')
  const [functionField, setFunctionField] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false)
  const [exportTypes, setExportTypes] = useState<string[]>(['number'])
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const q = urlParams.get('search')
      if (q && search === '') setSearch(q)
    }
  }, [])


  const [nameFilter, setNameFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [designationFilter, setDesignationFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [functionFilter, setFunctionFilter] = useState('')
  const [openFilter, setOpenFilter] = useState<'name' | 'domain' | 'title' | 'location' | 'industry' | 'function' | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [expandedLeaderId, setExpandedLeaderId] = useState<string | null>(null)
  const [senderAccount, setSenderAccount] = useState('manish@workfloww.ai')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [ccEmails, setCcEmails] = useState('')
  const [bccEmails, setBccEmails] = useState('manish.chum@workfloww.ai,shilpa.chitkara@workfloww.ai')
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailTargetLeader, setEmailTargetLeader] = useState<FractionalLeader | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && leaders.length > 0 && expandedLeaderId === null) {
      const urlParams = new URLSearchParams(window.location.search)
      const id = urlParams.get('id')
      if (id && leaders.some(l => l.id === id)) {
        setExpandedLeaderId(id)
        window.history.replaceState({}, '', '/leads')
      }
    }
  }, [leaders, expandedLeaderId])

  const [activities, setActivities] = useState<Activity[]>([])
  const [importResult, setImportResult] = useState<{ imported_count: number; errors: string[] } | null>(null)
  const [importProgress, setImportProgress] = useState<{ processed: number, total: number, percentage: number } | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'domain' | 'status' | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' })

  const [isEditingContact, setIsEditingContact] = useState(false)
  const [editForm, setEditForm] = useState<Partial<FractionalLeader>>({})
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar()

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }
  const [page, setPage] = useState(1)
  const [totalLeaders, setTotalLeaders] = useState(0)
  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([])
  const pageSize = 20

  const fetchLeaders = useCallback(async () => {
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
    if (companyFilter) params.set('domain', companyFilter)
    if (designationFilter) params.set('title', designationFilter)
    if (locationFilter) params.set('location', locationFilter)
    if (industryFilter) params.set('industry', industryFilter)
    if (functionFilter) params.set('function', functionFilter)
    if (sortConfig.key) {
      params.set('sort_by', sortConfig.key)
      params.set('sort_dir', sortConfig.direction)
    }

    const res = await fetch(`${API_URL}/fractional-leaders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      setError('Failed to fetch leads')
      setLoading(false)
      return
    }

    const data = await res.json()
    setLeaders(data.data)
    setTotalLeaders(data.total)
    setLoading(false)
  }, [page, search, nameFilter, companyFilter, designationFilter, locationFilter, industryFilter, functionFilter, sortConfig])

  async function fetchProfile() {
    const token = await getToken()
    if (!token) return

    const res = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json()
      setProfile(data)
    }
  }

  async function toggleActivities(leaderId: string) {
    if (expandedLeaderId === leaderId) {
      setExpandedLeaderId(null)
      return
    }

    const token = await getToken()
    if (!token) return

    const res = await fetch(`${API_URL}/fractional-leaders/${leaderId}/activities`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json()
      setActivities(data)
      setExpandedLeaderId(leaderId)
      fetchAttachments(leaderId)
    }
  }

  async function fetchAttachments(leaderId: string) {
    const token = await getToken()
    if (!token) return

    const res = await fetch(`${API_URL}/fractional-leaders/${leaderId}/attachments`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json()
      setAttachments(data)
    }
  }

  async function handleUploadAttachment(leaderId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const token = await getToken()
    if (!token) return

    const formData = new FormData()
    formData.append('file', file)

    await fetch(`${API_URL}/fractional-leaders/${leaderId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    fetchAttachments(leaderId)
    e.target.value = ''
  }

  async function handleDownloadAttachment(attachmentId: string) {
    const token = await getToken()
    if (!token) return

    const res = await fetch(`${API_URL}/attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const data = await res.json()
    window.open(data.url, '_blank')
  }

  async function handleDeleteAttachment(attachmentId: string, leaderId: string) {
    const confirmed = confirm('Delete this attachment?')
    if (!confirmed) return

    const token = await getToken()
    if (!token) return

    await fetch(`${API_URL}/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    fetchAttachments(leaderId)
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault()
    const token = await getToken()
    if (!token) return

    const res = await fetch(`${API_URL}/fractional-leaders`, {
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
        function: functionField,
        status,
        location,
        phone,
        phone_2: phone2,
        email,
        linkedin,
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
      setLinkedin('')
      setDueDate('')
      setIndustry('')
      setStatus('New')
      setRevenue('')
      setCurrency('INR')
      setPhone('')
      setPhone2('')
      setEmail('')
      setLocation('')
      setFunctionField('')
      setIsAddLeaderModalOpen(false)
      fetchLeaders()
    }
  }

  useEffect(() => {
    setPage(1)
  }, [search, nameFilter, companyFilter, designationFilter, locationFilter, industryFilter, functionFilter, sortConfig])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeaders()
    }, 300)
    return () => clearTimeout(timer)
  }, [fetchLeaders])

  useEffect(() => {
    fetchProfile()
  }, [])

  async function handleStatusChange(leaderId: string, newStatus: string) {
    const token = await getToken()
    if (!token) return

    await fetch(`${API_URL}/fractional-leaders/${leaderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus }),
    })

    fetchLeaders()
  }

  async function handleFieldUpdate(leaderId: string, field: string, value: string) {
    const token = await getToken()
    if (!token) return

    await fetch(`${API_URL}/fractional-leaders/${leaderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ [field]: value || null }),
    })
    fetchLeaders()
  }

  async function handleUpdateContact(leaderId: string) {
    setIsSavingContact(true)
    const token = await getToken()
    if (!token) {
      setIsSavingContact(false)
      return
    }

    const res = await fetch(`${API_URL}/fractional-leaders/${leaderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(editForm),
    })

    if (res.ok) {
      setLeaders(prev => prev.map(l => l.id === leaderId ? { ...l, ...editForm } as FractionalLeader : l))
      setIsEditingContact(false)
      fetchLeaders()
    }
    setIsSavingContact(false)
  }

  async function handleQuickActionSubmit(leaderId: string, e: React.FormEvent<HTMLFormElement>) {
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

    const res = await fetch(`${API_URL}/fractional-leaders/${leaderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setLeaders(prev => prev.map(l => l.id === leaderId ? { ...l, ...payload } as FractionalLeader : l))
      fetchLeaders()
    }
    setIsSavingContact(false)
  }

  async function handleAddComment(leaderId: string, e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return

    setIsPostingComment(true)
    const token = await getToken()
    if (!token) {
      setIsPostingComment(false)
      return
    }

    const res = await fetch(`${API_URL}/fractional-leaders/${leaderId}/notes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: commentText }),
    })

    if (res.ok) {
      setCommentText('')
      const actsRes = await fetch(`${API_URL}/fractional-leaders/${leaderId}/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (actsRes.ok) {
        const data = await actsRes.json()
        setActivities(data)
      }
    }
    setIsPostingComment(false)
  }

  async function handleDelete(leaderId: string) {
    const confirmed = confirm('Delete this leader? This cannot be undone.')
    if (!confirmed) return

    const token = await getToken()
    if (!token) return

    await fetch(`${API_URL}/fractional-leaders/${leaderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    fetchLeaders()
  }

  async function handleBulkDelete() {
    if (selectedLeaders.length === 0) return
    const confirmed = confirm(`Delete ${selectedLeaders.length} leads? This cannot be undone.`)
    if (!confirmed) return

    const token = await getToken()
    if (!token) return

    await Promise.all(selectedLeaders.map(leaderId =>
      fetch(`${API_URL}/fractional-leaders/${leaderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    ))

    setSelectedLeaders([])
    fetchLeaders()
  }

  function handleExport() {
    setIsExportPopoverOpen(!isExportPopoverOpen)
  }

  async function executeExport() {
    const token = await getToken()
    if (!token) return

    const exportTypesQuery = exportTypes.join(',')
    const urlStr = exportTypesQuery ? `${API_URL}/fractional-leaders/export?export_type=${exportTypesQuery}` : `${API_URL}/fractional-leaders/export`

    const res = await fetch(urlStr, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportTypesQuery ? `leads_export_${exportTypesQuery}.csv` : 'leads_export.csv'
    a.click()
    window.URL.revokeObjectURL(url)
    setIsExportPopoverOpen(false)
  }

  const handleGmailClick = (leader: FractionalLeader) => {
    const to = leader.email || '';
    const subject = "Monetizing your CXO IP beyond billable hours";
    const firstName = leader.first_name ? leader.first_name.charAt(0).toUpperCase() + leader.first_name.slice(1) : '';
    const body = `Hi ${firstName},\n\nMost fractional CXOs design high-impact strategic playbooks, only to watch client execution stall the moment they step out of the room. When engagements stay tied purely to advisory hours, you hit a natural capacity ceiling and miss out on the long-term, enterprise-wide transformation budgets CEOs routinely allocate.
I’m Manish, founder at workfloww.ai (Ex EY, Airtel, Maersk, Mahindra). We built Lucid, an AI enterprise capability execution platform that fractional leaders and executive advisors use as their dedicated technology layer. By backing your strategic frameworks with our platform, you bridge the gap between executive advisory and daily operational execution positioning your practice as an end-to-end business transformation partner.\n
𝐖𝐡𝐚𝐭’𝐬 𝐢𝐧 𝐢𝘁 𝐟𝐨𝐫 𝐲𝐨𝐮𝐫 𝐭𝐨𝐩 𝐥𝐢𝐧𝐞:
- 𝐒𝐜𝐚𝐥𝐞 𝐌𝐮𝐥𝐭𝐢-𝐂𝐥𝐢𝐞𝐧𝐭 𝐀𝐑𝐑: Uncap your billable hours. Productize your playbooks and frameworks into automated AI workflows, earning recurring platform and enablement retainers across multiple enterprise clients simultaneously.
- 𝐂𝐨𝐦𝐦𝐚𝐧𝐝 𝟑𝐱–𝟓𝐱 𝐋𝐚𝐫𝐠𝐞𝐫 𝐌𝐚𝐧𝐝𝐚𝐭𝐞𝐬: Move from selling fractional hours to capturing transformation budgets, backed by real-time execution analytics and readiness scores that CEOs and Boards readily fund.
- 𝐋𝐨𝐜𝐤 𝐢𝐧 𝐒𝐭𝐢𝐜𝐤𝐢𝐞𝐫 𝐑𝐞𝐭𝐚𝐢𝐧𝐞𝐫𝐬: Stop client churn. Our AI platform drives daily simulation and workplace application, delivering undeniable proof of execution ROI that protects and extends your contracts.
- 𝐒𝐨𝐟𝐭𝐰𝐚𝐫𝐞 𝐌𝐚𝐫𝐠𝐢𝐧𝐬, 𝐙𝐞𝐫𝐨 𝐓𝐞𝐜𝐡 𝐂𝐚𝐩𝐄𝐱: Monetize like a SaaS business with zero engineering cost. You retain 100% client equity, IP ownership, and pricing control while our AI platform powers the delivery behind the scenes.\n
We are currently onboarding an exclusive cohort of Fractional CXOs and executive advisors to co-package high-ticket transformation solutions for enterprise clients.
Please note we are not offering you reseller or referral programme. We are offering you a AI tech layer which you can leverage in your consulting assignments.
Would you be open to a 15-minute founder-to-founder conversation this week? I’d love to walk you through the platform and discuss how our platform can expand your advisory practice.\n
Best,
𝐌𝐚𝐧𝐢𝐬𝐡 𝐂𝐡𝐮𝐦
Founder, Workfloww.ai
Mobile: +91-995882445`;

    let url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (senderAccount) url += `&authuser=${encodeURIComponent(senderAccount)}`;
    if (ccEmails) url += `&cc=${encodeURIComponent(ccEmails)}`;
    if (bccEmails) url += `&bcc=${encodeURIComponent(bccEmails)}`;
    window.open(url, '_blank');
  };

  async function handleDownloadTemplate() {
    const token = await getToken()
    if (!token) return

    const res = await fetch(`${API_URL}/fractional-leaders/import-template-xlsx`, {
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

    const res = await fetch(`${API_URL}/fractional-leaders/import`, {
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
            fetchLeaders()
          }
        } catch (err) {
          console.error('Failed to parse NDJSON line', line)
        }
      }
    }

    e.target.value = '' // reset the file input so the same file can be re-selected if needed
  }

  const handleSort = (key: 'name' | 'domain' | 'status') => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const SortIcon = ({ columnKey }: { columnKey: 'name' | 'domain' | 'status' }) => {
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

  const expandedLead = leaders.find(l => l.id === expandedLeaderId)

  const hasActiveFiltersOrSort = search !== '' || nameFilter !== '' || companyFilter !== '' || designationFilter !== '' || locationFilter !== '' || industryFilter !== '' || functionFilter !== '' || sortConfig.key !== null;

  const handleResetFiltersAndSort = () => {
    setSearch('')
    setNameFilter('')
    setCompanyFilter('')
    setDesignationFilter('')
    setLocationFilter('')
    setIndustryFilter('')
    setFunctionFilter('')
    setSortConfig({ key: null, direction: 'asc' })
  }

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
            <h1 className="text-xl font-semibold">Fractional Leaders</h1>
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

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative w-80">
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      placeholder="Search by name, org, or title..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors outline-none text-sm shadow-sm"
                    />
                  </div>
                  {hasActiveFiltersOrSort && (
                    <button
                      onClick={handleResetFiltersAndSort}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Reset
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {selectedLeaders.length > 0 && profile?.role_level && profile.role_level >= 1 ? (
                    <button
                      onClick={handleBulkDelete}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete ({selectedLeaders.length})
                    </button>
                  ) : null}
                  <div className="relative">
                    <button
                      onClick={handleExport}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                    {isExportPopoverOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg z-50 p-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Select additional columns to export</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Name, Title, Company, Function, and Location are always included.</p>
                        <div className="space-y-2 mb-4">
                          {['number', 'email', 'status'].map((type) => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={exportTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setExportTypes([...exportTypes, type])
                                  } else {
                                    setExportTypes(exportTypes.filter(t => t !== type))
                                  }
                                }}
                                className="text-brand-600 focus:ring-brand-500 rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{type}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setIsExportPopoverOpen(false)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={executeExport}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
                          >
                            Export
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Import
                    <input type="file" accept=".csv,.xlsx" onChange={handleImport} className="hidden" />
                  </label>
                  <button
                    onClick={() => setIsAddLeaderModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Fractional Leader
                  </button>
                </div>
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
                          checked={leaders.length > 0 && selectedLeaders.length === leaders.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeaders(leaders.map(l => l.id))
                            } else {
                              setSelectedLeaders([])
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
                          <div className="cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors p-1 -ml-1 rounded flex items-center" onClick={() => handleSort('domain')}>
                            Domain <SortIcon columnKey="domain" />
                          </div>
                          <button
                            onClick={() => setOpenFilter(openFilter === 'domain' ? null : 'domain')}
                            className={`ml-1 p-1 rounded transition-colors ${companyFilter ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-800'}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openFilter === 'domain' && (
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
                    {leaders.map((leader) => (
                      <tr key={leader.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors group">
                        <td className="px-3 py-3 ">
                          <input
                            type="checkbox"
                            checked={selectedLeaders.includes(leader.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeaders([...selectedLeaders, leader.id])
                              } else {
                                setSelectedLeaders(selectedLeaders.filter(id => id !== leader.id))
                              }
                            }}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-3 ">
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleActivities(leader.id)} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                              {fullName(leader)}
                            </button>
                            {leader.email && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmailTargetLeader(leader);
                                  setIsEmailModalOpen(true);
                                }}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                                title="Send Email"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          <div title={leader.title || ''}>{formatDesignation(leader.title)}</div>
                        </td>

                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          {leader.domain || '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                          {leader.location || '—'}
                        </td>


                        <td className="px-3 py-3 ">
                          <div className="relative inline-block w-fit">
                            <select
                              value={leader.status}
                              onChange={(e) => handleStatusChange(leader.id, e.target.value)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            >
                              <option>New</option>
                              <option>Contacted</option>
                              <option>Follow-up</option>
                              <option>Won</option>
                              <option>Lost</option>
                            </select>
                            <Badge status={leader.status} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          {leader.next_action && <div className="text-gray-900 dark:text-gray-200 font-medium whitespace-normal break-words" title={leader.next_action}>{leader.next_action}</div>}
                          {leader.due_date && <div className={`text-xs mt-0.5 ${isUrgent(leader.due_date) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500'}`}>{new Date(leader.due_date).toLocaleDateString()}</div>}
                          {!leader.next_action && !leader.due_date && <span className="text-gray-500 dark:text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-sm">
                          {leader.fractional_leader_activities && leader.fractional_leader_activities.length > 0 ? (
                            <div>
                              <div className="text-gray-900 dark:text-gray-200 font-medium whitespace-normal break-words" title={formatUserName(leader.fractional_leader_activities[0].profiles?.full_name)}>
                                {formatUserName(leader.fractional_leader_activities[0].profiles?.full_name)}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {new Date(leader.fractional_leader_activities[0].created_at).toLocaleDateString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {leaders.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-12 text-center text-sm text-gray-500">
                          No leads found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-200 dark:border-neutral-800 px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-neutral-900/50 shrink-0">
                <div className="text-sm text-gray-500">
                  Page <span className="font-medium">{page}</span> of <span className="font-medium">{Math.max(1, Math.ceil(totalLeaders / pageSize))}</span>
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
                    disabled={page >= Math.ceil(totalLeaders / pageSize)}
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
        isOpen={isAddLeaderModalOpen}
        onClose={() => setIsAddLeaderModalOpen(false)}
        title="Add New Lead"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAddLead} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">First Name *</label>
              <input
                required
                placeholder="e.g. John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
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
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Function</label>
              <input
                placeholder="e.g. Engineering"
                value={functionField}
                onChange={(e) => setFunctionField(e.target.value)}
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
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">Location</label>
              <input
                placeholder="e.g. Mumbai"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
              />
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

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">LinkedIn URL</label>
              <input
                placeholder="https://linkedin.com/in/..."
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
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
              onClick={() => setIsAddLeaderModalOpen(false)}
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
        isOpen={expandedLeaderId !== null}
        onClose={() => {
          setExpandedLeaderId(null)
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
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 mb-10 shadow-sm relative">
                  <div className="flex flex-col mb-8 gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{fullName(expandedLead)}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                          {expandedLead.title || 'Unknown Position'} &bull; {expandedLead.domain || 'Unknown Company'} &bull; {expandedLead.industry || 'Unknown Industry'} &bull; {expandedLead.function || 'Unknown Function'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => { setEditForm(expandedLead); setIsEditingContact(true); }} className="text-brand-600 hover:text-brand-700 hover:bg-brand-50 transition-colors p-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium mr-2">
                          <Edit2 className="w-4 h-4" /> Edit
                        </button>
                        <button onClick={() => { setExpandedLeaderId(null); setIsEditingContact(false) }} className="text-gray-400 hover:text-gray-500 transition-colors p-1 -mt-2 -mr-2">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 p-1">
                      <div className="flex items-center gap-3">
                        {expandedLead.email && (
                          <button onClick={() => { setEmailTargetLeader(expandedLead); setIsEmailModalOpen(true); }} className="text-white bg-red-600 hover:bg-red-700 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium shadow-sm whitespace-nowrap shrink-0">
                            <Mail className="w-4 h-4" /> Send Email via Gmail
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-y-6 gap-x-8">
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Email</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 font-mono break-all flex items-center">
                        {expandedLead.email || '—'}
                        {expandedLead.email && <CopyButton text={expandedLead.email} />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Phone</div>
                      <div className="text-sm font-mono text-gray-900 dark:text-gray-200 break-all flex items-center">
                        {expandedLead.phone || '—'}
                        {expandedLead.phone && <CopyButton text={expandedLead.phone} />}
                      </div>
                      {expandedLead.phone_2 && (
                        <div className="text-sm font-mono text-gray-500 dark:text-gray-400 mt-1 break-all flex items-center">
                          {expandedLead.phone_2}
                          <CopyButton text={expandedLead.phone_2} />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Location</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 break-words">{expandedLead.location || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Function</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 break-words">{expandedLead.function || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Revenue</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                        {expandedLead.revenue != null ? `${expandedLead.currency} ${expandedLead.revenue.toLocaleString()}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">LinkedIn</div>
                      <div className="text-sm text-gray-900 dark:text-gray-200 break-words">
                        {expandedLead.linkedin ? (
                          <a href={expandedLead.linkedin.startsWith('http') ? expandedLead.linkedin : `https://${expandedLead.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                            {expandedLead.linkedin}
                          </a>
                        ) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 mb-10 shadow-sm relative">
                  <div className="flex items-start justify-between mb-8">
                    <div className="w-full max-w-lg space-y-3">
                      <div className="flex gap-3">
                        <input value={editForm.first_name || ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} placeholder="First Name" className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/2 pb-1" />
                        <input value={editForm.last_name || ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} placeholder="Last Name" className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/2 pb-1" />
                      </div>
                      <div className="flex items-center gap-3">
                        <input value={editForm.title || ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Position" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/4 pb-1" />
                        <span className="text-gray-400">&bull;</span>
                        <input value={editForm.function || ''} onChange={(e) => setEditForm({ ...editForm, function: e.target.value })} placeholder="Function" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/4 pb-1" />
                        <span className="text-gray-400">&bull;</span>
                        <input value={editForm.domain || ''} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })} placeholder="Company" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/4 pb-1" />
                        <span className="text-gray-400">&bull;</span>
                        <input value={editForm.industry || ''} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} placeholder="Industry" className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-700 outline-none focus:border-brand-500 w-1/4 pb-1" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-4">
                      <button onClick={() => setIsEditingContact(false)} className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                      <button onClick={() => handleUpdateContact(expandedLead.id)} disabled={isSavingContact} className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50 shadow-sm">{isSavingContact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-y-6 gap-x-8">
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
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Function</div>
                      <input value={editForm.function || ''} onChange={(e) => setEditForm({ ...editForm, function: e.target.value })} className="w-full px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500" />
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
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">LinkedIn URL</div>
                      <input value={editForm.linkedin || ''} onChange={(e) => setEditForm({ ...editForm, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." className="w-full px-2 py-1.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={(e) => handleQuickActionSubmit(expandedLead.id, e)} className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-6 mb-10 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gray-200 dark:bg-neutral-800 group-hover:bg-brand-500 transition-colors"></div>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-base font-bold text-gray-900 dark:text-white">Update status & next action</h4>
                  <button type="submit" disabled={isSavingContact} className="text-xs font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm cursor-pointer">
                    {isSavingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Updates
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
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
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Due Date</label>
                    <input
                      name="due_date"
                      type="date"
                      defaultValue={expandedLead.due_date ? expandedLead.due_date.split('T')[0] : ''}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg text-sm text-gray-900 dark:text-white focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Next Action</label>
                  <textarea
                    name="next_action"
                    rows={2}
                    defaultValue={expandedLead.next_action || ''}
                    placeholder="e.g. Follow up email"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg text-sm text-gray-900 dark:text-white focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm resize-y"
                  />
                </div>
              </form>
              <div className="mb-8 p-5 bg-brand-50/50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-900/30 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-100 flex items-center gap-2">
                    <File className="w-4 h-4 text-brand-500" /> Attachments
                  </h3>
                  <label className="cursor-pointer text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 bg-white dark:bg-neutral-900 px-3 py-1.5 rounded-md border border-gray-200 dark:border-neutral-800 shadow-sm transition-colors">
                    Upload
                    <input
                      type="file"
                      onChange={(e) => expandedLeaderId && handleUploadAttachment(expandedLeaderId, e)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {attachments.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No attachments.</p>
                  )}
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg group shadow-sm hover:border-brand-300 transition-colors">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <File className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate" title={a.file_name}>{a.file_name}</span>
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
                            onClick={() => expandedLeaderId && handleDeleteAttachment(a.id, expandedLeaderId)}
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

              <div>
                {/* <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" /> Activity Timeline
            </h3> */}

                {/* {expandedLeaderId && (
              <form onSubmit={(e) => handleAddComment(expandedLeaderId, e)} className="mb-6">
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
            </div>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Compose Email"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">From</label>
            <input
              type="email"
              value={senderAccount}
              onChange={(e) => setSenderAccount(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">To</label>
            <input
              type="email"
              value={emailTargetLeader?.email || ''}
              readOnly
              className="w-full px-3 py-2 bg-gray-50 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
              CC (optional)
              <button type="button" onClick={() => setShowCcBcc(!showCcBcc)} className="text-xs text-brand-600 hover:underline">{showCcBcc ? 'Hide CC/BCC' : 'Show CC/BCC'}</button>
            </label>
            {showCcBcc && (
              <input
                type="text"
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                placeholder="comma-separated emails"
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
          {showCcBcc && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">BCC (optional)</label>
              <input
                type="text"
                value={bccEmails}
                onChange={(e) => setBccEmails(e.target.value)}
                placeholder="comma-separated emails"
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-neutral-800 mt-6">
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 rounded-lg transition-colors border border-gray-200 dark:border-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (emailTargetLeader) handleGmailClick(emailTargetLeader);
                setIsEmailModalOpen(false);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Open in Gmail
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}