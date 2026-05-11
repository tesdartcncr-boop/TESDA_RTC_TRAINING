import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import ModalShell from './ModalShell'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')
const STATUS_OPTIONS = [
  { key: 'complete', label: 'Complete', color: 'bg-emerald-500' },
  { key: 'absent', label: 'Absent', color: 'bg-rose-500' },
  { key: 'leave', label: 'Leave', color: 'bg-sky-500' },
  { key: 'suspended', label: 'Suspended', color: 'bg-amber-500' },
  { key: 'incomplete', label: 'Incomplete', color: 'bg-orange-500' },
]

export default function TrainerScheduleView({ program, trainerId }) {
  const [scheduleDays, setScheduleDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const calendarDays = Math.max(program.program_days || 0, scheduleDays.length)

  const loadSchedule = async () => {
    setLoading(true)
    try {
      const cacheKey = cacheManager.generateKey('trainer_schedule_days', {
        trainer_id: trainerId,
        program_id: program.program_id,
      })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setScheduleDays(cached)
        setLoading(false)
        return
      }

      const response = await fetch(`${API_BASE}/api/schedules/trainer/${trainerId}/program/${program.program_id}/schedule`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextDays = Array.isArray(data) ? data : []
      setScheduleDays(nextDays)
      cacheManager.set(cacheKey, nextDays)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedule()
  }, [program.program_id, trainerId])

  const dayMap = useMemo(() => Object.fromEntries(scheduleDays.map((day) => [day.day_number, day])), [scheduleDays])

  const handleStatusChange = async (status) => {
    if (!selectedDay) return
    try {
      const currentStatus = dayMap[selectedDay]?.status
      const nextStatus = currentStatus === status ? null : status

      const response = await fetch(`${API_BASE}/api/schedules/trainer/${trainerId}/program/${program.program_id}/day/${selectedDay}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          hours_per_day: program.hours_per_day,
          status: nextStatus,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update day status')
      }
      toast.success('Day status updated')
      cacheManager.clearPattern('trainer_schedule_days:')
      cacheManager.clearPattern('trainer_teaching_loads:')
      setSelectedDay(null)
      loadSchedule()
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-6 w-6 text-cyan-600" />
              <h2 className="text-2xl font-black text-slate-900">{program.program_name}</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">{program.program_type} • {program.program_total_hours || 0} total hours</p>
          </div>
          <div className="rounded-3xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm text-cyan-900">
            <p><span className="font-semibold">Hours per day:</span> {program.hours_per_day}</p>
            <p><span className="font-semibold">Calendar days:</span> {program.program_days}</p>
            <p><span className="font-semibold">Start date:</span> {program.schedule_date || 'Not set'}</p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">Loading schedule...</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: calendarDays }, (_, index) => index + 1).map((dayNumber) => {
              const entry = dayMap[dayNumber]
              const status = entry?.status
              const color = STATUS_OPTIONS.find((option) => option.key === status)?.color || 'bg-slate-300'
              return (
                <button
                  type="button"
                  key={dayNumber}
                  onClick={() => setSelectedDay(dayNumber)}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center transition hover:border-cyan-300 hover:bg-cyan-50"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Day {dayNumber}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{entry?.schedule_date || 'Pending date'}</p>
                  <div className="mt-4 flex justify-center">
                    <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}>
                      {status ? status.charAt(0).toUpperCase() : dayNumber}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{status || 'open'}</p>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Status Legend</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {STATUS_OPTIONS.map((option) => (
            <div key={option.key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className={`h-4 w-4 rounded-full ${option.color}`} />
              <span className="text-sm font-semibold text-slate-700">{option.label}</span>
            </div>
          ))}
        </div>
      </section>

      {selectedDay && (
        <ModalShell title={`Update Day ${selectedDay}`} onClose={() => setSelectedDay(null)} maxWidth="max-w-3xl">
          <p className="mb-4 text-sm text-slate-600">
            Choose a status for this day. If the day is not marked complete, the system automatically adds another weekday at the end of the calendar.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STATUS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.key}
                onClick={() => handleStatusChange(option.key)}
                className={`rounded-2xl px-4 py-4 text-sm font-bold text-white ${option.color}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setSelectedDay(null)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
              Cancel
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

TrainerScheduleView.propTypes = {
  program: PropTypes.shape({
    program_id: PropTypes.number.isRequired,
    program_name: PropTypes.string.isRequired,
    program_type: PropTypes.string,
    program_total_hours: PropTypes.number,
    hours_per_day: PropTypes.number.isRequired,
    program_days: PropTypes.number.isRequired,
    schedule_date: PropTypes.string,
  }).isRequired,
  trainerId: PropTypes.number.isRequired,
}
