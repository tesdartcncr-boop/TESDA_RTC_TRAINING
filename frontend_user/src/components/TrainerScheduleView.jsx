import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { ChevronLeft, ChevronRight, Calendar, AlertCircle } from 'lucide-react'

const STATUS_COLORS = {
  complete: { bg: 'bg-green-500', tint: 'bg-green-50', border: 'border-green-200', label: 'Complete', shortLabel: '✓' },
  absent: { bg: 'bg-red-500', tint: 'bg-red-50', border: 'border-red-200', label: 'Absent', shortLabel: '✗' },
  suspended: { bg: 'bg-yellow-500', tint: 'bg-yellow-50', border: 'border-yellow-200', label: 'Suspended', shortLabel: '⊗' },
  leave: { bg: 'bg-blue-500', tint: 'bg-sky-50', border: 'border-sky-200', label: 'Leave', shortLabel: '◐' },
}

const TrainerScheduleView = ({ program, trainerId }) => {
  const [scheduleEntries, setScheduleEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDay, setCurrentDay] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [modalDay, setModalDay] = useState(null)

  useEffect(() => {
    fetchScheduleEntries()
  }, [program, trainerId])

  const fetchScheduleEntries = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log(`Fetching schedule for trainer ${trainerId}, program ${program.program_id}`)
      const response = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${program.program_id}/schedule`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      )
      console.log('Schedule response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('Schedule entries fetched:', data)
        setScheduleEntries(data)
        if (data.length > 0) {
          setCurrentDay(Math.min(...data.map(d => d.day_number)))
        } else {
          setCurrentDay(1)
        }
      } else {
        const errorText = await response.text()
        console.error('Schedule response not OK:', response.status, errorText)
        setError('No schedule created yet for this program')
        setScheduleEntries([])
        setCurrentDay(1)
      }
    } catch (error) {
      console.error('Error fetching schedule:', error)
      setError(error.message)
      setScheduleEntries([])
    } finally {
      setLoading(false)
    }
  }

  const getDayEntry = (dayNum) => {
    return scheduleEntries.find(s => s.day_number === dayNum)
  }

  const updateDayStatus = async (dayNumber, status) => {
    if (!dayNumber) return
    try {
      setIsSaving(true)
      const token = localStorage.getItem('token')
      const entry = getDayEntry(dayNumber)
      const hours = entry?.hours_per_day || 8
      const currentStatus = entry?.status
      const newStatus = currentStatus === status ? null : status

      const res = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${program.program_id}/day/${dayNumber}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ hours_per_day: hours, status: newStatus }),
        }
      )

      if (res.ok) {
        const updated = await res.json()
        const updatedEntry = updated.data || updated
        setScheduleEntries((prev) => {
          const found = prev.some((e) => e.day_number === updatedEntry.day_number)
          if (found) return prev.map((e) => (e.day_number === updatedEntry.day_number ? updatedEntry : e))
          return [...prev, updatedEntry]
        })
      } else {
        const text = await res.text()
        console.error('Failed to update status:', res.status, text)
        setError('Failed to update status')
      }
    } catch (e) {
      console.error('Error updating status:', e)
      setError(e.message || 'Failed to update status')
    } finally {
      setIsSaving(false)
      setShowStatusModal(false)
      setModalDay(null)
    }
  }

  const renderCalendarGrid = () => {
    const totalDays = program.program_days || 0

    return (
      <div className="mb-6">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(5.75rem, 1fr))' }}
        >
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const entry = getDayEntry(day)
            const status = entry?.status
            const isSelected = currentDay === day

            let cellClassName = 'bg-white border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-slate-50'
            if (status) {
              const cfg = STATUS_COLORS[status]
              cellClassName = `${cfg.tint} ${cfg.border} text-slate-900`
            }
            if (isSelected) cellClassName += ' ring-2 ring-blue-400 shadow-sm'

            return (
              <button
                key={day}
                onClick={() => { setModalDay(day); setShowStatusModal(true); setCurrentDay(day) }}
                className={`relative flex aspect-square min-h-24 w-full flex-col items-center justify-center rounded-xl border-2 px-2 py-3 font-bold text-sm transition-all ${cellClassName}`}
                title={`Day ${day} - ${status ? STATUS_COLORS[status].label : 'Click to set status'}`}
              >
                {status ? (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] opacity-75">Day</span>
                    <div className={`flex items-center justify-center w-12 h-12 rounded-full ${STATUS_COLORS[status].bg} text-white text-2xl font-bold shadow-lg`}>
                      {day}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {STATUS_COLORS[status].label}
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="text-[11px] uppercase tracking-[0.2em] opacity-75">Day</span>
                    <span className="mt-1 text-lg leading-none">{day}</span>
                    <span className="mt-2 text-[11px] font-semibold uppercase tracking-wide opacity-75">Open</span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderDayDetails = () => {
    const entry = getDayEntry(currentDay)
    const status = entry?.status

    return (
      <div className="border border-gray-200 rounded-lg p-6 bg-gradient-to-br from-white to-gray-50">
        <div className="mb-4">
          <h4 className="text-xl font-bold text-gray-900 mb-1">Day {currentDay}</h4>
          <p className="text-sm text-gray-600">{program.program_name}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Hours per Day</p>
            <p className="text-2xl font-bold text-gray-900">{entry?.hours_per_day || '—'} hrs</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Status</p>
            {status && STATUS_COLORS[status] ? (
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white ${STATUS_COLORS[status].bg}`}>
                {STATUS_COLORS[status].label}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">Not set</p>
            )}
          </div>
        </div>

        {entry?.schedule_date && (
          <div className="mb-4 bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Date</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(entry.schedule_date).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        )}

        {entry?.notes && (
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Notes</p>
            <p className="text-sm text-gray-700 leading-relaxed">{entry.notes}</p>
          </div>
        )}

        {/* Status modal will appear when clicking a day cell */}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Calendar className="inline-block h-6 w-6 mr-3 text-blue-600" />
            {program.program_name}
          </h3>
          <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
            {program.program_days} Days
          </div>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Schedule Status</p>
              <p className="text-sm text-amber-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {renderCalendarGrid()}

        {/* Status Modal */}
        {showStatusModal && modalDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <button
              type="button"
              className="absolute inset-0 bg-black opacity-40"
              onClick={() => {
                setShowStatusModal(false)
                setModalDay(null)
              }}
              aria-label="Close status modal"
            />

            <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white p-6 shadow-[0_25px_70px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60 z-60">
              <div className="flex items-start justify-between mb-4">
                <h4 className="text-xl font-bold">Day {modalDay} — Change Status</h4>
                <button
                  aria-label="Close"
                  onClick={() => {
                    setShowStatusModal(false)
                    setModalDay(null)
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm text-slate-600 mb-4">Select a status for this day. Click the same status again to clear it.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {Object.entries(STATUS_COLORS).map(([key, color]) => (
                  <button
                    key={key}
                    disabled={isSaving}
                    onClick={() => updateDayStatus(modalDay, key)}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full text-white font-semibold transition transform hover:-translate-y-0.5 ${color.bg} hover:brightness-105 disabled:opacity-50`}
                    style={{ minWidth: 120 }}
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/25 text-sm font-bold">{color.shortLabel}</span>
                    <span className="whitespace-nowrap">{color.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowStatusModal(false)
                    setModalDay(null)
                  }}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 font-medium hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">Status Legend</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(STATUS_COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color.bg}`}></div>
                <span className="text-sm font-medium text-gray-700">{color.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Day Details */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="h-1 w-1 bg-blue-600 rounded-full mr-2" aria-hidden="true" />{' '}
          Day Details
        </h3>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentDay(Math.max(1, currentDay - 1))}
            disabled={currentDay === 1}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </button>

          <div className="text-center flex-1">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Current Day</p>
            <p className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">{currentDay}</p>
          </div>

          <button
            onClick={() => setCurrentDay(Math.min(program.program_days, currentDay + 1))}
            disabled={currentDay === program.program_days}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="h-5 w-5 text-gray-700" />
          </button>
        </div>

        {renderDayDetails()}
      </div>
    </div>
  )
}

TrainerScheduleView.propTypes = {
  program: PropTypes.shape({
    id: PropTypes.number,
    program_id: PropTypes.number.isRequired,
    program_name: PropTypes.string.isRequired,
    program_days: PropTypes.number.isRequired,
    program_type: PropTypes.string,
    program_schedule: PropTypes.string
  }).isRequired,
  trainerId: PropTypes.number.isRequired
}

export default TrainerScheduleView
