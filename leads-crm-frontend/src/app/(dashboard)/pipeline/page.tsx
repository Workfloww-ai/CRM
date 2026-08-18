'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Lead = {
    id: string
    first_name: string
    last_name: string | null
    org: string | null
    status: string
    revenue: number | null
    currency: string | null
}

type Profile = {
    full_name: string
    email: string
    role_level: number
}

const STATUSES = ['New', 'Contacted', 'Follow-up', 'Won', 'Lost']

const STATUS_DOT_COLORS: Record<string, string> = {
    New: 'bg-gray-400',
    Contacted: 'bg-blue-500',
    'Follow-up': 'bg-amber-500',
    Won: 'bg-green-500',
    Lost: 'bg-red-500',
}

function fullName(lead: Lead) {
    return [lead.first_name, lead.last_name].filter(Boolean).join(' ')
}

function formatRevenue(revenue: number | null, currency: string | null) {
    if (revenue === null || revenue === undefined) return null
    const cur = currency || 'INR'

    if (cur === 'INR') {
        if (revenue >= 10000000) return `₹${(revenue / 10000000).toFixed(1)}Cr`
        if (revenue >= 100000) return `₹${(revenue / 100000).toFixed(0)}L`
        return `₹${revenue.toLocaleString('en-IN')}`
    }

    const symbol = cur === 'USD' ? '$' : cur + ' '
    if (revenue >= 1000000) return `${symbol}${(revenue / 1000000).toFixed(1)}M`
    if (revenue >= 1000) return `${symbol}${(revenue / 1000).toFixed(0)}K`
    return `${symbol}${revenue}`
}

export default function PipelinePage() {
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
                fetch('http://localhost:8000/leads?page=1&page_size=1000', {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch('http://localhost:8000/me', {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ])

            if (leadsRes.ok) {
                const data = await leadsRes.json()
                setLeads(data.leads)
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
            <main className="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </main>
        )
    }

    return (
        <>
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-16 px-6 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center shrink-0">
                    <h1 className="text-xl font-semibold">Pipeline</h1>
                </header>

                <div className="flex-1 overflow-x-auto p-6">
                    <div className="flex gap-4 h-full">
                        {STATUSES.map((status) => {
                            const columnLeads = leads.filter((l) => l.status === status)
                            return (
                                <div key={status} className="flex-shrink-0 w-64 flex flex-col">
                                    <div className="flex items-center gap-2 mb-3 px-1">
                                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[status]}`}></span>
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{status}</span>
                                        <span className="text-xs text-gray-400">{columnLeads.length}</span>
                                    </div>
                                    <div className="flex-1 space-y-2 overflow-y-auto">
                                        {columnLeads.map((lead) => (
                                            <div
                                                key={lead.id}
                                                className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-3 shadow-sm"
                                            >
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{fullName(lead)}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{lead.org || '—'}</div>
                                                {formatRevenue(lead.revenue, lead.currency) && (
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white mt-2">
                                                        {formatRevenue(lead.revenue, lead.currency)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </main>
        </>
    )
}