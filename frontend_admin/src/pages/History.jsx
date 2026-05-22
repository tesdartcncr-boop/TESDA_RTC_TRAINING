/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from 'react'
import { FileClock, GraduationCap, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')

const SectionCard = ({ title, icon: Icon, count, tone, children, scrollClassName = '' }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.bg} ${tone.fg}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{count} record{count === 1 ? '' : 's'}</p>
        </div>
      </div>
    </div>
    <div className={`mt-5 space-y-3 ${scrollClassName}`}>{children}</div>
  </section>
)

export default function History() {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const cacheKey = cacheManager.generateKey('admin_history')
        const cached = cacheManager.get(cacheKey)
        if (cached !== null) {
          setHistory(cached)
          return
        }

        const response = await fetch(`${API_BASE}/api/admin/history`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Failed to load history')
        setHistory(data)
        cacheManager.set(cacheKey, data)
      } catch (error) {
        toast.error(error.message)
        setHistory(null)
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [])

  const summary = history?.summary || {}
  const expiredPrograms = useMemo(() => history?.expired_programs || [], [history])
  const expiredTmc = useMemo(() => history?.expired_tmc_records || [], [history])
  const expiredQualifications = useMemo(() => history?.expired_qualifications || [], [history])

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-sky-100">Expired records</p>
        <h1 className="mt-4 text-4xl font-black">History</h1>
        <p className="mt-3 max-w-3xl text-sky-50/90">
          Track expired programs, trainer credentials, and other qualification records that need renewal or archival.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Expired Programs', value: summary.expired_programs || 0 },
          { label: 'Expired TMC', value: summary.expired_tmc_records || 0 },
          { label: 'Expired Qualifications / NTTC', value: summary.expired_qualifications || 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center text-slate-500">Loading history...</div>
      ) : (
        <div className="space-y-6">
          <SectionCard title="Expired Programs" icon={FileClock} count={expiredPrograms.length} tone={{ bg: 'bg-amber-100', fg: 'text-amber-700' }} scrollClassName="max-h-[20rem] overflow-y-auto pr-1">
            {expiredPrograms.length === 0 ? (
              <p className="text-sm text-slate-500">No expired programs found.</p>
            ) : expiredPrograms.map((program) => (
              <div key={program.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{program.name}</p>
                    <p className="text-sm text-slate-600">{program.type} • {program.hours || 0} hours</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Expired</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <p><span className="font-semibold text-slate-800">Validity:</span> {String(program.validity || 'Not set').split('T')[0]}</p>
                  <p><span className="font-semibold text-slate-800">Created by:</span> {program.created_by_name || 'Not set'} {program.created_by_position ? `• ${program.created_by_position}` : ''}</p>
                </div>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Expired TMC Records" icon={ShieldAlert} count={expiredTmc.length} tone={{ bg: 'bg-rose-100', fg: 'text-rose-700' }} scrollClassName="max-h-[11rem] overflow-y-auto pr-1">
            {expiredTmc.length === 0 ? (
              <p className="text-sm text-slate-500">No expired TMC records found.</p>
            ) : expiredTmc.map((trainer) => (
              <div key={`${trainer.id}-tm`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-lg font-bold text-slate-900">{trainer.owner_name || trainer.trainer_name || trainer.username}</p>
                <p className="text-sm text-slate-600">TMC Level I • {trainer.tm_number || 'Not set'}</p>
                <p className="mt-2 text-sm text-rose-700"><span className="font-semibold">Expired:</span> {String(trainer.tm_expiration || 'Not set').split('T')[0]}</p>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Expired Qualifications / NTTC" icon={GraduationCap} count={expiredQualifications.length} tone={{ bg: 'bg-emerald-100', fg: 'text-emerald-700' }} scrollClassName="max-h-[20rem] overflow-y-auto pr-1">
            {expiredQualifications.length === 0 ? (
              <p className="text-sm text-slate-500">No expired qualification or NTTC records found.</p>
            ) : expiredQualifications.map((qualification) => (
              <div key={`${qualification.record_type}-${qualification.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-lg font-bold text-slate-900">{qualification.trainer_display_name || qualification.trainer_name || 'Unknown trainer'}</p>
                {qualification.record_type === 'trainer_nttc' ? (
                  <p className="text-sm text-slate-600">NTTC Number • {qualification.nttc_number || 'Not set'}</p>
                ) : (
                  <p className="text-sm text-slate-600">{qualification.program_name || 'Unknown program'} • {qualification.program_type || 'Unknown type'}</p>
                )}
                <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <p><span className="font-semibold text-slate-800">Type:</span> {qualification.record_type === 'trainer_nttc' ? 'NTTC' : 'Qualification'}</p>
                  <p><span className="font-semibold text-slate-800">Trainer position:</span> {qualification.trainer_position || 'Not set'}</p>
                  <p><span className="font-semibold text-slate-800">Expiration:</span> {String(qualification.nttc_expiration || 'Not set').split('T')[0]}</p>
                  <p><span className="font-semibold text-slate-800">NTTC:</span> {qualification.nttc_number || 'Not set'}</p>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </div>
  )
}

