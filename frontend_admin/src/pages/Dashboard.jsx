import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Users, BookOpen, CalendarPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

const Dashboard = () => {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.username || 'Admin'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Use the actions below to add records and assign programs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/trainers"
          state={{ openCreateModal: true }}
          className="card p-6 text-left hover:shadow-lg transition-shadow"
        >
          <Users className="h-8 w-8 text-blue-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Add Trainer</h3>
          <p className="mt-1 text-sm text-gray-500">Open trainer form and create a trainer account.</p>
        </Link>

        <Link
          to="/programs"
          state={{ openCreateModal: true }}
          className="card p-6 text-left hover:shadow-lg transition-shadow"
        >
          <BookOpen className="h-8 w-8 text-green-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Add Program</h3>
          <p className="mt-1 text-sm text-gray-500">Open program form and create a training program.</p>
        </Link>

        <Link
          to="/schedules"
          state={{ openAssignModal: true }}
          className="card p-6 text-left hover:shadow-lg transition-shadow"
        >
          <CalendarPlus className="h-8 w-8 text-purple-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Assign Program</h3>
          <p className="mt-1 text-sm text-gray-500">Assign a program to a trainer from schedules.</p>
        </Link>
      </div>
    </div>
  )
}

export default Dashboard
