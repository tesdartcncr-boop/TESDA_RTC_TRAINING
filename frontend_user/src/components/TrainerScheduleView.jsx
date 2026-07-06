import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import ModalShell from './ModalShell'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')
const STATUS_OPTIONS = [
  { key: 'complete', label: 'Complete', color: 'bg-emerald-500' },
  { key: 'absent', label: 'Absent', color: 'bg-rose-500' },
  { key: 'nat', label: 'NAT - No Action Taken', shortLabel: 'NAT', color: 'bg-slate-600' },
  { key: 'leave', label: 'On Leave', color: 'bg-sky-500' },
  { key: 'suspended', label: 'Suspended', color: 'bg-amber-500' },
  { key: 'incomplete', label: 'Incomplete', color: 'bg-orange-500' },
]

const getStatusOption = (status) => STATUS_OPTIONS.find((option) => option.key === status)
const getStatusDisplay = (status) => getStatusOption(status)?.shortLabel || status || 'open'

const isFutureDay = (scheduleDate) => {
  if (!scheduleDate) return false

  const parsed = new Date(`${String(scheduleDate).split('T')[0]}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return false

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return parsed.getTime() > today.getTime()
}

export default function TrainerScheduleView({ program, trainerId }) {
  const [scheduleDays, setScheduleDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const calendarDays = Math.max(program.program_days || 0, scheduleDays.length)
  const progressLabel = program.progress_status === 'completed' ? 'Completed' : 'In Progress'
  const progressTone = program.progress_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'

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

    const selectedEntry = dayMap[selectedDay]
    if (isFutureDay(selectedEntry?.schedule_date)) {
      toast.error('Future days cannot be updated yet')
      return
    }

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

  const generateCalendarWeeks = () => {
    if (scheduleDays.length === 0) return []

    // Sort entries by schedule_date
    const sortedEntries = [...scheduleDays].sort((a, b) => {
      const dateA = new Date(`${String(a.schedule_date).split('T')[0]}T00:00:00`).getTime()
      const dateB = new Date(`${String(b.schedule_date).split('T')[0]}T00:00:00`).getTime()
      return dateA - dateB
    })

    const firstDatePart = String(sortedEntries[0].schedule_date).split('T')[0]
    const firstDate = new Date(`${firstDatePart}T00:00:00`)
    const dayOfWeek = firstDate.getDay() // 0 = Sun, 1 = Mon, ...
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const startOfWeek = new Date(firstDate)
    startOfWeek.setDate(firstDate.getDate() - daysToMonday)

    const lastDatePart = String(sortedEntries[sortedEntries.length - 1].schedule_date).split('T')[0]
    const lastDate = new Date(`${lastDatePart}T00:00:00`)
    const lastDayOfWeek = lastDate.getDay()
    const daysToSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek
    const endOfWeek = new Date(lastDate)
    endOfWeek.setDate(lastDate.getDate() + daysToSunday)

    const weeks = []
    let current = new Date(startOfWeek)

    const dateToEntryMap = {}
    for (const entry of scheduleDays) {
      if (entry.schedule_date) {
        const dateStr = String(entry.schedule_date).split('T')[0]
        dateToEntryMap[dateStr] = entry
      }
    }

    while (current <= endOfWeek) {
      const week = []
      for (let i = 0; i < 7; i++) {
        const dateStr = current.toISOString().split('T')[0]
        const entry = dateToEntryMap[dateStr]

        week.push({
          date: new Date(current),
          dateStr: dateStr,
          entry: entry || null,
          dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
          isWeekend: i === 5 || i === 6,
        })

        current.setDate(current.getDate() + 1)
      }
      weeks.push(week)
    }

    return weeks
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${progressTone}`}>
                {progressLabel}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                {program.schedule_marked_days || 0}/{program.schedule_total_days || program.program_days || 0} days marked
              </span>
            </div>
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
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Calendar Header */}
              <div className="grid grid-cols-7 gap-1 mb-2 border-b border-slate-200 pb-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <div key={day} className="text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{day}</p>
                  </div>
                ))}
              </div>
              
              {/* Calendar Weeks */}
              <div className="space-y-1">
                {generateCalendarWeeks().map((week) => (
                  <div key={`week-${week[0]?.dateStr}`} className="grid grid-cols-7 gap-1">
                    {week.map((cell) => {
                      const formattedDate = new Date(`${cell.dateStr}T00:00:00`).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })

                      if (cell.entry === null) {
                        const shortDate = new Date(`${cell.dateStr}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })
                        return (
                          <div 
                            key={cell.dateStr} 
                            className="aspect-square rounded-lg border border-slate-100 p-2 text-center flex flex-col justify-between bg-slate-50/50"
                          >
                            <div className="opacity-40">
                              <p className="text-[10px] font-bold text-slate-400">{cell.dayName}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{shortDate}</p>
                            </div>
                            <div className="flex justify-center my-1 opacity-20">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-slate-400 bg-slate-200">
                                -
                              </span>
                            </div>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 opacity-40">
                              Off Day
                            </p>
                          </div>
                        )
                      }
                      
                      const entry = cell.entry
                      const status = entry?.status
                      const color = getStatusOption(status)?.color || 'bg-slate-300'
                      const locked = isFutureDay(entry?.schedule_date)
                      
                      return (
                        <button
                          type="button"
                          key={cell.dateStr}
                          onClick={() => !locked && setSelectedDay(entry.day_number)}
                          disabled={locked}
                          className={`aspect-square rounded-lg border border-slate-200 p-2 text-center transition-all flex flex-col justify-between ${
                            locked 
                              ? 'cursor-not-allowed bg-slate-50 opacity-60' 
                              : 'bg-white hover:border-cyan-300 hover:bg-cyan-50 hover:shadow-sm'
                          }`}
                        >
                          <div>
                            <p className="text-[10px] font-bold text-slate-700">Day {entry.day_number}</p>
                            <p className="text-[9px] text-slate-500 font-medium">{formattedDate}</p>
                          </div>
                          <div className="flex justify-center my-1">
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}>
                              {status ? getStatusDisplay(status).charAt(0).toUpperCase() : entry.day_number}
                            </span>
                          </div>
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 truncate">
                            {locked ? 'locked' : getStatusDisplay(status)}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
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
            Choose a status for this day. Future days stay locked until their schedule date arrives.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STATUS_OPTIONS.filter((option) => option.key !== 'nat').map((option) => (
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
    progress_status: PropTypes.string,
    schedule_marked_days: PropTypes.number,
    schedule_total_days: PropTypes.number,
  }).isRequired,
  trainerId: PropTypes.number.isRequired,
}
