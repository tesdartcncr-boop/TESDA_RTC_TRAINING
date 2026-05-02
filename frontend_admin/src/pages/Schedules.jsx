import React, { useEffect, useCallback, useState } from 'react'
import { AlertCircle, Search, Filter, ChevronDown, Trash2 } from 'lucide-react'

const STATUS_COLORS = {
  complete: { bg: 'bg-green-500', tint: 'bg-green-50', border: 'border-green-200', label: 'Complete', shortLabel: '✓' },
  absent: { bg: 'bg-red-500', tint: 'bg-red-50', border: 'border-red-200', label: 'Absent', shortLabel: '✗' },
  suspended: { bg: 'bg-yellow-500', tint: 'bg-yellow-50', border: 'border-yellow-200', label: 'Suspended', shortLabel: '⊗' },
  leave: { bg: 'bg-blue-500', tint: 'bg-sky-50', border: 'border-sky-200', label: 'Leave', shortLabel: '◐' },
}

const PROGRAM_TYPE_ORDER = ['Community-Based', 'Institution', 'Others', 'Uncategorized']
const PROGRAM_TYPE_BADGE = {
  'Community-Based': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Institution: 'bg-blue-100 text-blue-700 border border-blue-200',
  Others: 'bg-slate-100 text-slate-700 border border-slate-200',
  Uncategorized: 'bg-amber-100 text-amber-700 border border-amber-200',
}

const normalizeProgramType = (value) => {
  const type = (value || '').toString().trim().toLowerCase()

  if (type === 'community-based' || type === 'community based') return 'Community-Based'
  if (type === 'institution' || type === 'institution-based' || type === 'institution based') return 'Institution'
  if (type === 'others' || type === 'other') return 'Others'

  return 'Uncategorized'
}

export default function Schedules() {
  const [trainers, setTrainers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [trainerPrograms, setTrainerPrograms] = useState([])
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [scheduleData, setScheduleData] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [selectedCell, setSelectedCell] = useState(null)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [programSearchTerm, setProgramSearchTerm] = useState('')
  const [programFilterType, setProgramFilterType] = useState('all')
  const [showProgramFilters, setShowProgramFilters] = useState(false)
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null)

  const fetchTrainers = useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('admin_token')
      const res = await fetch('http://localhost:5000/api/trainers/?skip=0&limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTrainers(data.data || [])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrainers()
  }, [fetchTrainers])

  const handleTrainerClick = async (trainer) => {
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(
        `http://localhost:5000/api/schedules/trainer/${trainer.id}/programs`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const programs = await res.json()
        setTrainerPrograms(programs)
        setSelectedTrainer(trainer)
        setSelectedProgram(null)
        setScheduleData({})
        setProgramSearchTerm('')
        setProgramFilterType('all')
        setShowProgramFilters(false)
      }
    } catch (e) {
      console.error('Failed to fetch trainer programs', e)
      setError('Failed to fetch programs')
    }
  }

  const handleProgramSelect = async (program) => {
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(
        `http://localhost:5000/api/schedules/trainer/${selectedTrainer.id}/program/${program.program_id}/schedule`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        const scheduleMap = {}
        data.forEach((entry) => {
          scheduleMap[entry.day_number] = entry
        })
        setScheduleData(scheduleMap)
      }
    } catch (e) {
      console.error('Failed to fetch schedule', e)
    }
    setSelectedProgram(program)
    setSelectedCell(null)
    setHoursPerDay(8)
  }

  const handleDeleteAssignedSchedule = async (program) => {
    if (!selectedTrainer || !program?.program_id) return
    if (!globalThis.confirm(`Remove assigned schedule for ${program.program_name}?`)) return

    try {
      setDeletingAssignmentId(program.program_id)
      const token = localStorage.getItem('admin_token')
      const res = await fetch(
        `http://localhost:5000/api/schedules/trainer/${selectedTrainer.id}/program/${program.program_id}/assignment`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to delete assigned schedule')
      }

      setTrainerPrograms((prev) => prev.filter((item) => item.program_id !== program.program_id))
      setScheduleData({})
    } catch (e) {
      console.error('Failed to delete assigned schedule', e)
      setError(e.message || 'Failed to delete assigned schedule')
    } finally {
      setDeletingAssignmentId(null)
    }
  }

  const handleCellClick = (dayNumber) => {
    setSelectedCell(dayNumber)
    setShowStatusMenu(true)
  }

  const handleStatusChange = async (status) => {
    if (!selectedTrainer || !selectedProgram || !selectedCell || isSaving) return
    try {
      setIsSaving(true)
      const token = localStorage.getItem('admin_token')
      const currentStatus = scheduleData[selectedCell]?.status
      const newStatus = currentStatus === status ? null : status

      console.log(`Updating day ${selectedCell} status to:`, newStatus)

      const res = await fetch(
        `http://localhost:5000/api/schedules/trainer/${selectedTrainer.id}/program/${selectedProgram.program_id}/day/${selectedCell}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            hours_per_day: hoursPerDay,
            status: newStatus,
          }),
        }
      )
      if (res.ok) {
        const updated = await res.json()
        console.log('API Response:', updated)
        setScheduleData((prev) => ({
          ...prev,
          [selectedCell]: updated.data,
        }))
        console.log('Schedule data updated for day:', selectedCell, updated.data)
      } else {
        const errorText = await res.text()
        console.error('API Error:', res.status, errorText)
        setError(`Failed to update status: ${res.status}`)
      }
    } catch (e) {
      console.error('Failed to update schedule', e)
      setError('Failed to update status: ' + e.message)
    } finally {
      setIsSaving(false)
      setShowStatusMenu(false)
    }
  }

  const calculateDaysNeeded = () => {
    if (!selectedProgram) return 0
    const totalDays = selectedProgram.program_days || 1
    return hoursPerDay === 8 ? totalDays : Math.ceil(totalDays * 8 / hoursPerDay)
  }

  const calculateTotalHours = () => {
    if (!selectedProgram) return 0
    return (selectedProgram.program_days || 1) * 8
  }

  const filteredTrainerPrograms = trainerPrograms
    .map((program) => ({
      ...program,
      normalizedType: normalizeProgramType(program.program_type),
    }))
    .filter((program) => {
      if (!programSearchTerm.trim()) return true
      return (program.program_name || '').toLowerCase().includes(programSearchTerm.toLowerCase())
    })
    .filter((program) => {
      if (programFilterType === 'all') return true
      return program.normalizedType === programFilterType
    })
    .sort((a, b) => {
      const aTypeIndex = PROGRAM_TYPE_ORDER.indexOf(a.normalizedType)
      const bTypeIndex = PROGRAM_TYPE_ORDER.indexOf(b.normalizedType)
      if (aTypeIndex !== bTypeIndex) return aTypeIndex - bTypeIndex
      return (a.program_name || '').localeCompare(b.program_name || '')
    })

  // Trainer selection view
  if (!selectedTrainer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Schedules</h1>
            <p className="text-slate-600 text-lg">Select a trainer to manage their program schedules</p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
              <div className="flex items-start">
                <AlertCircle className="text-red-500 mr-3 mt-0.5 flex-shrink-0" size={20} />
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-slate-600 mt-4">Loading trainers...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {trainers.map((trainer) => (
                <button
                  key={trainer.id}
                  onClick={() => handleTrainerClick(trainer)}
                  className="group relative overflow-hidden rounded-xl bg-white p-6 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-slate-200 hover:border-blue-500"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{trainer.trainer_name || trainer.username}</h3>
                    <p className="text-sm text-slate-500">Click to manage schedules</p>
                  </div>
                  <div className="absolute right-4 top-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-xl">
                    →
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Program selection view
  if (!selectedProgram) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => {
              setSelectedTrainer(null)
              setTrainerPrograms([])
            }}
            className="mb-6 inline-flex items-center px-4 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:border-slate-300 transition-colors font-semibold"
          >
            ← Back to Trainers
          </button>

          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              {selectedTrainer.trainer_name || selectedTrainer.username}
            </h1>
            <p className="text-slate-600 text-lg">Select a program to manage the schedule</p>
          </div>

          {trainerPrograms.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <p className="text-slate-600 text-lg">No programs assigned to this trainer yet</p>
            </div>
          ) : (
            <div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={programSearchTerm}
                      onChange={(e) => setProgramSearchTerm(e.target.value)}
                      placeholder="Search by program name..."
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    />
                  </div>

                  <div className="relative md:w-52">
                    <button
                      type="button"
                      onClick={() => setShowProgramFilters((prev) => !prev)}
                      className="w-full inline-flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:border-slate-400 transition-colors"
                    >
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <Filter size={16} />
                        Filters
                      </span>
                      <ChevronDown size={16} className={`transition-transform ${showProgramFilters ? 'rotate-180' : ''}`} />
                    </button>

                    {showProgramFilters && (
                      <div className="absolute right-0 z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg p-3">
                        <label htmlFor="program-type-filter" className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Program Type</label>
                        <select
                          id="program-type-filter"
                          value={programFilterType}
                          onChange={(e) => setProgramFilterType(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        >
                          <option value="all">All Types</option>
                          <option value="Community-Based">Community-Based</option>
                          <option value="Institution">Institution</option>
                          <option value="Others">Others</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {filteredTrainerPrograms.length === 0 ? (
                <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
                  <p className="text-slate-600 text-lg">No programs match your search/filter</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredTrainerPrograms.map((program) => (
                    <div
                      key={program.program_id}
                      className="group relative overflow-hidden rounded-xl bg-white p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border-2 border-slate-200 hover:border-blue-500"
                    >
                      <button
                        type="button"
                        onClick={() => handleProgramSelect(program)}
                        className="w-full text-left"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative z-10">
                          <h3 className="text-2xl font-bold text-slate-900 mb-3">{program.program_name}</h3>
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold mb-3 ${PROGRAM_TYPE_BADGE[program.normalizedType] || PROGRAM_TYPE_BADGE.Uncategorized}`}>
                            {program.normalizedType}
                          </span>
                          <div className="space-y-2 text-slate-600">
                            <p className="flex justify-between">
                              <span className="font-medium">Duration:</span>
                              <span className="font-semibold text-slate-900">{program.program_days} days</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="font-medium">Schedule:</span>
                              <span className="font-semibold text-slate-900">{program.program_schedule}</span>
                            </p>
                          </div>
                        </div>
                        <div className="absolute right-6 top-6 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-2xl">
                          →
                        </div>
                      </button>

                      <div className="relative z-10 mt-5 pt-4 border-t border-slate-200 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteAssignedSchedule(program)}
                          disabled={deletingAssignmentId === program.program_id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                          {deletingAssignmentId === program.program_id ? 'Deleting...' : 'Delete Assigned'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Schedule detail view
  const totalDays = calculateDaysNeeded()
  const totalHours = calculateTotalHours()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <button
          onClick={() => {
            setSelectedProgram(null)
            setSelectedCell(null)
            setShowStatusMenu(false)
          }}
          className="mb-6 inline-flex items-center px-4 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 hover:border-slate-300 transition-colors font-semibold"
        >
          ← Back to Programs
        </button>

        {/* Header with Info */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-3">
                Name: <span className="text-blue-600">{selectedTrainer.trainer_name || selectedTrainer.username}</span>
              </h1>
              <p className="text-lg text-slate-600 mb-3">
                Program: <span className="font-bold text-blue-600 text-xl">{selectedProgram.program_name}</span>
              </p>
              <p className="text-lg text-slate-600">
                Total hours: <span className="font-bold text-slate-900">{totalHours} hours</span>
              </p>
            </div>
            <div className="flex flex-col justify-end">
              <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl p-6 border-2 border-blue-200">
                <p className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">Time per Day</p>
                <div className="flex gap-3 mb-4">
                  {[4, 8].map((hours) => (
                    <button
                      key={hours}
                      onClick={() => setHoursPerDay(hours)}
                      className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
                        hoursPerDay === hours
                          ? 'bg-blue-600 text-white shadow-lg scale-105'
                          : 'bg-white text-slate-700 border-2 border-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
                <p className="text-sm text-slate-600 font-semibold">
                  Days needed: <span className="text-slate-900 text-base">{totalDays} days</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
            <div className="flex items-start">
              <AlertCircle className="text-red-500 mr-3 mt-0.5 flex-shrink-0" size={20} />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Schedule Grid */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Schedule Grid - Click cells to set attendance status</h2>
          <div className="mb-6">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(5.75rem, 1fr))' }}
            >
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                const entry = scheduleData[day]
                const status = entry?.status
                const isSelected = selectedCell === day
                let cellClassName = 'bg-white border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-slate-50'

                if (status) {
                  cellClassName = `${STATUS_COLORS[status].tint} ${STATUS_COLORS[status].border} text-slate-900`
                }

                if (isSelected) {
                  cellClassName += ' ring-2 ring-blue-400 shadow-sm'
                }


                return (
                  <button
                    key={day}
                    onClick={() => handleCellClick(day)}
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

          {/* Status Menu */}
          {showStatusMenu && selectedCell && (
            <div className="bg-slate-50 rounded-lg p-6 border-2 border-blue-400 mb-6">
              <p className="text-sm font-bold text-slate-700 mb-4">Day {selectedCell} - Select Status:</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(STATUS_COLORS).map(([status, config]) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={isSaving}
                    className={`px-5 py-3 rounded-lg text-white font-bold transition-all ${config.bg} hover:shadow-lg disabled:opacity-50 flex items-center gap-2`}
                  >
                    <span className="text-lg">{config.shortLabel}</span>
                    {config.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setShowStatusMenu(false)
                    setSelectedCell(null)
                  }}
                  className="px-5 py-3 rounded-lg bg-slate-400 text-white font-bold hover:bg-slate-500 transition-colors ml-auto"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-3 italic">Click same status again to clear it</p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
          <h3 className="text-xl font-bold text-slate-900 mb-6">Status Legend</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Object.entries(STATUS_COLORS).map(([status, config]) => (
              <div key={status} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full ${config.bg} flex-shrink-0 flex items-center justify-center text-white font-bold text-sm`}>
                  {config.shortLabel}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{config.label}</p>
                  <p className="text-xs text-slate-500 capitalize">{status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
