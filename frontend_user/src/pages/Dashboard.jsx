import React, { useEffect, useState } from 'react'
import { BookOpen, Briefcase, CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import TrainerScheduleView from '../components/TrainerScheduleView'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')

export default function Dashboard() {
  const { user } = useAuth()
  const [teachingLoads, setTeachingLoads] = useState([])
  const [selectedLoad, setSelectedLoad] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTeachingLoads = async () => {
      if (!user?.id) {
        setLoading(false)
        return
      }

      try {
        const cacheKey = cacheManager.generateKey('trainer_teaching_loads', { trainer_id: user.id })
        const cached = cacheManager.get(cacheKey)
        if (cached !== null) {
          const cachedLoads = Array.isArray(cached) ? cached : []
          setTeachingLoads(cachedLoads)
          setSelectedLoad(cachedLoads[0] || null)
          setLoading(false)
          return
        }

        const response = await fetch(`${API_BASE}/api/schedules/trainer/${user.id}/programs`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        const data = await response.json()
        const loads = Array.isArray(data) ? data : []
        setTeachingLoads(loads)
        setSelectedLoad(loads[0] || null)
        cacheManager.set(cacheKey, loads)
      } catch (error) {
        console.error(error)
        setTeachingLoads([])
      } finally {
        setLoading(false)
      }
    }
    loadTeachingLoads()
  }, [user?.id])

  const totalHours = teachingLoads.reduce((sum, load) => sum + (load.program_total_hours || 0), 0)
  const totalDays = teachingLoads.reduce((sum, load) => sum + (load.program_days || 0), 0)

  let loadsContent
  if (loading) {
    loadsContent = (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center text-slate-500">Loading approved teaching loads...</div>
    )
  } else if (teachingLoads.length === 0) {
    loadsContent = (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
        No approved teaching loads yet.
      </div>
    )
  } else {
    loadsContent = (
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.35fr]">
        <div className="space-y-3">
          {teachingLoads.map((load) => (
            <button
              type="button"
              key={load.id}
              onClick={() => setSelectedLoad(load)}
              className={`w-full rounded-[2rem] border p-5 text-left shadow-sm transition ${
                selectedLoad?.id === load.id
                  ? 'border-cyan-400 bg-cyan-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{load.approval_status}</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">{load.program_name}</h3>
              <p className="mt-1 text-sm text-slate-600">{load.program_type}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-700">{load.hours_per_day} hrs/day</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{load.program_days} days</span>
              </div>
            </button>
          ))}
        </div>

        <div>
          {selectedLoad && (
            <TrainerScheduleView program={selectedLoad} trainerId={user.id} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-800 to-blue-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC NCR</p>
        <h1 className="mt-4 text-4xl font-black">{user?.trainer_name || user?.full_name || user?.username}</h1>
        <p className="mt-3 max-w-2xl text-cyan-50/90">
          Approved teaching loads appear here. Mark each training day to keep your calendar accurate.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Approved Loads', value: teachingLoads.length, icon: Briefcase },
          { label: 'Total Calendar Days', value: totalDays, icon: CalendarDays },
          { label: 'Total Hours', value: totalHours, icon: BookOpen },
        ].map((card) => (
          <div key={card.label} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
              <card.icon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">TM Number</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{user?.tm_number || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Email</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{user?.email || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Recognition</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{user?.ctpr_recognition_number || 'Not set'}</p>
          </div>
        </div>
      </section>

      {loadsContent}
    </div>
  )
}
