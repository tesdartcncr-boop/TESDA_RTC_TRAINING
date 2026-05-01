import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Plus, UserCheck, AlertCircle } from 'lucide-react'

const Schedules = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [trainers, setTrainers] = useState([])
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assignments, setAssignments] = useState([])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  const fetchData = async () => {
    try {
      setError('')
      const token = localStorage.getItem('admin_token')

      const [trainerRes, programRes] = await Promise.all([
        fetch('http://localhost:5000/api/trainers/?skip=0&limit=100', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch('http://localhost:5000/api/programs/?skip=0&limit=100', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ])

      if (!trainerRes.ok || !programRes.ok) {
        throw new Error('Failed to load trainers or programs')
      }

      const trainerData = await trainerRes.json()
      const programData = await programRes.json()

      setTrainers(trainerData.data || [])
      setPrograms(programData.data || [])
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (location.state?.openAssignModal) {
      setShowAssignModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const onAssignProgram = async (data) => {
    setIsSubmitting(true)

    try {
      setError('')
      const trainer = trainers.find((item) => String(item.id) === String(data.trainer_id))
      const program = programs.find((item) => String(item.id) === String(data.program_id))

      if (!trainer || !program) {
        throw new Error('Please select a valid trainer and program')
      }

      const title = 'New Program Assignment'
      const scheduleLabel = data.schedule_date ? ` on ${data.schedule_date}` : ''
      const message = `${program.name} has been assigned to ${trainer.trainer_name || trainer.username}${scheduleLabel}.`

      const response = await fetch('http://localhost:5000/api/admin/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
        },
        body: JSON.stringify({
          user_id: trainer.user_id,
          title,
          message,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to assign program to trainer')
      }

      setAssignments((prev) => [
        {
          id: `${trainer.id}-${program.id}-${Date.now()}`,
          trainerName: trainer.trainer_name || trainer.username,
          programName: program.name,
          scheduleDate: data.schedule_date || 'Not set',
        },
        ...prev,
      ])

      setShowAssignModal(false)
      reset()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <p className="text-red-800">{error}</p>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              x
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedules</h1>
          <p className="mt-2 text-base text-gray-600 font-medium">
            Assign programs to trainers and track recent assignments.
          </p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus className="h-5 w-5 mr-2" />
          Assign Program
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Assignments</h2>
        {assignments.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <CalendarDays className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-3 font-medium">No assignments yet</p>
            <p className="text-sm">Click Assign Program to create one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg p-4"
              >
                <div>
                  <p className="text-sm font-bold text-gray-900">{assignment.programName}</p>
                  <p className="text-sm text-gray-600">Assigned to {assignment.trainerName}</p>
                </div>
                <span className="text-sm text-gray-500">{assignment.scheduleDate}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAssignModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-md w-full p-8 shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Assign Program to Trainer</h3>
            <form onSubmit={handleSubmit(onAssignProgram)} className="space-y-4">
              <div>
                <label htmlFor="assign-trainer" className="block text-sm font-semibold text-gray-700 mb-2">
                  Trainer *
                </label>
                <select
                  id="assign-trainer"
                  {...register('trainer_id', { required: 'Trainer is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select trainer</option>
                  {trainers.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.trainer_name || trainer.username}
                    </option>
                  ))}
                </select>
                {errors.trainer_id && (
                  <p className="mt-2 text-sm font-semibold text-red-600">{errors.trainer_id.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="assign-program" className="block text-sm font-semibold text-gray-700 mb-2">
                  Program *
                </label>
                <select
                  id="assign-program"
                  {...register('program_id', { required: 'Program is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select program</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
                {errors.program_id && (
                  <p className="mt-2 text-sm font-semibold text-red-600">{errors.program_id.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="assign-date" className="block text-sm font-semibold text-gray-700 mb-2">
                  Schedule Date
                </label>
                <input
                  id="assign-date"
                  type="date"
                  {...register('schedule_date')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false)
                    reset()
                  }}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 inline-flex items-center"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  {isSubmitting ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Schedules
