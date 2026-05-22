import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Briefcase, ClipboardCheck, PlusCircle, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    try {
      const cacheKey = cacheManager.generateKey('admin_dashboard_stats')
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setStats(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/admin/dashboard/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')}` },
      })
      const data = await response.json()
      setStats(data)
      cacheManager.set(cacheKey, data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const quickActions = user?.user_type === 'admin'
    ? [
        {
          title: 'Create Trainer',
          description: 'Open the trainer form with qualifications and account details.',
          icon: Users,
          action: () => navigate('/trainers', { state: { openCreateModal: true } }),
        },
        {
          title: 'Add Program',
          description: 'Create a new program with type, validity date, and nominal duration.',
          icon: PlusCircle,
          action: () => navigate('/programs', { state: { openCreateModal: true } }),
        },
        {
          title: 'Create Teaching Load',
          description: 'Assign a qualified trainer and generate the weekday calendar.',
          icon: Briefcase,
          action: () => navigate('/schedules', { state: { openCreateModal: true } }),
        },
      ]
    : [
        {
          title: 'Review Teaching Loads',
          description: 'Approve or reject pending teaching loads from the queue.',
          icon: ClipboardCheck,
          action: () => navigate('/teaching-loads'),
        },
        {
          title: 'Center Chief Accounts',
          description: 'Review center chief accounts and manage password updates.',
          icon: Users,
          action: () => navigate('/admin-accounts?role=supervisor'),
        },
        {
          title: 'View Statistics',
          description: 'Open the portal metrics and approval summaries.',
          icon: BarChart3,
          action: () => navigate('/statistics'),
        },
      ]

  const statCards = [
    { label: 'Trainers', value: stats?.total_trainers ?? 0 },
    { label: 'Programs', value: stats?.total_programs ?? 0 },
    { label: 'Pending Loads', value: stats?.pending_loads ?? 0 },
    { label: 'Approved Loads', value: stats?.approved_loads ?? 0 },
  ]

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-[1.5rem] sm:rounded-[2rem] bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 p-4 sm:p-6 lg:p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.24em] text-sky-100">TESDA RTC - NCR</p>
        <h1 className="mt-2 sm:mt-4 text-2xl sm:text-3xl lg:text-4xl font-black leading-tight">
          {user?.user_type === 'admin' ? 'Admin Dashboard' : 'Supervisor Dashboard'}
        </h1>
        <p className="mt-2 sm:mt-3 text-sm sm:text-base text-sky-50/90 max-w-2xl">
          Manage trainers, programs, approvals, and account access from one portal.
        </p>
      </section>

      <section className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {(loading ? Array.from({ length: 4 }) : statCards).map((card, index) => (
          <div key={card?.label || index} className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{card?.label || 'Loading'}</p>
            <p className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-black text-slate-900">{loading ? '...' : card.value}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Quick Actions</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">All pop-up forms support `Esc` to close and `Enter` to submit.</p>
        </div>

        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={action.action}
              className="rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200 bg-white p-4 sm:p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl w-full"
            >
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-sky-100 text-sky-700">
                <action.icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <h3 className="mt-3 sm:mt-5 text-lg sm:text-xl font-bold text-slate-900">{action.title}</h3>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-600 line-clamp-3">{action.description}</p>
            </button>
          ))}
        </div>
      </section>

      {stats && (
        <section className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <div className="rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Recent Trainers</h3>
            <div className="mt-3 sm:mt-4 max-h-[20rem] space-y-2 overflow-y-auto pr-1 sm:space-y-3">
              {(stats.recent_trainers || []).length === 0 && <p className="text-xs sm:text-sm text-slate-500">No trainer records yet.</p>}
              {(stats.recent_trainers || []).map((trainer) => (
                <div key={trainer.id} className="rounded-xl sm:rounded-2xl border border-slate-200 px-3 py-2 sm:px-4 sm:py-3">
                  <p className="font-semibold text-sm sm:text-base text-slate-900 truncate">{trainer.trainer_name || trainer.username}</p>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">{trainer.first_name || ''} {trainer.last_name || ''}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Recent Programs</h3>
            <div className="mt-3 sm:mt-4 max-h-[20rem] space-y-2 overflow-y-auto pr-1 sm:space-y-3">
              {(stats.recent_programs || []).length === 0 && <p className="text-xs sm:text-sm text-slate-500">No program records yet.</p>}
              {(stats.recent_programs || []).map((program) => (
                <div key={program.id} className="rounded-xl sm:rounded-2xl border border-slate-200 px-3 py-2 sm:px-4 sm:py-3">
                  <p className="font-semibold text-sm sm:text-base text-slate-900 truncate">{program.name}</p>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">{program.type} • {program.hours || 0} hours</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
