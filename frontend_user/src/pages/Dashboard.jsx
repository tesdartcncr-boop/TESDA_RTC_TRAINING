import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TrainerScheduleView from '../components/TrainerScheduleView'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')
const getProgressBadge = (load) => {
  const completed = load?.progress_status === 'completed'
  return {
    label: completed ? 'Completed' : 'In Progress',
    tone: completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
  }
}

const getProgressFilterLabel = (value) => {
  if (value === 'all') return 'All Loads'
  if (value === 'completed') return 'Completed'
  return 'In Progress'
}

export default function Dashboard() {
  const { user } = useAuth()
  const [teachingLoads, setTeachingLoads] = useState([])
  const [selectedLoad, setSelectedLoad] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progressFilter, setProgressFilter] = useState('all')

  const loadTeachingLoads = useCallback(async (forceRefresh = false) => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    try {
      const trainerId = user.trainer_id || user.id
      const cacheKey = cacheManager.generateKey('trainer_teaching_loads', { trainer_id: trainerId })
      const cached = forceRefresh ? null : cacheManager.get(cacheKey)
      if (cached !== null) {
        setTeachingLoads(cached)
        setSelectedLoad(cached[0] || null)
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
      setSelectedLoad(null)
    } finally {
      setLoading(false)
    }
  }, [user?.id, user?.trainer_id])

  useEffect(() => {
    loadTeachingLoads()
  }, [loadTeachingLoads])

  useEffect(() => {
    if (!user?.id) return

    const socket = getSocket()
    if (!socket) return

    registerUser(user.user_id || user.id)

    const handleScheduleUpdate = (payload) => {
      if (!payload) return

      const trainerId = user.trainer_id || user.id
      const isRelevant = payload.trainer_id && String(payload.trainer_id) === String(trainerId)
      if (!isRelevant) return

      const cacheKey = cacheManager.generateKey('trainer_teaching_loads', { trainer_id: trainerId })
      cacheManager.delete(cacheKey)
      loadTeachingLoads(true)
    }

    socket.on('schedule_update', handleScheduleUpdate)

    return () => {
      socket.off('schedule_update', handleScheduleUpdate)
    }
  }, [loadTeachingLoads, user?.id, user?.trainer_id, user?.user_id])

  useEffect(() => {
    if (!user?.id) return

    const socket = getSocket()
    if (!socket) return

    const handleProgramUpdate = (payload) => {
      if (payload?.event_type !== 'program_deleted') return

      const trainerId = user.trainer_id || user.id
      const cacheKey = cacheManager.generateKey('trainer_teaching_loads', { trainer_id: trainerId })
      cacheManager.delete(cacheKey)
      loadTeachingLoads(true)
    }

    socket.on('program_update', handleProgramUpdate)

    return () => {
      socket.off('program_update', handleProgramUpdate)
    }
  }, [loadTeachingLoads, user?.id, user?.trainer_id, user?.user_id])

  const visibleLoads = useMemo(() => {
    if (progressFilter === 'all') {
      return teachingLoads
    }

    return teachingLoads.filter((load) => load.progress_status === progressFilter)
  }, [progressFilter, teachingLoads])

  useEffect(() => {
    if (visibleLoads.length === 0) {
      setSelectedLoad(null)
      return
    }

    if (!selectedLoad || !visibleLoads.some((load) => load.id === selectedLoad.id)) {
      setSelectedLoad(visibleLoads[0])
    }
  }, [selectedLoad, visibleLoads])

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
          <div className="flex flex-wrap gap-2">
            {['all', 'in progress', 'completed'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setProgressFilter(option)}
                className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                  progressFilter === option
                    ? 'bg-cyan-600 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {getProgressFilterLabel(option)}
              </button>
            ))}
          </div>

          {visibleLoads.map((load) => (
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
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC - NCR</p>
        <h1 className="mt-4 text-4xl font-black">{user?.trainer_name || user?.full_name || user?.username}</h1>
        <p className="mt-3 max-w-2xl text-cyan-50/90">
          Your training calendar is the main focus. Select a program from the sidebar to view and manage your daily schedule.
        </p>
      </section>

      {loadsContent}
    </div>
  )
}
