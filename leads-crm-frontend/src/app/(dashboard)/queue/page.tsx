'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Menu, ChevronLeft } from 'lucide-react'
import { useSidebar } from '@/contexts/SidebarContext'
import { API_URL } from '@/lib/api'
import Link from 'next/link'

type Lead = {
    id: string
    first_name: string
    last_name: string | null
    org: string | null
    next_action: string | null
    due_date: string | null
    phone: string | null
}

function fullName(lead: Lead) {
    return [lead.first_name, lead.last_name].filter(Boolean).join(' ')
}

function isOverdue(dueDateStr: string | null) {
    if (!dueDateStr) return false
    const due = new Date(dueDateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return due < today
}

function formatDue(dueDateStr: string | null) {
    if (!dueDateStr) return 'No due date'
    return new Date(dueDateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    })
}

export default function QueuePage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const { isSidebarOpen, setIsSidebarOpen } = useSidebar()
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    async function getToken() {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token
    }

    useEffect(() => {
        async function fetchData() {
            const token = await getToken()
            if (!token) return

            const leadsRes = await fetch(`${API_URL}/leads?page=1&page_size=1000&sort_by=due_date&sort_dir=asc`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (leadsRes.ok) {
                const data = await leadsRes.json()
                const withAction = data.leads.filter((l: Lead) => l.next_action)
                setLeads(withAction)
            }
            setLoading(false)
        }
        fetchData()
    }, [])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
        )
    }

    const groupedLeads = leads.reduce((acc, lead) => {
        const key = lead.due_date ? lead.due_date.split('T')[0] : 'No due date'
        if (!acc[key]) acc[key] = []
        acc[key].push(lead)
        return acc
    }, {} as Record<string, Lead[]>)

    const sortedDates = Object.keys(groupedLeads).sort((a, b) => {
        if (a === 'No due date') return 1
        if (b === 'No due date') return -1
        return new Date(a).getTime() - new Date(b).getTime()
    })

    return (
        <>
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="px-6 py-3 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col justify-center shrink-0 relative">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-1.5 -ml-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                            title="Toggle Sidebar"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col">
                            {selectedDate ? (
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setSelectedDate(null)}
                                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center text-sm font-medium transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4 mr-1" />
                                        Back
                                    </button>
                                    <span className="text-gray-300 dark:text-gray-700">|</span>
                                    <h1 className="text-xl font-semibold leading-tight">
                                        {selectedDate === 'No due date' ? 'No Due Date' : formatDue(selectedDate)}
                                    </h1>
                                </div>
                            ) : (
                                <>
                                    <h1 className="text-xl font-semibold leading-tight">Action Items</h1>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">Grouped by due date</p>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="w-full 2xl:max-w-screen-2xl">
                        {!selectedDate ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                {sortedDates.map((date) => (
                                    <div
                                        key={date}
                                        onClick={() => setSelectedDate(date)}
                                        className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-6 flex flex-col items-center justify-center shadow-sm cursor-pointer hover:border-brand-500 hover:shadow-md transition-all"
                                    >
                                        <div className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                            {date === 'No due date' ? 'No Due Date' : formatDue(date)}
                                        </div>
                                        <div className="text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-3 py-1 rounded-full">
                                            {groupedLeads[date].length} action item{groupedLeads[date].length !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                ))}
                                {sortedDates.length === 0 && (
                                    <p className="text-sm text-gray-500 col-span-full text-center py-12">No pending actions — you're all caught up.</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {groupedLeads[selectedDate].map((lead) => {
                                    const overdue = isOverdue(lead.due_date)

                                    return (
                                        <div
                                            key={lead.id}
                                            className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-4 flex items-center justify-between shadow-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-brand-500'}`}></span>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {fullName(lead)} <span className="text-gray-400 font-normal">· {lead.org || '—'}</span>
                                                    </div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{lead.next_action}</div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <span className={`text-sm font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                                                    Due {formatDue(lead.due_date)}
                                                </span>
                                                <Link 
                                                    href={`/leads?search=${encodeURIComponent(lead.first_name)}&id=${lead.id}`} 
                                                    className="text-sm font-medium px-3 py-1.5 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-900 dark:text-white rounded-md transition-colors"
                                                >
                                                    Update
                                                </Link>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div >
            </main >
        </>
    )
}