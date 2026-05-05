import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TrainerScheduleView from '../components/TrainerScheduleView'
import { BookOpen, Clock, Zap, Award, Briefcase, Building2, Users } from 'lucide-react'

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth()
  const [programs, setPrograms] = useState([])
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchTrainerPrograms()
    } else if (!authLoading && !user?.id) {
      setLoading(false)
    }
  }, [user?.id, authLoading])

  const fetchTrainerPrograms = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `http://localhost:5000/api/schedules/trainer/${user.id}/programs`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      )

      if (response.ok) {
        const data = await response.json()
        setPrograms(data)
        setSelectedProgram((currentProgram) => {
          if (!data.length) return null
          if (!currentProgram) return data[0]
          return data.find((program) => program.id === currentProgram.id) || data[0]
        })
      }
    } catch (fetchError) {
      console.error('Error fetching programs:', fetchError)
    } finally {
      setLoading(false)
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'Institution':
        return 'bg-blue-100 text-blue-800 border border-blue-300'
      case 'Community-Based':
        return 'bg-green-100 text-green-800 border border-green-300'
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-300'
    }
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Institution':
        return Building2
      case 'Community-Based':
        return Users
      default:
        return BookOpen
    }
  }

  const getTotalHours = () => programs.reduce((sum, program) => (
    sum + (program.program_total_hours || ((program.program_days || 0) * (program.hours_per_day || 8)))
  ), 0)

  const handleProgramUpdate = (updatedProgram) => {
    setPrograms((prev) => prev.map((program) => (
      program.id === updatedProgram.id ? { ...program, ...updatedProgram } : program
    )))
    setSelectedProgram((currentProgram) => (
      currentProgram?.id === updatedProgram.id ? { ...currentProgram, ...updatedProgram } : currentProgram
    ))
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user?.id) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-500">Unable to load dashboard. Please log in again.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user?.trainer_name || user?.username || 'Trainer'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's an overview of your assigned training programs and schedule
        </p>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-md p-6 text-white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-blue-100 text-sm mb-2">Full Name</p>
            <div>
              <h2 className="text-2xl font-bold">{user?.trainer_name || user?.username || 'Trainer'}</h2>
            </div>
          </div>

          <div className="space-y-3">
            {user?.tm_number && (
              <div className="flex items-start gap-3">
                <Award className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-100 text-sm">TM Number</p>
                  <p className="font-semibold">{user.tm_number}</p>
                  {user?.tm_expiration && (
                    <p className="text-xs text-blue-100">Expires: {new Date(user.tm_expiration).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            )}
            {user?.nttc_number && (
              <div className="flex items-start gap-3">
                <Briefcase className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-100 text-sm">NTTC Number</p>
                  <p className="font-semibold">{user.nttc_number}</p>
                  {user?.nttc_expiration && (
                    <p className="text-xs text-blue-100">Expires: {new Date(user.nttc_expiration).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            )}
            {!user?.tm_number && !user?.nttc_number && (
              <p className="text-blue-100 text-sm italic">No certifications on file</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-blue-100">
              <BookOpen className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Assigned Programs</dt>
                <dd className="text-lg font-bold text-gray-900">{programs.length}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-green-100">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Days</dt>
                <dd className="text-lg font-bold text-gray-900">
                  {programs.reduce((sum, program) => sum + (program.program_days || 0), 0)}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-purple-100">
              <Zap className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Hours</dt>
                <dd className="text-lg font-bold text-gray-900">{getTotalHours()}h</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {programs.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Programs Assigned</h3>
          <p className="text-gray-600">You currently have no training programs assigned to you.</p>
        </div>
      )}

      {programs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <BookOpen className="h-5 w-5 mr-2 text-blue-600" />
                Your Programs
              </h3>
              <div className="space-y-2">
                {programs.map((program) => {
                  const TypeIcon = getTypeIcon(program.program_type)

                  return (
                    <button
                      key={program.id}
                      onClick={() => setSelectedProgram(program)}
                      className={`w-full text-left p-4 rounded-lg transition-all border-2 ${
                        selectedProgram?.id === program.id
                          ? 'bg-blue-50 border-blue-500 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 text-sm">{program.program_name}</p>
                          <p className="text-xs text-gray-600 mt-1">{program.program_days} days</p>
                          <p className="text-xs text-gray-500 mt-1">{program.program_schedule}</p>
                        </div>
                        <TypeIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getTypeColor(
                            program.program_type
                          )}`}
                        >
                          {program.program_type}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            {selectedProgram && (
              <TrainerScheduleView
                program={selectedProgram}
                trainerId={user.id}
                onProgramUpdate={handleProgramUpdate}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
