import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const STATUS_COLORS = {
  complete: { bg: 'bg-green-500', text: 'text-green-700', label: 'Complete' },
  absent: { bg: 'bg-red-500', text: 'text-red-700', label: 'Absent' },
  suspended: { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'Suspended' },
  leave: { bg: 'bg-blue-500', text: 'text-blue-700', label: 'Leave' },
}

const TrainerScheduleView = ({ program, trainerId }) => {
  const [scheduleEntries, setScheduleEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDay, setCurrentDay] = useState(1)

  useEffect(() => {
    fetchScheduleEntries()
  }, [program, trainerId])

  const fetchScheduleEntries = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${program.program_id}/schedule`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      )
      if (response.ok) {
        const data = await response.json()
        setScheduleEntries(data)
        if (data.length > 0) {
          setCurrentDay(Math.min(...data.map(d => d.day_number)))
        } else {
          setCurrentDay(1)
        }
      }
    } catch (error) {
      console.error('Error fetching schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDayStatus = (dayNum) => {
    const entry = scheduleEntries.find(s => s.day_number === dayNum)
    return entry?.status || null
  }

  const getDayEntry = (dayNum) => {
    return scheduleEntries.find(s => s.day_number === dayNum)
  }

  const renderCalendarGrid = () => {
    const days = program.program_days || 0
    const daysArray = Array.from({ length: days }, (_, i) => i + 1)

    const rows = []
    for (let i = 0; i < daysArray.length; i += 7) {
      rows.push(daysArray.slice(i, i + 7))
    }

    return (
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={`row-${row[0]}-${row.at(-1)}`} className="grid grid-cols-7 gap-3">
            {row.map((dayNum) => {
              const status = getDayStatus(dayNum)
              const statusColor = status ? STATUS_COLORS[status] : null

              return (
                <div
                  key={dayNum}
                  className={`aspect-square flex items-center justify-center rounded-lg border-2 font-semibold text-center transition-all ${
                    statusColor
                      ? `${statusColor.bg} border-transparent text-white`
                      : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div>
                    <div className="text-lg">{dayNum}</div>
                    {statusColor && <div className="text-xs mt-1 opacity-90">{statusColor.label}</div>}
                  </div>
                </div>
              )
            })}
            {row.length < 7 &&
              Array.from({ length: 7 - row.length }).map((_, i) => (
                <div key={`empty-${row.at(-1)}-${i}`} className="aspect-square" />
              ))}
          </div>
        ))}
      </div>
    )
  }

  const renderDayDetails = () => {
    const entry = getDayEntry(currentDay)
    const status = entry?.status

    return (
      <div className="border rounded-lg p-6 bg-gray-50">
        <div className="mb-4">
          <h4 className="text-lg font-semibold text-gray-900">Day {currentDay}</h4>
          <p className="text-sm text-gray-600 mt-1">Program: {program.program_name}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Hours per Day</p>
            <p className="text-lg font-semibold text-gray-900">{entry?.hours_per_day || '—'} hours</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Status</p>
            {status && STATUS_COLORS[status] ? (
              <div className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium text-white ${STATUS_COLORS[status].bg}`}>
                {STATUS_COLORS[status].label}
              </div>
            ) : (
              <p className="text-lg font-semibold text-gray-900">Not Set</p>
            )}
          </div>
        </div>

        {entry?.schedule_date && (
          <div className="mb-4">
            <p className="text-sm text-gray-600">Date</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(entry.schedule_date).toLocaleDateString()}
            </p>
          </div>
        )}

        {entry?.notes && (
          <div>
            <p className="text-sm text-gray-600">Notes</p>
            <p className="text-sm text-gray-900 mt-1">{entry.notes}</p>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Calendar Grid */}
      <div className="card">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            <Calendar className="inline-block h-5 w-5 mr-2" />
            {program.program_name} - {program.program_days} Days
          </h3>
        </div>

        {renderCalendarGrid()}

        {/* Legend */}
        <div className="mt-6 pt-6 border-t">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Status Legend</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(STATUS_COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center">
                <div className={`w-4 h-4 rounded ${color.bg} mr-2`}></div>
                <span className="text-sm text-gray-700">{color.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Day Details */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Day Details</h3>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentDay(Math.max(1, currentDay - 1))}
            disabled={currentDay === 1}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center flex-1">
            <p className="text-sm text-gray-600">Selected Day</p>
            <p className="text-2xl font-bold text-gray-900">{currentDay}</p>
          </div>

          <button
            onClick={() => setCurrentDay(Math.min(program.program_days, currentDay + 1))}
            disabled={currentDay === program.program_days}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-5 w-5" />
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
