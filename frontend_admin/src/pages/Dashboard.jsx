import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import {
  Users,
  BookOpen,
  CalendarPlus,
  Clock,
  UserCheck,
  Award,
  X,
  CheckCircle
} from 'lucide-react'

const Dashboard = () => {
  const { user } = useAuth()

  // Modal visibility states
  const [showCreateProgramModal, setShowCreateProgramModal] = useState(false)
  const [showCreateTrainerModal, setShowCreateTrainerModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)

  // Data states
  const [trainers, setTrainers] = useState([])
  const [programs, setPrograms] = useState([])
  const [assignments, setAssignments] = useState([])

  // UI states
  const [loading, setLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Program form hours state
  const [formHours, setFormHours] = useState(0)
  
  // Trainer creation - selected programs for assignment
  const [selectedPrograms, setSelectedPrograms] = useState([])
  const computedDaysAtEightHours = formHours > 0 ? Math.floor(formHours / 8) : 0
  const computedDaysAtFourHours = formHours > 0 ? Math.floor(formHours / 4) : 0

  // Forms
  const programForm = useForm()
  const trainerForm = useForm()
  const assignForm = useForm()

  const programTypes = [
    { value: 'Institution', label: 'Institution' },
    { value: 'Community-Based', label: 'Community-Based' },
    { value: 'Others', label: 'Others' }
  ]

  // Fetch trainers and programs for assign modal
  const fetchTrainersAndPrograms = async () => {
    try {
      const token = localStorage.getItem('admin_token')
      const [trainerRes, programRes] = await Promise.all([
        fetch('http://localhost:5000/api/trainers/?skip=0&limit=100', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('http://localhost:5000/api/programs/?skip=0&limit=100', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      if (trainerRes.ok) {
        const trainerData = await trainerRes.json()
        setTrainers(trainerData.data || [])
      }
      if (programRes.ok) {
        const programData = await programRes.json()
        setPrograms(programData.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    }
  }

  useEffect(() => {
    fetchTrainersAndPrograms()
  }, [])

  // Auto-clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Create Program
  const onCreateProgram = async (data) => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = {
        name: data.name,
        type: typeof data.type === 'object' ? data.type.value : data.type,
        description: data.description || null,
        hours: data.hours ? Number.parseInt(data.hours, 10) : null,
        schedule: data.schedule || '8 Hours/Day'
      }

      const response = await fetch('http://localhost:5000/api/programs/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error('Failed to create program')

      setShowCreateProgramModal(false)
      programForm.reset()
      setFormHours(0)
      setSuccessMessage('Program created successfully!')
      fetchTrainersAndPrograms() // Refresh programs list
    } catch (err) {
      console.error('Failed to create program:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Create Trainer
  const onCreateTrainer = async (data) => {
    setIsLoading(true)
    setError(null)
    try {
      const cleanedData = {
        username: data.username,
        password: data.password,
        trainer_name: data.trainer_name || null,
        tm_number: data.tm_number || null,
        tm_expiration: data.tm_expiration ? new Date(data.tm_expiration).toISOString() : null,
        nttc_number: data.nttc_number || null,
        nttc_expiration: data.nttc_expiration ? new Date(data.nttc_expiration).toISOString() : null
      }

      const response = await fetch('http://localhost:5000/api/trainers/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(cleanedData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create trainer')
      }

      const newTrainer = await response.json()

      // Assign selected programs to the new trainer via the trainer_programs endpoint
      if (selectedPrograms.length > 0 && newTrainer.id) {
        const token = localStorage.getItem('admin_token')
        for (const programId of selectedPrograms) {
          const program = programs.find(p => String(p.id) === String(programId))
          if (program) {
            await fetch(`http://localhost:5000/api/trainers/${newTrainer.id}/programs`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                trainer_id: newTrainer.id,
                program_id: parseInt(programId, 10),
                assigned_by: user?.id || 1
              })
            })
          }
        }
      }

      setShowCreateTrainerModal(false)
      trainerForm.reset()
      setSelectedPrograms([])
      setSuccessMessage('Trainer created successfully!')
      fetchTrainersAndPrograms() // Refresh trainers list
    } catch (err) {
      console.error('Failed to create trainer:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Assign Program
  const onAssignProgram = async (data) => {
    setIsLoading(true)
    setError(null)
    try {
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
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({
          user_id: trainer.user_id,
          title,
          message
        })
      })

      if (!response.ok) throw new Error('Failed to assign program to trainer')

      setAssignments((prev) => [
        {
          id: `${trainer.id}-${program.id}-${Date.now()}`,
          trainerName: trainer.trainer_name || trainer.username,
          programName: program.name,
          scheduleDate: data.schedule_date || 'Not set'
        },
        ...prev
      ])

      setShowAssignModal(false)
      assignForm.reset()
      setSuccessMessage('Program assigned successfully!')
    } catch (err) {
      console.error('Failed to assign program:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-md">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
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

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <div className="flex items-center">
            <div className="h-5 w-5 text-red-500 mr-3 font-bold">!</div>
            <p className="text-red-800 font-semibold">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.username || 'Admin'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Use the actions below to add records and assign programs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          onClick={() => {
            setError(null)
            setShowCreateTrainerModal(true)
          }}
          className="card p-6 text-left hover:shadow-lg transition-shadow bg-white rounded-xl border border-gray-200"
        >
          <Users className="h-8 w-8 text-blue-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Add Trainer</h3>
          <p className="mt-1 text-sm text-gray-500">Open trainer form and create a trainer account.</p>
        </button>

        <button
          onClick={() => {
            setError(null)
            setShowCreateProgramModal(true)
          }}
          className="card p-6 text-left hover:shadow-lg transition-shadow bg-white rounded-xl border border-gray-200"
        >
          <BookOpen className="h-8 w-8 text-green-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Add Program</h3>
          <p className="mt-1 text-sm text-gray-500">Open program form and create a training program.</p>
        </button>

        <button
          onClick={() => {
            setError(null)
            setShowAssignModal(true)
          }}
          className="card p-6 text-left hover:shadow-lg transition-shadow bg-white rounded-xl border border-gray-200"
        >
          <CalendarPlus className="h-8 w-8 text-purple-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Assign Program</h3>
          <p className="mt-1 text-sm text-gray-500">Assign a program to a trainer from schedules.</p>
        </button>
      </div>

      {/* Recent Assignments Section */}
      {assignments.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Assignments</h2>
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
        </div>
      )}

      {/* Create Program Modal */}
      {showCreateProgramModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-md w-full p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Create New Program</h3>
              <button
                onClick={() => setShowCreateProgramModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={programForm.handleSubmit(onCreateProgram)} className="space-y-4">
              <div>
                <label htmlFor="program-name" className="block text-sm font-semibold text-gray-700 mb-2">
                  Program Name *
                </label>
                <input
                  id="program-name"
                  {...programForm.register('name', { required: 'Program name is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter program name"
                />
                {programForm.formState.errors.name && (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    {programForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="program-type" className="block text-sm font-semibold text-gray-700 mb-2">
                  Program Type *
                </label>
                <select
                  id="program-type"
                  {...programForm.register('type', { required: 'Program type is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors font-medium"
                >
                  <option value="">Select type</option>
                  {programTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {programForm.formState.errors.type && (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    {programForm.formState.errors.type.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="program-hours" className="block text-sm font-semibold text-gray-700 mb-2">
                  Number of Hours
                </label>
                <input
                  id="program-hours"
                  {...programForm.register('hours')}
                  type="number"
                  onChange={(e) => {
                    setFormHours(Number.parseInt(e.target.value, 10) || 0)
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter number of hours (optional)"
                />
              </div>

              {formHours > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start text-sm font-semibold text-blue-900">
                    <Clock className="h-5 w-5 mr-2 mt-0.5" />
                    <div>
                      <p>
                        <span className="font-bold">{computedDaysAtEightHours} days</span> at 8 Hours/Day
                      </p>
                      <p className="mt-1">
                        <span className="font-bold">{computedDaysAtFourHours} days</span> at 4 Hours/Day
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="program-description" className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="program-description"
                  {...programForm.register('description')}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  placeholder="Enter program description (optional)"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateProgramModal(false)}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Trainer Modal */}
      {showCreateTrainerModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Create New Trainer</h3>
              <button
                onClick={() => setShowCreateTrainerModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={trainerForm.handleSubmit(onCreateTrainer)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-username" className="block text-sm font-semibold text-gray-700 mb-2">
                    Username *
                  </label>
                  <input
                    id="trainer-username"
                    {...trainerForm.register('username', { required: 'Username is required' })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter username"
                  />
                  {trainerForm.formState.errors.username && (
                    <p className="mt-2 text-sm font-semibold text-red-600">
                      {trainerForm.formState.errors.username.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="trainer-password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Password *
                  </label>
                  <input
                    id="trainer-password"
                    {...trainerForm.register('password', { required: 'Password is required' })}
                    type="password"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter password"
                  />
                  {trainerForm.formState.errors.password && (
                    <p className="mt-2 text-sm font-semibold text-red-600">
                      {trainerForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="trainer-name" className="block text-sm font-semibold text-gray-700 mb-2">
                  Trainer Name
                </label>
                <input
                  id="trainer-name"
                  {...trainerForm.register('trainer_name')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter trainer name (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Assigned Programs
                </label>
                <div className="border-2 border-gray-200 rounded-lg p-4 max-h-40 overflow-y-auto">
                  {programs.length === 0 ? (
                    <p className="text-sm text-gray-500">No programs available</p>
                  ) : (
                    <div className="space-y-2">
                      {programs.map((program) => (
                        <label key={program.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                          <input
                            type="checkbox"
                            value={program.id}
                            checked={selectedPrograms.includes(String(program.id))}
                            onChange={(e) => {
                              const programId = String(program.id)
                              if (e.target.checked) {
                                setSelectedPrograms(prev => [...prev, programId])
                              } else {
                                setSelectedPrograms(prev => prev.filter(id => id !== programId))
                              }
                            }}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 font-medium">{program.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPrograms.length > 0 && (
                  <p className="mt-2 text-sm text-blue-600 font-semibold">
                    {selectedPrograms.length} program{selectedPrograms.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-tm-number" className="block text-sm font-semibold text-gray-700 mb-2">
                    TM Number
                  </label>
                  <input
                    id="trainer-tm-number"
                    {...trainerForm.register('tm_number')}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter TM number (optional)"
                  />
                </div>

                <div>
                  <label htmlFor="trainer-tm-expiration" className="block text-sm font-semibold text-gray-700 mb-2">
                    TM Expiration
                  </label>
                  <input
                    id="trainer-tm-expiration"
                    {...trainerForm.register('tm_expiration')}
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-nttc-number" className="block text-sm font-semibold text-gray-700 mb-2">
                    NTTC Number
                  </label>
                  <input
                    id="trainer-nttc-number"
                    {...trainerForm.register('nttc_number')}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter NTTC number (optional)"
                  />
                </div>

                <div>
                  <label htmlFor="trainer-nttc-expiration" className="block text-sm font-semibold text-gray-700 mb-2">
                    NTTC Expiration
                  </label>
                  <input
                    id="trainer-nttc-expiration"
                    {...trainerForm.register('nttc_expiration')}
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateTrainerModal(false)}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Trainer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Program Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-md w-full p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Assign Program to Trainer</h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={assignForm.handleSubmit(onAssignProgram)} className="space-y-4">
              <div>
                <label htmlFor="assign-trainer" className="block text-sm font-semibold text-gray-700 mb-2">
                  Trainer *
                </label>
                <select
                  id="assign-trainer"
                  {...assignForm.register('trainer_id', { required: 'Trainer is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select trainer</option>
                  {trainers.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.trainer_name || trainer.username}
                    </option>
                  ))}
                </select>
                {assignForm.formState.errors.trainer_id && (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    {assignForm.formState.errors.trainer_id.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="assign-program" className="block text-sm font-semibold text-gray-700 mb-2">
                  Program *
                </label>
                <select
                  id="assign-program"
                  {...assignForm.register('program_id', { required: 'Program is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select program</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
                {assignForm.formState.errors.program_id && (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    {assignForm.formState.errors.program_id.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="assign-date" className="block text-sm font-semibold text-gray-700 mb-2">
                  Schedule Date
                </label>
                <input
                  id="assign-date"
                  type="date"
                  {...assignForm.register('schedule_date')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false)
                    assignForm.reset()
                  }}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 inline-flex items-center"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  {isLoading ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
