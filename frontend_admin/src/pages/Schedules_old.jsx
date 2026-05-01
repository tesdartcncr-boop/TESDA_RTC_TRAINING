import React, { useState, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ArrowRight, Check, AlertCircle, Loader, X } from 'lucide-react'

const Schedules = () => {
  const [trainerPrograms, setTrainerPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Schedule view state
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [scheduleData, setScheduleData] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Program and trainer lookup
  const [programsMap, setProgramsMap] = useState({})
  const [trainersMap, setTrainersMap] = useState({})

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const fetchTrainerPrograms = useCallback(async () => {
    try {
      setError(null)
      const token = localStorage.getItem('admin_token')

      // Fetch trainers
      const trainersRes = await fetch('http://localhost:5000/api/trainers/?skip=0&limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const trainersData = await trainersRes.json()
      const trainersById = {}
      trainersData.data?.forEach((t) => {
        trainersById[t.id] = t
      })
      setTrainersMap(trainersById)

      // Fetch programs
      const programsRes = await fetch('http://localhost:5000/api/programs/?skip=0&limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const programsData = await programsRes.json()
      const programsById = {}
      programsData.data?.forEach((p) => {
        programsById[p.id] = p
      })
      setProgramsMap(programsById)

      // Fetch trainer-program assignments
      const assignments = []
      for (const trainer of trainersData.data || []) {
        try {
          const programRes = await fetch(
            `http://localhost:5000/api/schedules/trainer/${trainer.id}/programs`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (programRes.ok) {
            const programs = await programRes.json()
            programs.forEach((prog) => {
              assignments.push({
                id: `${trainer.id}-${prog.program_id}`,
                trainer_id: trainer.id,
                trainer_name: trainer.trainer_name || trainer.username,
                program_id: prog.program_id,
                program_name: prog.program_name,
                program_days: prog.program_days || 1,
                program_schedule: prog.program_schedule || '8 Hours/Day',
              })
            })
          }
        } catch (e) {
          console.error(`Failed to fetch programs for trainer ${trainer.id}`, e)
        }
      }

      setTrainerPrograms(assignments)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrainerPrograms()
  }, [fetchTrainerPrograms])

  const fetchScheduleForAssignment = useCallback(
    async (trainerId, programId) => {
      try {
        setScheduleLoading(true)
        const token = localStorage.getItem('admin_token')
        const res = await fetch(
          `http://localhost:5000/api/schedules/trainer/${trainerId}/program/${programId}/schedule`,
          { headers: { Authorization: `Bearer ${token}` } }
        )

        if (res.ok) {
          const data = await res.json()
          // Convert to map for easier access
          const scheduleMap = {}
          data.forEach((entry) => {
            scheduleMap[entry.day_number] = entry
          })
          setScheduleData(scheduleMap)
        } else {
          setScheduleData({})
        }
      } catch (e) {
        console.error('Failed to fetch schedule', e)
        setScheduleData({})
      } finally {
        setScheduleLoading(false)
      }
    },
    []
  )

  const handleSelectAssignment = async (assignment) => {
    setSelectedAssignment(assignment)
    await fetchScheduleForAssignment(assignment.trainer_id, assignment.program_id)
  }

  const handleSaveDay = async (dayNumber, hoursPerDay) => {
    if (!selectedAssignment || isSaving) return

    try {
      setIsSaving(true)
      const token = localStorage.getItem('admin_token')

      const res = await fetch(
        `http://localhost:5000/api/schedules/trainer/${selectedAssignment.trainer_id}/program/${selectedAssignment.program_id}/day/${dayNumber}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            hours_per_day: hoursPerDay,
          }),
        }
      )

      if (res.ok) {
        const updated = { ...scheduleData }
        updated[dayNumber] = {
          day_number: dayNumber,
          hours_per_day: hoursPerDay,
          trainer_id: selectedAssignment.trainer_id,
          program_id: selectedAssignment.program_id,
        }
        setScheduleData(updated)
        setSuccessMessage(`Day ${dayNumber} saved with ${hoursPerDay} hours`)
      } else {
        const err = await res.json()
        setError(err.detail || 'Failed to save day')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading schedules...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-md">
          <div className="flex items-center">
            <div className="h-5 w-5 text-green-500 mr-3 font-bold">✓</div>
            <p className="text-green-800 font-semibold">{successMessage}</p>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <p className="text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selectedAssignment ? (
        <ScheduleDetail
          assignment={selectedAssignment}
          scheduleData={scheduleData}
          onSaveDay={handleSaveDay}
          onBack={() => setSelectedAssignment(null)}
          isLoading={scheduleLoading}
          isSaving={isSaving}
        />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Schedules</h1>
            <p className="mt-2 text-base text-gray-600 font-medium">Manage trainer program schedules</p>
          </div>

          {trainerPrograms.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-16 text-center">
              <Calendar className="mx-auto h-16 w-16 text-gray-400" />
              <h3 className="mt-4 text-lg font-bold text-gray-900">No trainer-program assignments</h3>
              <p className="mt-2 text-gray-500">Assign trainers to programs first in the Trainers tab</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trainerPrograms.map((assignment) => (
                <button
                  key={assignment.id}
                  onClick={() => handleSelectAssignment(assignment)}
                  className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">{assignment.trainer_name}</h3>
                      <p className="text-sm text-gray-500 font-medium mt-1">Trainer</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="text-sm">
                      <p className="font-semibold text-gray-700">Program:</p>
                      <p className="text-gray-600">{assignment.program_name}</p>
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold text-gray-700">Duration:</p>
                      <p className="text-gray-600">{assignment.program_days} days</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      Click to manage schedule
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScheduleDetail({ assignment, scheduleData, onSaveDay, onBack, isLoading, isSaving }) {
  const days = Array.from({ length: assignment.program_days }, (_, i) => i + 1)

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center text-blue-600 hover:text-blue-800 font-semibold"
      >
        <ChevronLeft className="h-5 w-5 mr-1" />
        Back to Schedules
      </button>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{assignment.trainer_name}</h2>
          <p className="text-gray-600 mt-1">{assignment.program_name}</p>
          <p className="text-sm text-gray-500 mt-2">{assignment.program_days} days total program duration</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {days.map((dayNumber) => (
              <DayCard
                key={dayNumber}
                dayNumber={dayNumber}
                scheduleEntry={scheduleData[dayNumber]}
                onSave={onSaveDay}
                isSaving={isSaving}
                isDisabled={isSaving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DayCard({ dayNumber, scheduleEntry, onSave, isSaving, isDisabled }) {
  const [selectedHours, setSelectedHours] = useState(scheduleEntry?.hours_per_day || 8)
  const [hasChanged, setHasChanged] = useState(false)

  const handleHoursChange = (hours) => {
    setSelectedHours(hours)
    setHasChanged(true)
  }

  const handleSave = () => {
    onSave(dayNumber, selectedHours)
    setHasChanged(false)
  }

  const isSaved = scheduleEntry && scheduleEntry.hours_per_day === selectedHours && !hasChanged

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-lg font-bold text-gray-900">Day {dayNumber}</h4>
          {isSaved && <p className="text-xs text-green-600 font-semibold mt-1">✓ Saved</p>}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <label className="flex items-center">
          <input
            type="radio"
            value={8}
            checked={selectedHours === 8}
            onChange={(e) => handleHoursChange(Number(e.target.value))}
            disabled={isDisabled}
            className="h-4 w-4 text-blue-600 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-gray-700 font-semibold">8 Hours/Day</span>
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            value={4}
            checked={selectedHours === 4}
            onChange={(e) => handleHoursChange(Number(e.target.value))}
            disabled={isDisabled}
            className="h-4 w-4 text-blue-600 disabled:opacity-50"
          />
          <span className="ml-3 text-sm text-gray-700 font-semibold">4 Hours/Day</span>
        </label>
      </div>

      {hasChanged && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 transition-colors"
        >
          {isSaving ? (
            <>
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Save
            </>
          )}
        </button>
      )}
    </div>
  )
}


export default Schedules
