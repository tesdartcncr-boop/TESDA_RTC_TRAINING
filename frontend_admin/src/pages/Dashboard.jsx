import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  Users, 
  BookOpen, 
  Clock,
  TrendingUp,
  UserPlus,
  Calendar,
  Activity
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const Dashboard = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/admin/dashboard/stats')
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const programTypeData = [
    { name: 'Institution', value: stats?.institution_programs || 0, color: '#3B82F6' },
    { name: 'Community-Based', value: stats?.community_programs || 0, color: '#10B981' },
    { name: 'Others', value: stats?.other_programs || 0, color: '#6B7280' }
  ]

  const monthlyData = [
    { month: 'Jan', trainers: 12, programs: 8 },
    { month: 'Feb', trainers: 15, programs: 12 },
    { month: 'Mar', trainers: 18, programs: 15 },
    { month: 'Apr', trainers: 22, programs: 18 },
    { month: 'May', trainers: 25, programs: 22 },
    { month: 'Jun', trainers: 28, programs: 25 }
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.username || 'Admin'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's what's happening with your trainer portal today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-blue-500">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Trainers
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {stats?.total_trainers || 0}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-green-500">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Programs
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {stats?.total_programs || 0}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-purple-500">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Hours
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {stats?.total_hours || 0}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 rounded-md bg-orange-500">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Growth Rate
                </dt>
                <dd className="text-lg font-semibold text-gray-900">
                  +12.5%
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Program Type Distribution */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Program Type Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={programTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {programTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Growth */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Growth</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="trainers" fill="#3B82F6" name="Trainers" />
              <Bar dataKey="programs" fill="#10B981" name="Programs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Trainers */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Trainers</h3>
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {stats?.recent_trainers?.slice(0, 5).map((trainer) => (
              <div key={trainer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-medium">
                      {trainer.trainer_name.charAt(0)}
                    </span>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">{trainer.trainer_name}</p>
                    <p className="text-xs text-gray-500">@{trainer.username}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(trainer.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Programs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Programs</h3>
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {stats?.recent_programs?.slice(0, 5).map((program) => (
              <div key={program.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{program.name}</p>
                  <div className="flex items-center mt-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3 mr-1" />
                    {program.hours} hours
                    <span className="mx-2">•</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      program.type === 'Institution' ? 'bg-blue-100 text-blue-800' :
                      program.type === 'Community-Based' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {program.type}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(program.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <UserPlus className="h-8 w-8 text-blue-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Add Trainer</h3>
          <p className="mt-1 text-sm text-gray-500">Create new trainer account</p>
        </button>
        
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <BookOpen className="h-8 w-8 text-green-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Add Program</h3>
          <p className="mt-1 text-sm text-gray-500">Create new training program</p>
        </button>
        
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <Calendar className="h-8 w-8 text-purple-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Schedule</h3>
          <p className="mt-1 text-sm text-gray-500">View training schedules</p>
        </button>
        
        <button className="card p-6 text-left hover:shadow-lg transition-shadow">
          <Activity className="h-8 w-8 text-orange-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Reports</h3>
          <p className="mt-1 text-sm text-gray-500">Generate reports</p>
        </button>
      </div>
    </div>
  )
}

export default Dashboard
