'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Sidebar } from '@/components/ui/Sidebar'
import { Phone, MessageCircle } from 'lucide-react'

type Lead = {
    id: string
    first_name: string
    last_name: string | null
    org: string | null
    next_action: string | null
    due_date: string | null
    phone: string | null
}

type Profile = {
    full_name: string
    email: string
    role_level: number
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

function waLink(phone: string | null) {
    if (!phone) return null
    const digitsOnly = phone.replace(/[^0-9]/g, '')
    return `https://wa.me/${digitsOnly}`
}

export default function QueuePage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)

    async function getToken() {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token
    }

    useEffect(() => {
        async function fetchData() {
            const token = await getToken()
            if (!token) return

            const [leadsRes, profileRes] = await Promise.all([
                fetch('http://localhost:8000/leads?page=1&page_size=1000&sort_by=due_date&sort_dir=asc', {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch('http://localhost:8000/me', {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ])

            if (leadsRes.ok) {
                const data = await leadsRes.json()
                const withAction = data.leads.filter((l: Lead) => l.next_action)
                setLeads(withAction)
            }
            if (profileRes.ok) {
                setProfile(await profileRes.json())
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

    return (
        <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-[#09090b] text-gray-900 dark:text-gray-100 font-sans">
            <Sidebar profile={profile} />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-16 px-6 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center shrink-0">
                    <h1 className="text-xl font-semibold">Queue</h1>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Today's queue</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sorted by urgency — overdue first</p>

                        <div className="space-y-3">
                            {leads.map((lead) => {
                                const overdue = isOverdue(lead.due_date)
                                const wa = waLink(lead.phone)

                                return (
                                    <div
                                        key={lead.id}
                                        className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-4 flex items-center justify-between shadow-sm"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-gray-300'}`}></span>
                                            <div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {fullName(lead)} <span className="text-gray-400 font-normal">· {lead.org || '—'}</span>
                                                </div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{lead.next_action}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <span className={`text-sm font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                                                Due {formatDue(lead.due_date)}
                                            </span>
                                            {lead.phone && (
                                                <a href={`tel:${lead.phone}`}
                                                   className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
                                                >
                                                    <Phone className="w-3.5 h-3.5" /> Call
                                                </a>
                                            )}
                                            {wa && (
                                                <a href={wa}
                                                   target="_blank"
                                                   rel="noopener noreferrer"
                                                   className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                    {leads.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-12">No pending actions — you're all caught up.</p>
                    )}
                </div>
        </div>
        </div >
      </main >
    </div >
  )
}