import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  User, 
  BookOpen, 
  Clock,
  Award,
  Calendar,
  TrendingUp
} from 'lucide-react'

const Dashboard = () => {
  const { user } = useAuth()

  const stats = [
    {
      name: 'Total Programs',
      value: '12',
      icon: BookOpen,
      color: 'bg-blue-500'
    },
    {
      name: 'Hours Completed',
      value: '156',
      icon: Clock,
      color: 'bg-green-500'
    },
    {
      name: 'Certifications',
      value: '3',
      icon: Award,
      color: 'bg-purple-500'
    },
    {
      name: 'This Month',
      value: '24h',
      icon: TrendingUp,
      color: 'bg-orange-500'
    }
  ]

  const recentPrograms = [
    {
      id: 1,
      name: 'Advanced Safety Training',
      type: 'Institution',
      hours: 40,
      status: 'In Progress',
      progress: 65
    },
    {
      id: 2,
      name: 'Community Health Workshop',
      type: 'Community-Based',
      hours: 24,
      status: 'Completed',
      progress: 100
    },
    {
      id: 3,
      name: 'Emergency Response Protocol',
      type: 'Institution',
      hours: 16,
      status: 'Upcoming',
      progress: 0
    }
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.trainer_name || 'Trainer'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's an overview of your training activities
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`flex-shrink-0 p-3 rounded-md ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.name}
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {stat.value}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Programs */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">Recent Programs</h3>
          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View all
          </button>
        </div>
        
        <div className="space-y-4">
          {recentPrograms.map((program) => (
            <div key={program.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center">
                  <h4 className="text-sm font-medium text-gray-900">{program.name}</h4>
                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    program.type === 'Institution' ? 'bg-blue-100 text-blue-800' :
                    program.type === 'Community-Based' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {program.type}
                  </span>
                </div>
                <div className="mt-1 flex items-center text-sm text-gray-500">
                  <Clock className="h-4 w-4 mr-1" />
                  {program.hours} hours
                  <span className="mx-2">•</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    program.status === 'Completed' ? 'bg-green-100 text-green-800' :
                    program.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {program.status}
                  </span>
                </div>
              </div>
              <div className="ml-4">
                <div className="w-20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Progress</span>
                    <span className="text-xs font-medium text-gray-900">{program.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${program.progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <Calendar className="h-8 w-8 text-blue-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">View Schedule</h3>
          <p className="mt-1 text-sm text-gray-500">Check your upcoming training sessions</p>
        </button>
        
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <User className="h-8 w-8 text-green-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Update Profile</h3>
          <p className="mt-1 text-sm text-gray-500">Manage your personal information</p>
        </button>
        
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <BookOpen className="h-8 w-8 text-purple-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Browse Programs</h3>
          <p className="mt-1 text-sm text-gray-500">Explore available training programs</p>
        </button>
      </div>
    </div>
  )
}

export default Dashboard
