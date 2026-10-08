'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { API_URL } from '@/lib/api'

type PipelineItem = {
    id: string
    first_name: string
    last_name: string | null
    org: string | null
    status: string
    revenue: number | null
    currency: string | null
    type: 'Direct Channel' | 'Training Partner' | 'Fractional Leader'
}

type Profile = {
    full_name: string
    email: string
    role_level: number
}

const STATUSES = ['New', 'Contacted', 'Follow-up', 'Won', 'Lost', 'Hot Lead', 'Warm Lead', 'Cold Lead']

const STATUS_DOT_COLORS: Record<string, string> = {
    New: 'bg-gray-400',
    Contacted: 'bg-blue-500',
    'Follow-up': 'bg-amber-500',
    Won: 'bg-green-500',
    Lost: 'bg-gray-500',
    'Hot Lead': 'bg-red-500',
    'Warm Lead': 'bg-orange-500',
    'Cold Lead': 'bg-cyan-500',
}

function fullName(item: PipelineItem) {
    return [item.first_name, item.last_name].filter(Boolean).join(' ')
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
    const [items, setItems] = useState<PipelineItem[]>([])
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState<'All' | 'Direct Channel' | 'Training Partner' | 'Fractional Leader'>('All')

    async function getToken() {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token
    }

    useEffect(() => {
        async function fetchData() {
            const token = await getToken()
            if (!token) return

            const [leadsRes, tpRes, flRes, profileRes] = await Promise.all([
                fetch(`${API_URL}/leads?page=1&page_size=1000`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/training-partners?page=1&page_size=1000`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/fractional-leaders?page=1&page_size=1000`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API_URL}/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ])

            let allItems: PipelineItem[] = []

            if (leadsRes.ok) {
                const data = await leadsRes.json()
                const mapped = data.leads.map((l: any) => ({
                    id: l.id,
                    first_name: l.first_name,
                    last_name: l.last_name,
                    org: l.org,
                    status: l.status,
                    revenue: l.revenue,
                    currency: l.currency,
                    type: 'Direct Channel' as const
                }))
                allItems = [...allItems, ...mapped]
            }

            if (tpRes.ok) {
                const data = await tpRes.json()
                const mapped = data.data.map((tp: any) => ({
                    id: tp.id,
                    first_name: tp.first_name,
                    last_name: tp.last_name,
                    org: tp.organization,
                    status: tp.status,
                    revenue: tp.revenue,
                    currency: tp.currency,
                    type: 'Training Partner' as const
                }))
                allItems = [...allItems, ...mapped]
            }

            if (flRes.ok) {
                const data = await flRes.json()
                const mapped = data.data.map((fl: any) => ({
                    id: fl.id,
                    first_name: fl.first_name,
                    last_name: fl.last_name,
                    org: fl.domain,
                    status: fl.status,
                    revenue: fl.revenue,
                    currency: fl.currency,
                    type: 'Fractional Leader' as const
                }))
                allItems = [...allItems, ...mapped]
            }

            setItems(allItems)

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
                <header className="h-16 px-6 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between shrink-0">
                    <h1 className="text-xl font-semibold">Pipeline</h1>
                    
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as any)}
                        className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="All">All Types</option>
                        <option value="Direct Channel">Channels</option>
                        <option value="Training Partner">Training Partners</option>
                        <option value="Fractional Leader">Fractional Leaders</option>
                    </select>
                </header>

                <div className="flex-1 overflow-x-auto p-6">
                    <div className="flex gap-4 h-full">
                        {STATUSES.map((status) => {
                            const columnItems = items.filter((l) => l.status === status && (typeFilter === 'All' || l.type === typeFilter))
                            return (
                                <div key={status} className="flex-shrink-0 w-64 flex flex-col">
                                    <div className="flex items-center gap-2 mb-3 px-1">
                                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[status]}`}></span>
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{status}</span>
                                        <span className="text-xs text-gray-400">{columnItems.length}</span>
                                    </div>
                                    <div className="flex-1 space-y-2 overflow-y-auto">
                                        {columnItems.map((item) => (
                                            <div
                                                key={`${item.type}-${item.id}`}
                                                className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg p-3 shadow-sm flex flex-col gap-1"
                                            >
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{fullName(item)}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">{item.org || '—'}</div>
                                                </div>
                                                <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                                                    {item.type}
                                                </div>
                                                {formatRevenue(item.revenue, item.currency) && (
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                                                        {formatRevenue(item.revenue, item.currency)}
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