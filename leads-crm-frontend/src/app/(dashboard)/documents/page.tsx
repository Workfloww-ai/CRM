'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSidebar } from '@/contexts/SidebarContext'
import { Modal } from '@/components/ui/Modal'
import {
  Folder,
  ArrowLeft,
  Upload,
  Trash2,
  Download,
  Menu,
  FileText,
  FileSpreadsheet,
  FileIcon,
  Loader2,
  FolderPlus,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { API_URL } from '@/lib/api'

type Document = {
  id: string
  file_name: string
  storage_path: string
  folder: string
  uploaded_by: string
  created_at: string
  profiles?: { full_name: string } | null
}

type FolderDef = {
  id: string
  name: string
  description: string
  parentId?: string
  isCustom?: boolean
}

const DEFAULT_FOLDERS: FolderDef[] = [
  { id: 'leads', name: 'Leads', description: 'Documents related to leads' },
  { id: 'leads/ceo', name: 'CEO', description: 'CEO documents', parentId: 'leads' },
  { id: 'leads/chro', name: 'CHRO', description: 'CHRO documents', parentId: 'leads' },
  { id: 'leads/hr', name: 'HR', description: 'HR documents', parentId: 'leads' },
  { id: 'leads/sales_head', name: 'Sales Head', description: 'Sales Head documents', parentId: 'leads' },
  { id: 'fractional_leaders', name: 'Fractional Leaders', description: 'Documents for fractional leaders' },
  { id: 'training_partners', name: 'Training Partners', description: 'Partner training materials' },
  { id: 'investors', name: 'Investors', description: 'Investor relations documents' },
  { id: 'competitors', name: 'Competitors', description: 'Competitor analysis and files' },
  { id: 'client_presentations', name: 'Client Presentations', description: 'Client Presentations documents' },
  { id: 'ai_capability', name: 'AI Capability', description: 'AI Capability documents' },
  { id: 'commercial_proposal', name: 'Commercial Proposal', description: 'Commercial Proposal documents' },
  { id: 'sales_reports', name: 'Sales Reports', description: 'Sales Reports and Analysis' },
]

const CUSTOM_FOLDERS_STORAGE_KEY = 'crm_custom_document_folders'

const RESERVED_NAMES = [
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]

// Calculate Levenshtein Distance for typo and singular/plural similarity detection
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

function normalizeCanonical(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function validateFolderName(
  name: string,
  existingFolders: FolderDef[],
  targetParentId?: string | null
): { isValid: boolean; error: string | null } {
  const trimmed = name.trim()

  // 1. Empty check
  if (!trimmed) {
    return { isValid: false, error: 'Folder name cannot be empty.' }
  }

  // 2. Length check
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Folder name must be at least 2 characters long.' }
  }
  if (trimmed.length > 50) {
    return { isValid: false, error: 'Folder name cannot exceed 50 characters.' }
  }

  // 3. Leading / trailing dots
  if (name.startsWith('.') || name.endsWith('.')) {
    return { isValid: false, error: 'Folder name cannot begin or end with a period (.)' }
  }

  // 4. Invalid special characters:
  // Disallow characters that disrupt file systems, URLs, or routing (/ \ : * ? " < > | # % & + = ~ ^ $ @ ! ; { } [ ] `)
  const invalidCharRegex = /[\\/:*?"<>|#%&+=~^$@!;{}[\]`]/
  if (invalidCharRegex.test(name)) {
    return {
      isValid: false,
      error: 'Folder name cannot contain special characters (/ \\ : * ? " < > | # % & + = ~ ^ $ @ ! ; { } [ ]).'
    }
  }

  // 5. Reserved system names check
  if (RESERVED_NAMES.includes(trimmed.toLowerCase())) {
    return {
      isValid: false,
      error: `"${trimmed}" is a reserved system name. Please choose a different name.`
    }
  }

  const lowerNew = trimmed.toLowerCase()
  const canonicalNew = normalizeCanonical(trimmed)

  // 6. Case-insensitive exact match
  for (const f of existingFolders) {
    const existingLower = f.name.trim().toLowerCase()
    if (existingLower === lowerNew) {
      if (f.parentId === (targetParentId || undefined)) {
        return {
          isValid: false,
          error: `A folder named "${f.name}" already exists in this directory (case-insensitive duplicate check: "${trimmed}").`
        }
      } else {
        return {
          isValid: false,
          error: `A folder named "${f.name}" already exists. Folder names must be globally unique.`
        }
      }
    }
  }

  // 7. Canonical normalized similarity check (e.g., "sales_reports" vs "Sales Reports" vs "sales-reports" vs "SALES REPORTS")
  for (const f of existingFolders) {
    const canonicalExisting = normalizeCanonical(f.name)
    if (canonicalExisting && canonicalExisting === canonicalNew) {
      return {
        isValid: false,
        error: `A similar folder already exists: "${f.name}". Please choose a distinct name.`
      }
    }
  }

  // 8. Typo / Near-duplicate check using Levenshtein distance (for words >= 4 chars)
  for (const f of existingFolders) {
    const canonicalExisting = normalizeCanonical(f.name)
    if (
      canonicalNew.length >= 4 &&
      canonicalExisting.length >= 4 &&
      levenshteinDistance(canonicalNew, canonicalExisting) === 1
    ) {
      return {
        isValid: false,
        error: `A folder with a very similar name already exists: "${f.name}". Please choose a more distinct name.`
      }
    }
  }

  // 9. Identifier / slug conflict check
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const targetId = targetParentId ? `${targetParentId}/${slug}` : slug
  const conflict = existingFolders.find(f => f.id.toLowerCase() === targetId.toLowerCase())
  if (conflict) {
    return {
      isValid: false,
      error: `This folder name generates a conflicting identifier with existing folder "${conflict.name}".`
    }
  }

  return { isValid: true, error: null }
}

export default function DocumentsPage() {
  const [folders, setFolders] = useState<FolderDef[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_FOLDERS
    try {
      const saved = localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY)
      if (saved) {
        const parsed: FolderDef[] = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customOnly = parsed.filter(cf => !DEFAULT_FOLDERS.some(df => df.id === cf.id))
          return [...DEFAULT_FOLDERS, ...customOnly]
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_FOLDERS
  })
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerTitle, setViewerTitle] = useState<string>('')
  const [profile, setProfile] = useState<{ role_level: number } | null>(null)
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar()

  // New folder modal state
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderDesc, setNewFolderDesc] = useState('')
  const [selectedParentId, setSelectedParentId] = useState<string>('')
  const [folderTouched, setFolderTouched] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        supabase.from('profiles').select('role_level').eq('id', data.session.user.id).single()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  const fetchDocuments = useCallback(async (folderId: string) => {
    setLoading(true)
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/documents?folder=${folderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch documents')
      const data = await res.json()
      setDocuments(data)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeFolder) {
      const hasSubfolders = folders.some(f => f.parentId === activeFolder)
      if (!hasSubfolders) {
        fetchDocuments(activeFolder)
      } else {
        setDocuments([])
      }
    } else {
      setDocuments([])
    }
  }, [activeFolder, folders, fetchDocuments])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!activeFolder) return
    const formData = new FormData(e.target as HTMLFormElement)
    const files = formData.getAll('file') as globalThis.File[]
    
    const validFiles = files.filter(f => f && f.size > 0)
    if (validFiles.length === 0) {
      alert('Please select at least one file to upload')
      return
    }

    setUploading(true)
    const token = await getToken()
    if (!token) {
      setUploading(false)
      return
    }
    
    try {
      await Promise.all(validFiles.map(async (file) => {
        const fileData = new FormData()
        fileData.append('folder', activeFolder)
        fileData.append('file', file)
        
        const res = await fetch(`${API_URL}/documents/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fileData
        })
        if (!res.ok) throw new Error(await res.text())
      }))
      
      setIsUploadModalOpen(false)
      fetchDocuments(activeFolder)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to upload one or more files')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (docId: string, fileName: string) => {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/documents/${docId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to get download link')
      const data = await res.json()
      const link = document.createElement('a')
      link.href = data.url
      link.setAttribute('download', fileName)
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to download document')
    }
  }

  const handlePreview = async (docId: string, fileName: string) => {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/documents/${docId}/download?preview=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to get preview link')
      const data = await res.json()
      setViewerUrl(data.url)
      setViewerTitle(fileName)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to preview document')
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete document')
      if (activeFolder) fetchDocuments(activeFolder)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) return <FileSpreadsheet className="w-5 h-5 text-green-500" />
    return <FileIcon className="w-5 h-5 text-blue-500" />
  }

  // Open Create Folder Modal with context-aware parent
  const openCreateFolderModal = () => {
    if (activeFolder) {
      const hasSub = folders.some(f => f.parentId === activeFolder)
      if (hasSub) {
        setSelectedParentId(activeFolder)
      } else {
        const currentFolder = folders.find(f => f.id === activeFolder)
        setSelectedParentId(currentFolder?.parentId || '')
      }
    } else {
      setSelectedParentId('')
    }
    setNewFolderName('')
    setNewFolderDesc('')
    setFolderTouched(false)
    setIsCreateFolderOpen(true)
  }

  const currentFolderValidation = validateFolderName(
    newFolderName,
    folders,
    selectedParentId || undefined
  )

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault()
    setFolderTouched(true)
    const val = validateFolderName(newFolderName, folders, selectedParentId || undefined)
    if (!val.isValid) return

    const trimmed = newFolderName.trim()
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const targetParent = selectedParentId ? selectedParentId : undefined
    const newId = targetParent ? `${targetParent}/${slug}` : slug

    const newFolder: FolderDef = {
      id: newId,
      name: trimmed,
      description: newFolderDesc.trim() || `${trimmed} documents`,
      parentId: targetParent,
      isCustom: true
    }

    const nextFolders = [...folders, newFolder]
    setFolders(nextFolders)

    // Save custom folders to localStorage
    try {
      const saved = localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY)
      const customList: FolderDef[] = saved ? JSON.parse(saved) : []
      localStorage.setItem(CUSTOM_FOLDERS_STORAGE_KEY, JSON.stringify([...customList, newFolder]))
    } catch (err) {
      console.error('Failed to save folder to localStorage:', err)
    }

    setIsCreateFolderOpen(false)
    setNewFolderName('')
    setNewFolderDesc('')
    setFolderTouched(false)
  }

  const handleDeleteFolder = (folderId: string) => {
    const target = folders.find(f => f.id === folderId)
    if (!target) return
    if (!target.isCustom) {
      alert('Default system folders cannot be deleted.')
      return
    }
    if (!confirm(`Are you sure you want to delete the folder "${target.name}"?`)) return

    const hasSubfolders = folders.some(f => f.parentId === folderId)
    if (hasSubfolders) {
      alert('Cannot delete folder because it contains subfolders. Please delete the subfolders first.')
      return
    }

    const nextFolders = folders.filter(f => f.id !== folderId)
    setFolders(nextFolders)

    try {
      const saved = localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY)
      if (saved) {
        const customList: FolderDef[] = JSON.parse(saved)
        const updated = customList.filter(f => f.id !== folderId)
        localStorage.setItem(CUSTOM_FOLDERS_STORAGE_KEY, JSON.stringify(updated))
      }
    } catch (err) {
      console.error('Failed to update localStorage:', err)
    }

    if (activeFolder === folderId) {
      setActiveFolder(target.parentId || null)
    }
  }

  // Available parent options for modal dropdown
  const parentFolderOptions = [
    { id: '', name: 'Top Level (Root / Documents)' },
    ...folders.filter(f => !f.parentId)
  ]

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
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {activeFolder ? (
                <>
                  <button onClick={() => setActiveFolder(null)} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Documents</button>
                  <span className="text-gray-400">/</span>
                  <span>{folders.find(f => f.id === activeFolder)?.name}</span>
                </>
              ) : (
                'Documents'
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateFolderModal}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors shadow-sm"
              title="Create New Folder"
            >
              <FolderPlus className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>New Folder</span>
            </button>

            {activeFolder && !folders.some(f => f.parentId === activeFolder) && (
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" /> Upload File
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-[#fafafa] dark:bg-[#0a0a0a]">
          <div className="max-w-[1400px] mx-auto space-y-6">
            {!activeFolder ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {folders.filter(f => {
                  if (f.parentId) return false;
                  if (f.id === 'investors' && profile?.role_level !== 3 && profile?.role_level !== 4) return false;
                  if (f.id === 'commercial_proposal' && profile?.role_level !== 4) return false;
                  return true;
                }).map(folder => (
                  <div
                    key={folder.id}
                    className="group relative flex items-start justify-between p-5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl hover:border-brand-500 hover:shadow-md transition-all text-left"
                  >
                    <button
                      onClick={() => setActiveFolder(folder.id)}
                      className="flex items-start gap-4 flex-1 text-left min-w-0"
                    >
                      <div className="p-3 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-lg shrink-0">
                        <Folder className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{folder.name}</h3>
                          {folder.isCustom && (
                            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 shrink-0">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-neutral-400 line-clamp-2">{folder.description}</p>
                      </div>
                    </button>
                    {folder.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteFolder(folder.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all shrink-0"
                        title="Delete folder"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Create folder shortcut card */}
                <button
                  onClick={openCreateFolderModal}
                  className="flex items-center justify-center gap-3 p-5 border-2 border-dashed border-gray-300 dark:border-neutral-700 hover:border-brand-500 dark:hover:border-brand-500 rounded-xl transition-all text-gray-500 dark:text-neutral-400 hover:text-brand-600 dark:hover:text-brand-400 group min-h-[92px]"
                >
                  <FolderPlus className="w-6 h-6 text-gray-400 group-hover:text-brand-500 transition-colors" />
                  <span className="font-medium text-sm">Create New Folder</span>
                </button>
              </div>
            ) : folders.some(f => f.parentId === activeFolder) ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setActiveFolder(null)} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="font-medium text-gray-900 dark:text-white">{folders.find(f => f.id === activeFolder)?.name} Folders</h2>
                  </div>
                  <button
                    onClick={openCreateFolderModal}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                  >
                    <FolderPlus className="w-4 h-4" /> Add Subfolder
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {folders.filter(f => f.parentId === activeFolder).map(folder => (
                    <div
                      key={folder.id}
                      className="group relative flex items-start justify-between p-5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl hover:border-brand-500 hover:shadow-md transition-all text-left"
                    >
                      <button
                        onClick={() => setActiveFolder(folder.id)}
                        className="flex items-start gap-4 flex-1 text-left min-w-0"
                      >
                        <div className="p-3 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-lg shrink-0">
                          <Folder className="w-6 h-6" />
                        </div>
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{folder.name}</h3>
                            {folder.isCustom && (
                              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 shrink-0">
                                Custom
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-neutral-400 line-clamp-2">{folder.description}</p>
                        </div>
                      </button>
                      {folder.isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteFolder(folder.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all shrink-0"
                          title="Delete folder"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add subfolder card */}
                  <button
                    onClick={openCreateFolderModal}
                    className="flex items-center justify-center gap-3 p-5 border-2 border-dashed border-gray-300 dark:border-neutral-700 hover:border-brand-500 dark:hover:border-brand-500 rounded-xl transition-all text-gray-500 dark:text-neutral-400 hover:text-brand-600 dark:hover:text-brand-400 group min-h-[92px]"
                  >
                    <FolderPlus className="w-6 h-6 text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="font-medium text-sm">Add Subfolder</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-900/50">
                  <div className="flex items-center gap-4">
                    <button onClick={() => {
                      const currentFolder = folders.find(f => f.id === activeFolder);
                      setActiveFolder(currentFolder?.parentId || null);
                    }} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="font-medium text-gray-900 dark:text-white">{folders.find(f => f.id === activeFolder)?.name} Files</h2>
                  </div>
                  {folders.find(f => f.id === activeFolder)?.isCustom && (
                    <button
                      onClick={() => activeFolder && handleDeleteFolder(activeFolder)}
                      className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Folder
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="p-8 text-center text-gray-500">Loading documents...</div>
                ) : documents.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center">
                    <Folder className="w-12 h-12 text-gray-300 dark:text-neutral-700 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Folder is empty</h3>
                    <p className="text-gray-500 dark:text-neutral-400 mb-6">Upload documents, PDFs, or Excel files here.</p>
                    <button onClick={() => setIsUploadModalOpen(true)} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
                      Upload File
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto min-w-full">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-800 uppercase">
                        <tr>
                          <th className="px-6 py-3 font-medium">File Name</th>
                          <th className="px-6 py-3 font-medium">Uploaded By</th>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-neutral-800">
                        {documents.map(doc => (
                          <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                            <td className="px-6 py-4">
                              <button onClick={() => handlePreview(doc.id, doc.file_name)} className="flex items-center gap-3 text-left hover:text-brand-600 transition-colors group outline-none">
                                {getFileIcon(doc.file_name)}
                                <span className="font-medium text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{doc.file_name}</span>
                              </button>
                            </td>
                            <td className="px-6 py-4 text-gray-500 dark:text-neutral-400">
                              {doc.profiles?.full_name || 'Unknown'}
                            </td>
                            <td className="px-6 py-4 text-gray-500 dark:text-neutral-400">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleDownload(doc.id, doc.file_name)}
                                  className="p-2 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(doc.id)}
                                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create New Folder Modal */}
      <Modal isOpen={isCreateFolderOpen} onClose={() => setIsCreateFolderOpen(false)} title="Create New Folder">
        <form onSubmit={handleCreateFolder} className="space-y-4">
          {/* Folder Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="folder-name-input" className="block text-sm font-medium text-gray-700 dark:text-neutral-300">
                Folder Name <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${newFolderName.trim().length > 50 ? 'text-red-500' : 'text-gray-400'}`}>
                {newFolderName.trim().length} / 50
              </span>
            </div>
            <div className="relative">
              <input
                id="folder-name-input"
                type="text"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value)
                  if (!folderTouched) setFolderTouched(true)
                }}
                onBlur={() => setFolderTouched(true)}
                placeholder="e.g. Marketing Materials"
                autoFocus
                className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none transition-colors ${
                  folderTouched && !currentFolderValidation.isValid
                    ? 'border-red-500 focus:ring-2 focus:ring-red-400/20 focus:border-red-500'
                    : folderTouched && newFolderName.trim().length >= 2 && currentFolderValidation.isValid
                    ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-500'
                    : 'border-gray-300 dark:border-neutral-700 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
                }`}
              />
            </div>

            {/* Validation Feedback */}
            {folderTouched && !currentFolderValidation.isValid && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{currentFolderValidation.error}</span>
              </div>
            )}

            {folderTouched && newFolderName.trim().length >= 2 && currentFolderValidation.isValid && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Folder name is available and valid</span>
              </div>
            )}
          </div>

          {/* Location / Parent Folder */}
          <div>
            <label htmlFor="folder-location-select" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
              Location
            </label>
            <select
              id="folder-location-select"
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              {parentFolderOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Folder Description */}
          <div>
            <label htmlFor="folder-desc-input" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
              Description <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input
              id="folder-desc-input"
              type="text"
              value={newFolderDesc}
              onChange={(e) => setNewFolderDesc(e.target.value)}
              placeholder="e.g. Brand guidelines and promotional assets"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* Path Preview */}
          <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg border border-gray-200 dark:border-neutral-800 text-xs text-gray-600 dark:text-neutral-300 flex items-center gap-1.5 overflow-hidden">
            <span className="font-semibold text-gray-500 shrink-0">Path:</span>
            <span className="truncate">
              Documents / {selectedParentId ? `${folders.find(f => f.id === selectedParentId)?.name} / ` : ''}
              <span className="font-semibold text-brand-600 dark:text-brand-400">
                {newFolderName.trim() || 'New Folder'}
              </span>
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setIsCreateFolderOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newFolderName.trim() || !currentFolderValidation.isValid}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Folder</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Upload File Modal */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Upload Document">
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 dark:border-neutral-700 rounded-lg p-8 text-center">
            <input
              required
              multiple
              type="file"
              name="file"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/20 dark:file:text-brand-400 dark:hover:file:bg-brand-900/40"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-neutral-800">
            <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={uploading} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2">
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Document Viewer Modal */}
      <Modal isOpen={!!viewerUrl} onClose={() => setViewerUrl(null)} title={viewerTitle} maxWidth="max-w-5xl">
        <div className="h-[75vh] w-full bg-gray-50 dark:bg-neutral-900 -m-6 rounded-b-xl overflow-hidden">
          {viewerUrl && (
            <iframe
              src={
                viewerTitle.match(/\.(docx?|xlsx?|csv|pptx?)$/i)
                  ? `https://docs.google.com/gview?url=${encodeURIComponent(viewerUrl)}&embedded=true`
                  : viewerUrl
              }
              className="w-full h-full border-0"
              title={viewerTitle}
            />
          )}
        </div>
      </Modal>
    </>
  )
}
