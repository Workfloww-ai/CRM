'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSidebar } from '@/contexts/SidebarContext'
import { Modal } from '@/components/ui/Modal'
import { Folder, File, ArrowLeft, Upload, Trash2, Download, Menu, FileText, FileSpreadsheet, FileIcon, Loader2 } from 'lucide-react'
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
}

const FOLDERS: FolderDef[] = [
  { id: 'leads', name: 'Leads', description: 'Documents related to leads' },
  { id: 'leads/ceo', name: 'CEO', description: 'CEO documents', parentId: 'leads' },
  { id: 'leads/chro', name: 'CHRO', description: 'CHRO documents', parentId: 'leads' },
  { id: 'leads/hr', name: 'HR', description: 'HR documents', parentId: 'leads' },
  { id: 'leads/sales_head', name: 'Sales Head', description: 'Sales Head documents', parentId: 'leads' },
  { id: 'fractional_leaders', name: 'Fractional Leaders', description: 'Documents for fractional leaders' },
  { id: 'training_partners', name: 'Training Partners', description: 'Partner training materials' },
  { id: 'investors', name: 'Investors', description: 'Investor relations documents' },
  { id: 'competitors', name: 'Competitors', description: 'Competitor analysis and files' },
  { id: 'general', name: 'General', description: 'General workspace documents' },
]

export default function DocumentsPage() {
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerTitle, setViewerTitle] = useState<string>('')
  const [profile, setProfile] = useState<{ role_level: number } | null>(null)
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar()

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
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeFolder) {
      const hasSubfolders = FOLDERS.some(f => f.parentId === activeFolder)
      if (!hasSubfolders) {
        fetchDocuments(activeFolder)
      } else {
        setDocuments([])
      }
    } else {
      setDocuments([])
    }
  }, [activeFolder, fetchDocuments])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!activeFolder) return
    const formData = new FormData(e.target as HTMLFormElement)
    const file = formData.get('file') as globalThis.File
    if (!file || file.size === 0) {
      alert('Please select a file to upload')
      return
    }
    
    // Add folder to formData
    formData.append('folder', activeFolder)

    setUploading(true)
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/documents/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      setIsUploadModalOpen(false)
      fetchDocuments(activeFolder)
    } catch (err: any) {
      alert(err.message)
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
      setViewerUrl(data.url)
      setViewerTitle(fileName)
    } catch (err: any) {
      alert(err.message)
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
    } catch (err: any) {
      alert(err.message)
    }
  }

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) return <FileSpreadsheet className="w-5 h-5 text-green-500" />
    return <FileIcon className="w-5 h-5 text-blue-500" />
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
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {activeFolder ? (
                <>
                  <button onClick={() => setActiveFolder(null)} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Documents</button>
                  <span className="text-gray-400">/</span>
                  <span>{FOLDERS.find(f => f.id === activeFolder)?.name}</span>
                </>
              ) : (
                'Documents'
              )}
            </h1>
          </div>
          {activeFolder && !FOLDERS.some(f => f.parentId === activeFolder) && (
            <div className="flex items-center gap-2">
              <button onClick={() => setIsUploadModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
                <Upload className="w-4 h-4" /> Upload File
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-[#fafafa] dark:bg-[#0a0a0a]">
          <div className="max-w-[1400px] mx-auto space-y-6">
            {!activeFolder ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {FOLDERS.filter(f => !f.parentId && (f.id !== 'investors' || profile?.role_level === 3)).map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => setActiveFolder(folder.id)}
                    className="flex items-start gap-4 p-5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl hover:border-brand-500 hover:shadow-md transition-all text-left"
                  >
                    <div className="p-3 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-lg">
                      <Folder className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{folder.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-neutral-400">{folder.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : FOLDERS.some(f => f.parentId === activeFolder) ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 pb-2">
                  <button onClick={() => setActiveFolder(null)} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="font-medium text-gray-900 dark:text-white">{FOLDERS.find(f => f.id === activeFolder)?.name} Folders</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {FOLDERS.filter(f => f.parentId === activeFolder).map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => setActiveFolder(folder.id)}
                      className="flex items-start gap-4 p-5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl hover:border-brand-500 hover:shadow-md transition-all text-left"
                    >
                      <div className="p-3 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-lg">
                        <Folder className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{folder.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-neutral-400">{folder.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center gap-4 bg-gray-50/50 dark:bg-neutral-900/50">
                  <button onClick={() => {
                    const currentFolder = FOLDERS.find(f => f.id === activeFolder);
                    setActiveFolder(currentFolder?.parentId || null);
                  }} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="font-medium text-gray-900 dark:text-white">{FOLDERS.find(f => f.id === activeFolder)?.name} Files</h2>
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
                              <button onClick={() => handleDownload(doc.id, doc.file_name)} className="flex items-center gap-3 text-left hover:text-brand-600 transition-colors group outline-none">
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

      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Upload Document">
        <form onSubmit={handleUpload} className="space-y-4 p-4">
          <div className="border-2 border-dashed border-gray-300 dark:border-neutral-700 rounded-lg p-8 text-center">
            <input 
              required 
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
