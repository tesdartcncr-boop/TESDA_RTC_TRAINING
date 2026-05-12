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
        const trainerId = user.trainer_id || user.id
        const cacheKey = cacheManager.generateKey('trainer_teaching_loads', { trainer_id: trainerId })
        const cached = cacheManager.get(cacheKey)
        if (cached !== null) {
          const cachedLoads = Array.isArray(cached) ? cached : []
          setTeachingLoads(cachedLoads)
          setSelectedLoad(cachedLoads[0] || null)
          setLoading(false)
          return
        }

        const response = await fetch(`${API_BASE}/api/schedules/trainer/${trainerId}/programs`, {
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
  }, [user?.id, user?.trainer_id])

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
            <TrainerScheduleView program={selectedLoad} trainerId={user.trainer_id || user.id} />
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
          Your training calendar is the main focus. Select a program from the sidebar to view and manage your daily schedule.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_2.5fr]">
        {/* Sidebar - Teaching Loads */}
        <div className="space-y-6">
          {/* Stats Cards */}
          <section className="grid gap-3">
            {[
              { label: 'Active Programs', value: teachingLoads.length, icon: Briefcase },
              { label: 'Total Days', value: totalDays, icon: CalendarDays },
              { label: 'Total Hours', value: totalHours, icon: BookOpen },
            ].map((card) => (
              <div key={card.label} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                  <card.icon className="h-5 w-5" />
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{card.value}</p>
              </div>
            ))}
          </section>

          {/* Teaching Loads List */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">My Programs</h2>
            {loading ? (
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                Loading programs...
              </div>
            ) : teachingLoads.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                No approved programs yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {teachingLoads.map((load) => (
                  <button
                    type="button"
                    key={load.id}
                    onClick={() => setSelectedLoad(load)}
                    className={`w-full rounded-[1.5rem] border p-4 text-left shadow-sm transition ${
                      selectedLoad?.id === load.id
                        ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-400'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{load.approval_status}</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{load.program_name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{load.program_type}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-700">{load.hours_per_day} hrs/day</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{load.program_days} days</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Trainer Info */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Trainer Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">TM Number</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{user?.tm_number || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Email</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{user?.email || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Recognition</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{user?.ctpr_recognition_number || 'Not set'}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Main Content - Calendar */}
        <div>
          {selectedLoad ? (
            <TrainerScheduleView program={selectedLoad} trainerId={user.trainer_id || user.id} />
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center">
              <CalendarDays className="mx-auto h-16 w-16 text-slate-400 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">Select a Program</h3>
              <p className="text-slate-600 max-w-md mx-auto">
                Choose a program from the sidebar to view and manage your training calendar. Your calendar will appear here once you select a program.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
