'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { API_URL } from '@/lib/api'
import { ChevronRight, Search, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, Download, RefreshCw, Globe, FileText, Loader2 } from 'lucide-react'
import Link from 'next/link'

type Lead = {
    id: string
    first_name: string
    last_name: string | null
    org: string | null
    status: string
    title: string | null
    email: string | null
    industry: string | null
}

function fullName(lead: Lead) {
    return [companies.first_name, lead.last_name].filter(Boolean).join(' ')
}


function CompanyActions({ companyName, onViewReport }: { companyName: string, onViewReport: (url: string) => void }) {
    const [reports, setReports] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [scraping, setScraping] = useState(false)

    useEffect(() => {
        async function fetchReports() {
            setLoading(true)
            const { data } = await supabase.auth.getSession()
            const token = data.session?.access_token
            if (!token) return

            try {
                const res = await fetch(`${API_URL}/companies/${encodeURIComponent(companyName)}/reports`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setReports(data || [])
                }
            } finally {
                setLoading(false)
            }
        }
        fetchReports()
    }, [companyName])

    const pollReport = async (id: string, token: string) => {
        const interval = setInterval(async () => {
            const res = await fetch(`${API_URL}/company-reports/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const updated = await res.json()
                setReports(prev => prev.map(r => r.id === id ? updated : r))
                if (updated.status === 'done' || updated.status === 'failed') {
                    clearInterval(interval)
                    if (updated.status === 'done') {
                        viewReport(updated.id)
                    }
                    setScraping(false)
                }
            }
        }, 3000)
    }

    const handleScrape = async () => {
        setScraping(true)
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return

        try {
            const res = await fetch(`${API_URL}/companies/${encodeURIComponent(companyName)}/scrape`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const newReport = await res.json()
                setReports([newReport, ...reports])
                pollReport(newReport.id, token)
            } else {
                setScraping(false)
            }
        } catch (e) {
            setScraping(false)
        }
    }

    const viewReport = async (id: string) => {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return

        const res = await fetch(`${API_URL}/company-reports/${id}/download`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
            const data = await res.json()
            if (data.url) {
                onViewReport(data.url)
            }
        }
    }

    if (loading) {
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-600 inline-block"></div>
    }

    const latestReport = reports[0]

    if (scraping || (latestReport && latestReport.status === 'pending')) {
        return (
            <div className="flex items-center justify-end gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Scraping...
            </div>
        )
    }

    if (latestReport && latestReport.status === 'done') {
        return (
            <div className="flex items-center justify-end gap-3">
                <button 
                    onClick={() => viewReport(latestReport.id)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                    <FileText className="w-4 h-4" /> View Report
                </button>
                <button 
                    onClick={handleScrape}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    title="Scrape Again"
                >
                    <RefreshCw className="w-4 h-4" /> Re-scrape
                </button>
            </div>
        )
    }

    return (
        <button 
            onClick={handleScrape}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
        >
            <Globe className="w-4 h-4" /> Scrape Company
        </button>
    )
}


export default function CompaniesPage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const pageSize = 20
    const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'count' | null, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
    const [reportUrl, setReportUrl] = useState<string | null>(null)

    async function getToken() {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token
    }

    useEffect(() => {
        async function fetchData() {
            const token = await getToken()
            if (!token) return

            const res = await fetch(`${API_URL}/leads?page=1&page_size=5000`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (res.ok) {
                const data = await res.json()
                setLeads(data.leads)
            }
            setLoading(false)
        }
        fetchData()
    }, [])

    // Process and group companies
    const companies = useMemo(() => {
        const companyMap = new Map<string, { displayName: string; leads: Lead[]; industry: string }>()
        
        leads.forEach((lead) => {
            let rawName = (lead.org || '').trim()
            if (rawName) { 
                if (rawName === 'Greaves Electic Mobility') {
                    rawName = 'Greaves Electric Mobility'
                }

                const normalizedKey = rawName.toLowerCase().replace(/\s+/g, ' ')
                
                if (!companyMap.has(normalizedKey)) {
                    companyMap.set(normalizedKey, { displayName: rawName, leads: [], industry: lead.industry || '' })
                }
                const comp = companyMap.get(normalizedKey)!
                comp.leads.push(lead)
                // Use the first available industry if not already set
                if (!comp.industry && lead.industry) {
                    comp.industry = lead.industry
                }
            }
        })

        let result = Array.from(companyMap.values())

        if (search) {
            const lowerSearch = search.toLowerCase()
            result = result.filter(c => c.displayName.toLowerCase().includes(lowerSearch) || c.industry.toLowerCase().includes(lowerSearch))
        }

        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal, bVal
                if (sortConfig.key === 'name') {
                    aVal = a.displayName.toLowerCase()
                    bVal = b.displayName.toLowerCase()
                } else {
                    aVal = a.leads.length
                    bVal = b.leads.length
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
                return 0
            })
        }

        return result
    }, [leads, search, sortConfig])

    // Pagination
    const totalPages = Math.max(1, Math.ceil(companies.length / pageSize))
    
    // Ensure current page is valid after filtering
    useEffect(() => {
        if (page > totalPages) {
            setPage(1)
        }
    }, [companies.length, totalPages, page])

    const currentCompanies = companies.slice((page - 1) * pageSize, page * pageSize)

    const handleSort = (key: 'name' | 'count') => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const SortIcon = ({ columnKey }: { columnKey: 'name' | 'count' }) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />
        return sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />
    }

    if (loading) {
        return (
            <main className="flex-1 flex items-center justify-center min-w-0 overflow-hidden bg-gray-50 dark:bg-[#09090b]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </main>
        )
    }

    return (
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-[#09090b]">
            <header className="h-16 px-6 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0">
                <h1 className="text-xl font-semibold">Companies</h1>
                <div className="text-sm text-gray-500">
                    {companies.length} Unique Companies
                </div>
            </header>

            <div className="flex-1 flex flex-col p-6 min-h-0">
                <div className="w-full flex flex-col h-full space-y-6">
                    <div className="shrink-0">
                        <div className="relative w-80">
                            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                placeholder="Search companies or industries..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors outline-none text-sm shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-sm flex flex-col min-h-0 flex-1">
                        <div className="overflow-auto flex-1">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800">
                                <thead className="bg-gray-50 dark:bg-neutral-900/50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left align-middle relative">
                                            <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors p-1.5 -ml-1.5 rounded" onClick={() => handleSort('name')}>
                                                Company Name <SortIcon columnKey="name" />
                                            </div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left align-middle relative">
                                            <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-fit cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors p-1.5 -ml-1.5 rounded" onClick={() => handleSort('count')}>
                                                Total Leads <SortIcon columnKey="count" />
                                            </div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left align-middle">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Industry
                                            </div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-right align-middle">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Actions
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                                    {currentCompanies.map(({ displayName, leads: companyLeads, industry }) => (
                                        <tr key={displayName} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900 dark:text-white">{displayName}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {companyLeads.length} {companyLeads.length === 1 ? 'Lead' : 'Leads'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {industry || '—'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-4">
                                                    <CompanyActions companyName={displayName} onViewReport={setReportUrl} />
                                                    <Link 
                                                        href={`/leads?search=${encodeURIComponent(displayName)}`}
                                                        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                                                    >
                                                        Leads <ChevronRight className="w-4 h-4" />
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {currentCompanies.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                                                No companies found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="border-t border-gray-200 dark:border-neutral-800 px-6 py-3 flex items-center justify-between bg-gray-50 dark:bg-neutral-900/50 shrink-0">
                            <div className="text-sm text-gray-500">
                                Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
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
                                    disabled={page >= totalPages}
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
            
            {reportUrl && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6" onClick={() => setReportUrl(null)}>
                    <div 
                        className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-neutral-800"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900 shrink-0">
                            <h3 className="font-medium text-gray-900 dark:text-white">Company Report</h3>
                            <button onClick={() => setReportUrl(null)} className="p-1 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 bg-gray-100 dark:bg-neutral-950">
                            <iframe src={reportUrl} className="w-full h-full border-0" title="Company Report" />
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
