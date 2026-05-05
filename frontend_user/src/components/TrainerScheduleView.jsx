import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { ChevronLeft, ChevronRight, Calendar, AlertCircle } from 'lucide-react'

const STATUS_COLORS = {
  complete: { bg: 'bg-green-500', tint: 'bg-green-50', border: 'border-green-200', label: 'Complete', shortLabel: 'C' },
  absent: { bg: 'bg-red-500', tint: 'bg-red-50', border: 'border-red-200', label: 'Absent', shortLabel: 'A' },
  suspended: { bg: 'bg-yellow-500', tint: 'bg-yellow-50', border: 'border-yellow-200', label: 'Suspended', shortLabel: 'S' },
  leave: { bg: 'bg-blue-500', tint: 'bg-sky-50', border: 'border-sky-200', label: 'Leave', shortLabel: 'L' },
}

const TrainerScheduleView = ({ program, trainerId, onProgramUpdate }) => {
  const [scheduleEntries, setScheduleEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDay, setCurrentDay] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [modalDay, setModalDay] = useState(null)
  const [hoursPerDay, setHoursPerDay] = useState(program.hours_per_day || 8)

  const totalHours = program.program_total_hours || ((program.program_days || 0) * hoursPerDay)
  const totalDays = totalHours > 0 ? Math.ceil(totalHours / hoursPerDay) : (program.program_days || 0)

  useEffect(() => {
    setHoursPerDay(program.hours_per_day || 8)
  }, [program.hours_per_day])

  useEffect(() => {
    fetchScheduleEntries()
  }, [program, trainerId])

  useEffect(() => {
    if (currentDay > totalDays) {
      setCurrentDay(totalDays || 1)
    }
  }, [currentDay, totalDays])

  const fetchScheduleEntries = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${program.program_id}/schedule`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      )

      if (response.ok) {
        const data = await response.json()
        setScheduleEntries(data)
        if (data.length > 0) {
          setCurrentDay(Math.min(...data.map((entry) => entry.day_number)))
        } else {
          setCurrentDay(1)
        }
      } else {
        setError('No schedule created yet for this program')
        setScheduleEntries([])
        setCurrentDay(1)
      }
    } catch (fetchError) {
      console.error('Error fetching schedule:', fetchError)
      setError(fetchError.message)
      setScheduleEntries([])
    } finally {
      setLoading(false)
    }
  }

  const getDayEntry = (dayNum) => scheduleEntries.find((entry) => entry.day_number === dayNum)

  const syncProgramDetails = (updatedProgram) => {
    if (onProgramUpdate) {
      onProgramUpdate(updatedProgram)
    }
  }

  const updateHoursPerDay = async (nextHours) => {
    if (nextHours === hoursPerDay || isSaving) return

    try {
      setIsSaving(true)
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${program.program_id}/hours-per-day`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ hours_per_day: nextHours }),
        }
      )

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(responseText || 'Failed to update hours per day')
      }

      const updatedProgram = await response.json()
      setHoursPerDay(updatedProgram.hours_per_day || nextHours)
      setScheduleEntries((prev) => prev.map((entry) => ({ ...entry, hours_per_day: nextHours })))
      syncProgramDetails(updatedProgram)
    } catch (updateError) {
      console.error('Failed to update hours per day:', updateError)
      setError(updateError.message || 'Failed to update hours per day')
    } finally {
      setIsSaving(false)
    }
  }

  const updateDayStatus = async (dayNumber, status) => {
    if (!dayNumber) return

    try {
      setIsSaving(true)
      const token = localStorage.getItem('token')
      const entry = getDayEntry(dayNumber)
      const currentStatus = entry?.status
      const newStatus = currentStatus === status ? null : status

      const response = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${program.program_id}/day/${dayNumber}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ hours_per_day: hoursPerDay, status: newStatus }),
        }
      )

      if (response.ok) {
        const updated = await response.json()
        const updatedEntry = updated.data || updated
        setScheduleEntries((prev) => {
          const found = prev.some((savedEntry) => savedEntry.day_number === updatedEntry.day_number)
          if (found) {
            return prev.map((savedEntry) => (
              savedEntry.day_number === updatedEntry.day_number ? updatedEntry : savedEntry
            ))
          }
          return [...prev, updatedEntry]
        })
      } else {
        const responseText = await response.text()
        throw new Error(responseText || 'Failed to update status')
      }
    } catch (updateError) {
      console.error('Error updating status:', updateError)
      setError(updateError.message || 'Failed to update status')
    } finally {
      setIsSaving(false)
      setShowStatusModal(false)
      setModalDay(null)
    }
  }

  const renderCalendarGrid = () => (
    <div className="mb-6">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(5.75rem, 1fr))' }}
      >
        {Array.from({ length: totalDays }, (_, index) => index + 1).map((day) => {
          const entry = getDayEntry(day)
          const status = entry?.status
          const isSelected = currentDay === day

          let cellClassName = 'bg-white border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-slate-50'
          if (status) {
            const config = STATUS_COLORS[status]
            cellClassName = `${config.tint} ${config.border} text-slate-900`
          }
          if (isSelected) cellClassName += ' ring-2 ring-blue-400 shadow-sm'

          return (
            <button
              key={day}
              onClick={() => {
                setModalDay(day)
                setShowStatusModal(true)
                setCurrentDay(day)
              }}
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
            <p className="text-2xl font-bold text-gray-900">{hoursPerDay} hrs</p>
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
                day: 'numeric',
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Calendar className="inline-block h-6 w-6 mr-3 text-blue-600" />
              {program.program_name}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Total hours: <span className="font-semibold text-gray-900">{totalHours}</span>
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Time per Day</p>
            <div className="mt-3 flex gap-3">
              {[4, 8].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => updateHoursPerDay(hours)}
                  disabled={isSaving}
                  className={`rounded-lg px-5 py-2.5 text-sm font-bold transition-all ${
                    hoursPerDay === hours
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'border border-slate-300 bg-white text-slate-700 hover:border-blue-400'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {hours}h
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">
              Days needed: <span className="text-slate-900">{totalDays}</span>
            </p>
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
                <h4 className="text-xl font-bold">Day {modalDay} - Change Status</h4>
                <button
                  aria-label="Close"
                  onClick={() => {
                    setShowStatusModal(false)
                    setModalDay(null)
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  x
                </button>
              </div>

              <p className="text-sm text-slate-600 mb-4">Select a status for this day. Click the same status again to clear it.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {Object.entries(STATUS_COLORS).map(([statusKey, color]) => (
                  <button
                    key={statusKey}
                    disabled={isSaving}
                    onClick={() => updateDayStatus(modalDay, statusKey)}
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

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">Status Legend</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(STATUS_COLORS).map(([statusKey, color]) => (
              <div key={statusKey} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color.bg}`}></div>
                <span className="text-sm font-medium text-gray-700">{color.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="h-1 w-1 bg-blue-600 rounded-full mr-2" aria-hidden="true" /> Day Details
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
            onClick={() => setCurrentDay(Math.min(totalDays, currentDay + 1))}
            disabled={currentDay === totalDays}
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
    program_total_hours: PropTypes.number,
    hours_per_day: PropTypes.number,
    program_type: PropTypes.string,
    program_schedule: PropTypes.string,
  }).isRequired,
  trainerId: PropTypes.number.isRequired,
  onProgramUpdate: PropTypes.func,
}

TrainerScheduleView.defaultProps = {
  onProgramUpdate: undefined,
}

export default TrainerScheduleView
