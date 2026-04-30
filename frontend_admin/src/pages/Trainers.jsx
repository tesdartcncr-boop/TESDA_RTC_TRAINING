import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye,
  Download,
  Calendar,
  Award
} from 'lucide-react'

const Trainers = () => {
  const [trainers, setTrainers] = useState([])
  const [filteredTrainers, setFilteredTrainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue
  } = useForm()

  useEffect(() => {
    fetchTrainers()
  }, [])

  useEffect(() => {
    filterTrainers()
  }, [trainers, searchTerm])

  const fetchTrainers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/trainers/', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      })
      const data = await response.json()
      setTrainers(data)
    } catch (error) {
      console.error('Failed to fetch trainers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterTrainers = () => {
    if (!searchTerm) {
      setFilteredTrainers(trainers)
    } else {
      const filtered = trainers.filter(trainer =>
        trainer.trainer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trainer.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trainer.qualifications?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredTrainers(filtered)
    }
  }

  const onCreateTrainer = async (data) => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:5000/api/trainers/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        await fetchTrainers()
        setShowCreateModal(false)
        reset()
      }
    } catch (error) {
      console.error('Failed to create trainer:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const onUpdateTrainer = async (data) => {
    setIsLoading(true)
    try {
      const response = await fetch(`http://localhost:5000/api/trainers/${selectedTrainer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        await fetchTrainers()
        setShowEditModal(false)
        setSelectedTrainer(null)
        reset()
      }
    } catch (error) {
      console.error('Failed to update trainer:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const onDeleteTrainer = async (trainerId) => {
    if (!confirm('Are you sure you want to deactivate this trainer?')) return
    
    try {
      const response = await fetch(`http://localhost:5000/api/trainers/${trainerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      })
      
      if (response.ok) {
        await fetchTrainers()
      }
    } catch (error) {
      console.error('Failed to delete trainer:', error)
    }
  }

  const openEditModal = (trainer) => {
    setSelectedTrainer(trainer)
    setValue('trainer_name', trainer.trainer_name)
    setValue('qualifications', trainer.qualifications || '')
    setValue('tm_number', trainer.tm_number || '')
    setValue('tm_expiration', trainer.tm_expiration ? new Date(trainer.tm_expiration).toISOString().split('T')[0] : '')
    setValue('nttc_number', trainer.nttc_number || '')
    setValue('nttc_expiration', trainer.nttc_expiration ? new Date(trainer.nttc_expiration).toISOString().split('T')[0] : '')
    setShowEditModal(true)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const exportTrainers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/admin/trainers/export', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      })
      const data = await response.json()
      
      // Convert to CSV
      const csv = [
        Object.keys(data.data[0]).join(','),
        ...data.data.map(row => Object.values(row).join(','))
      ].join('\n')
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'trainers.csv'
      a.click()
    } catch (error) {
      console.error('Failed to export trainers:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trainers</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage trainer accounts and profiles
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportTrainers}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Trainer
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search trainers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Trainers Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trainer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qualifications
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certifications
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTrainers.map((trainer) => (
                <tr key={trainer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-blue-600 font-medium">
                            {trainer.trainer_name.charAt(0)}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{trainer.trainer_name}</div>
                        <div className="text-sm text-gray-500">@{trainer.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {trainer.qualifications || 'No qualifications'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {trainer.tm_number && (
                        <div className="flex items-center mb-1">
                          <Award className="h-3 w-3 mr-1 text-gray-400" />
                          TM: {trainer.tm_number}
                        </div>
                      )}
                      {trainer.nttc_number && (
                        <div className="flex items-center">
                          <Award className="h-3 w-3 mr-1 text-gray-400" />
                          NTTC: {trainer.nttc_number}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(trainer)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteTrainer(trainer.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Trainer Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Trainer</h3>
              <form onSubmit={handleSubmit(onCreateTrainer)}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Username *</label>
                    <input
                      {...register('username', { required: 'Username is required' })}
                      className="input-field mt-1"
                      placeholder="Enter username"
                    />
                    {errors.username && (
                      <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Trainer Name *</label>
                    <input
                      {...register('trainer_name', { required: 'Trainer name is required' })}
                      className="input-field mt-1"
                      placeholder="Enter trainer name"
                    />
                    {errors.trainer_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.trainer_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password *</label>
                    <input
                      {...register('password', { required: 'Password is required' })}
                      type="password"
                      className="input-field mt-1"
                      placeholder="Enter password"
                    />
                    {errors.password && (
                      <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Qualifications</label>
                    <textarea
                      {...register('qualifications')}
                      rows={3}
                      className="input-field mt-1"
                      placeholder="Enter qualifications"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">TM Number</label>
                    <input
                      {...register('tm_number')}
                      className="input-field mt-1"
                      placeholder="Enter TM number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">TM Expiration</label>
                    <input
                      {...register('tm_expiration')}
                      type="date"
                      className="input-field mt-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">NTTC Number</label>
                    <input
                      {...register('nttc_number')}
                      className="input-field mt-1"
                      placeholder="Enter NTTC number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">NTTC Expiration</label>
                    <input
                      {...register('nttc_expiration')}
                      type="date"
                      className="input-field mt-1"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary disabled:opacity-50"
                  >
                    {isLoading ? 'Creating...' : 'Create Trainer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Trainer Modal */}
      {showEditModal && selectedTrainer && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowEditModal(false)} />
            <div className="relative bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Trainer</h3>
              <form onSubmit={handleSubmit(onUpdateTrainer)}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Trainer Name</label>
                    <input
                      {...register('trainer_name')}
                      className="input-field mt-1"
                      placeholder="Enter trainer name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Qualifications</label>
                    <textarea
                      {...register('qualifications')}
                      rows={3}
                      className="input-field mt-1"
                      placeholder="Enter qualifications"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">TM Number</label>
                    <input
                      {...register('tm_number')}
                      className="input-field mt-1"
                      placeholder="Enter TM number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">TM Expiration</label>
                    <input
                      {...register('tm_expiration')}
                      type="date"
                      className="input-field mt-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">NTTC Number</label>
                    <input
                      {...register('nttc_number')}
                      className="input-field mt-1"
                      placeholder="Enter NTTC number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">NTTC Expiration</label>
                    <input
                      {...register('nttc_expiration')}
                      type="date"
                      className="input-field mt-1"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary disabled:opacity-50"
                  >
                    {isLoading ? 'Updating...' : 'Update Trainer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Trainers
