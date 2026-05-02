import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TrainerScheduleView from '../components/TrainerScheduleView'
import { BookOpen, Clock, Zap } from 'lucide-react'

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth()
  const [programs, setPrograms] = useState([])
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Wait for auth to finish loading before trying to access user.id
    if (!authLoading && user?.id) {
      console.log('User data:', user)
      console.log('Trainer ID:', user.id)
      fetchTrainerPrograms()
    } else if (!authLoading && !user?.id) {
      console.log('User not authenticated or missing trainer ID')
      setLoading(false)
    }
  }, [user?.id, authLoading])

  const fetchTrainerPrograms = async () => {
    try {
      setLoading(true)
      const url = `http://localhost:5000/api/schedules/trainer/${user.id}/programs`
      console.log('Fetching programs from:', url)
      const response = await fetch(
        url,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      )
      console.log('Response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('Programs fetched:', data)
        setPrograms(data)
        if (data.length > 0) {
          setSelectedProgram(data[0])
        }
      } else {
        const errorText = await response.text()
        console.error('Response not OK:', response.status, errorText)
      }
    } catch (error) {
      console.error('Error fetching programs:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'Institution':
        return 'bg-blue-100 text-blue-800'
      case 'Community-Based':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTotalHours = () => {
    return programs.reduce((sum, p) => sum + (p.program_days * 8), 0)
  }

  // Show auth loading state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Show not authenticated message
  if (!user?.id) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-500">Unable to load dashboard. Please log in again.</div>
      </div>
    )
  }

  // Show loading spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Main dashboard content
  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user?.trainer_name || user?.username || 'Trainer'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's an overview of your assigned training programs and schedule
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-blue-500">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Assigned Programs
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {programs.length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-green-500">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Days
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {programs.reduce((sum, p) => sum + (p.program_days || 0), 0)}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-purple-500">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Hours
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {getTotalHours()}h
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* No programs assigned */}
      {programs.length === 0 && (
        <div className="card text-center p-12">
          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Programs Assigned</h3>
          <p className="text-gray-600">You currently have no training programs assigned to you.</p>
        </div>
      )}

      {/* Programs list and schedule view */}
      {programs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Programs List */}
          <div className="lg:col-span-1">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Programs</h3>
              <div className="space-y-2">
                {programs.map((program) => (
                  <button
                    key={program.id}
                    onClick={() => setSelectedProgram(program)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedProgram?.id === program.id
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'border-2 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900 text-sm">{program.program_name}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getTypeColor(
                          program.program_type
                        )}`}
                      >
                        {program.program_type}
                      </span>
                      <span className="text-xs text-gray-600">{program.program_days}d</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Schedule View */}
          <div className="lg:col-span-3">
            {selectedProgram && (
              <TrainerScheduleView program={selectedProgram} trainerId={user.id} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard

