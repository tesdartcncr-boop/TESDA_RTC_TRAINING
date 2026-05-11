import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Briefcase, ClipboardCheck, PlusCircle, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('supervisor_token') || sessionStorage.getItem('supervisor_session_token')

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/admin/dashboard/stats`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        const data = await response.json()
        setStats(data)
      } catch (error) {
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

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
          description: 'Create a new program with type, validity, and total hours.',
          icon: PlusCircle,
          action: () => navigate('/programs', { state: { openCreateModal: true } }),
        },
        {
          title: 'Create Teaching Load',
          description: 'Assign a qualified trainer and generate the weekday calendar.',
          icon: Briefcase,
          action: () => navigate('/teaching-loads'),
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
          title: 'Supervisor Accounts',
          description: 'Review supervisor accounts and manage password updates.',
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
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-sky-100">TESDA RTC NCR</p>
        <h1 className="mt-4 text-4xl font-black">
          {user?.user_type === 'admin' ? 'Admin Dashboard' : 'Supervisor Dashboard'}
        </h1>
        <p className="mt-3 max-w-2xl text-sky-50/90">
          Manage trainers, programs, approvals, and account access from one portal.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {(loading ? Array.from({ length: 4 }) : statCards).map((card, index) => (
          <div key={card?.label || index} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{card?.label || 'Loading'}</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{loading ? '...' : card.value}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Quick Actions</h2>
            <p className="text-sm text-slate-600">All pop-up forms support `Esc` to close and `Enter` to submit.</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {quickActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={action.action}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <action.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-xl font-bold text-slate-900">{action.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{action.description}</p>
            </button>
          ))}
        </div>
      </section>

      {stats && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Recent Trainers</h3>
            <div className="mt-4 space-y-3">
              {(stats.recent_trainers || []).length === 0 && <p className="text-sm text-slate-500">No trainer records yet.</p>}
              {(stats.recent_trainers || []).map((trainer) => (
                <div key={trainer.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-900">{trainer.trainer_name || trainer.username}</p>
                  <p className="text-sm text-slate-500">{trainer.first_name || ''} {trainer.last_name || ''}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Recent Programs</h3>
            <div className="mt-4 space-y-3">
              {(stats.recent_programs || []).length === 0 && <p className="text-sm text-slate-500">No program records yet.</p>}
              {(stats.recent_programs || []).map((program) => (
                <div key={program.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-900">{program.name}</p>
                  <p className="text-sm text-slate-500">{program.type} • {program.hours || 0} hours</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
