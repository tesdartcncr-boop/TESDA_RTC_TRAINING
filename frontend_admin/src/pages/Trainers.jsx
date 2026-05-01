import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { 
  Users, 
  UserPlus, 
  Search, 
  Edit, 
  Trash2, 
  Download,
  Award,
  Loader,
  AlertCircle
} from 'lucide-react'
import { cacheManager } from '../utils/cacheManager'

const Trainers = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [trainers, setTrainers] = useState([])
  const [filteredTrainers, setFilteredTrainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pagination/Lazy loading state
  const [skip, setSkip] = useState(0)
  const [limit] = useState(12)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const observerTarget = useRef(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue
  } = useForm()

  // Fetch trainers with pagination
  const fetchTrainers = useCallback(async (currentSkip = 0, append = false) => {
    try {
      setError(null)
      const cacheKey = cacheManager.generateKey('trainers', { skip: currentSkip, limit })
      
      // Try to get from browser cache first
      const cached = cacheManager.get(cacheKey)
      if (cached) {
        if (append) {
          setTrainers(prev => [...prev, ...cached.data])
        } else {
          setTrainers(cached.data)
          setFilteredTrainers(cached.data)
        }
        setHasMore(cached.has_more)
        setLoading(false)
        return
      }

      const response = await fetch(
        `http://localhost:5000/api/trainers/?skip=${currentSkip}&limit=${limit}&search=${searchTerm}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
          }
        }
      )
      
      if (!response.ok) throw new Error('Failed to fetch trainers')
      
      const data = await response.json()
      
      // Cache the result
      cacheManager.set(cacheKey, data)
      
      if (append) {
        setTrainers(prev => [...prev, ...data.data])
      } else {
        setTrainers(data.data)
        setFilteredTrainers(data.data)
      }
      
      setHasMore(data.has_more)
    } catch (error) {
      console.error('Failed to fetch trainers:', error)
      setError(error.message)
    } finally {
      setLoading(false)
      setIsLoadingMore(false)
    }
  }, [limit, searchTerm])

  // Initial fetch
  useEffect(() => {
    setSkip(0)
    setLoading(true)
    fetchTrainers(0, false)
  }, [searchTerm])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
          setIsLoadingMore(true)
          const newSkip = skip + limit
          setSkip(newSkip)
          fetchTrainers(newSkip, true)
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [skip, hasMore, isLoadingMore, loading, limit, fetchTrainers])

  const filterTrainers = useCallback(() => {
    // Search is already done on the backend
    // This is just for any client-side filtering if needed
    setFilteredTrainers(trainers)
  }, [trainers])

  useEffect(() => {
    filterTrainers()
  }, [trainers, filterTrainers])

  useEffect(() => {
    if (location.state?.openCreateModal) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const onCreateTrainer = async (data) => {
    setIsLoading(true)
    try {
      // Clean up empty strings and format dates
      const cleanedData = {
        username: data.username,
        password: data.password,
        trainer_name: data.trainer_name || null,
        qualifications: data.qualifications || null,
        tm_number: data.tm_number || null,
        tm_expiration: data.tm_expiration ? new Date(data.tm_expiration).toISOString() : null,
        nttc_number: data.nttc_number || null,
        nttc_expiration: data.nttc_expiration ? new Date(data.nttc_expiration).toISOString() : null,
      }

      const response = await fetch('http://localhost:5000/api/trainers/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(cleanedData)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create trainer')
      }
      
      // Invalidate cache and refresh
      cacheManager.clearPattern('trainers:.*')
      setSkip(0)
      await fetchTrainers(0, false)
      setShowCreateModal(false)
      reset()
    } catch (error) {
      console.error('Failed to create trainer:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const onUpdateTrainer = async (data) => {
    setIsLoading(true)
    try {
      // Clean up empty strings and format dates
      const cleanedData = {
        trainer_name: data.trainer_name || null,
        qualifications: data.qualifications || null,
        tm_number: data.tm_number || null,
        tm_expiration: data.tm_expiration ? new Date(data.tm_expiration).toISOString() : null,
        nttc_number: data.nttc_number || null,
        nttc_expiration: data.nttc_expiration ? new Date(data.nttc_expiration).toISOString() : null,
      }

      const response = await fetch(`http://localhost:5000/api/trainers/${selectedTrainer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(cleanedData)
      })
      
      if (!response.ok) throw new Error('Failed to update trainer')
      
      // Invalidate cache and refresh
      cacheManager.clearPattern('trainers:.*')
      setSkip(0)
      await fetchTrainers(0, false)
      setShowEditModal(false)
      setSelectedTrainer(null)
      reset()
    } catch (error) {
      console.error('Failed to update trainer:', error)
      setError(error.message)
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
      
      if (!response.ok) throw new Error('Failed to delete trainer')
      
      // Invalidate cache and refresh
      cacheManager.clearPattern('trainers:.*')
      setSkip(0)
      await fetchTrainers(0, false)
    } catch (error) {
      console.error('Failed to delete trainer:', error)
      setError(error.message)
    }
  }

  const openEditModal = (trainer) => {
    setSelectedTrainer(trainer)
    setValue('trainer_name', trainer.trainer_name || '')
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
      month: 'short',
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
      const url = globalThis.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'trainers.csv'
      a.click()
    } catch (error) {
      console.error('Failed to export trainers:', error)
    }
  }

  if (loading && trainers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading trainers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <p className="text-red-800">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trainers</h1>
          <p className="mt-2 text-base text-gray-600 font-medium">
            Manage trainer accounts and profiles
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportTrainers}
            className="flex items-center px-4 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-100 transition-all duration-200"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all duration-200"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Add Trainer
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by trainer name or username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Trainers Grid */}
      {filteredTrainers.length === 0 && !loading ? (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-16 text-center">
          <Users className="mx-auto h-16 w-16 text-gray-400" />
          <h3 className="mt-4 text-lg font-bold text-gray-900">No trainers found</h3>
          <p className="mt-2 text-gray-600 font-medium">
            {searchTerm 
              ? 'Try adjusting your search' 
              : 'Create your first trainer to get started'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-max">
            {filteredTrainers.map((trainer) => (
              <div key={trainer.id} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 border border-gray-200 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                        <span className="text-blue-600 font-bold text-lg">
                          {trainer.trainer_name ? trainer.trainer_name.charAt(0) : trainer.username.charAt(0)}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {trainer.trainer_name || 'N/A'}
                      </h3>
                      <p className="text-sm text-gray-500 font-medium">@{trainer.username}</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {trainer.qualifications && (
                      <div className="text-sm text-gray-600">
                        <p className="font-semibold text-gray-700">Qualifications:</p>
                        <p className="text-gray-600 line-clamp-2">{trainer.qualifications}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      {trainer.tm_number && (
                        <div className="flex items-start text-sm text-gray-700">
                          <Award className="h-5 w-5 mr-2 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-semibold">TM: {trainer.tm_number}</p>
                            <p className="text-gray-500 text-xs">Expires: {formatDate(trainer.tm_expiration)}</p>
                          </div>
                        </div>
                      )}

                      {trainer.nttc_number && (
                        <div className="flex items-start text-sm text-gray-700">
                          <Award className="h-5 w-5 mr-2 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-semibold">NTTC: {trainer.nttc_number}</p>
                            <p className="text-gray-500 text-xs">Expires: {formatDate(trainer.nttc_expiration)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(trainer)}
                        className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteTrainer(trainer.id)}
                        className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Loading indicator for lazy loading */}
          {isLoadingMore && (
            <div className="flex justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}

          {/* Intersection observer target for infinite scroll */}
          <div ref={observerTarget} className="py-8" />
        </>
      )}

      {/* Create Trainer Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Create New Trainer</h3>
            <form onSubmit={handleSubmit(onCreateTrainer)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-username" className="block text-sm font-semibold text-gray-700 mb-2">Username *</label>
                  <input
                    id="trainer-username"
                    {...register('username', { required: 'Username is required' })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter username"
                  />
                  {errors.username && (
                    <p className="mt-2 text-sm font-semibold text-red-600">{errors.username.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="trainer-password" className="block text-sm font-semibold text-gray-700 mb-2">Password *</label>
                  <input
                    id="trainer-password"
                    {...register('password', { required: 'Password is required' })}
                    type="password"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter password"
                  />
                  {errors.password && (
                    <p className="mt-2 text-sm font-semibold text-red-600">{errors.password.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="trainer-name" className="block text-sm font-semibold text-gray-700 mb-2">Trainer Name</label>
                <input
                  id="trainer-name"
                  {...register('trainer_name')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter trainer name (optional)"
                />
              </div>

              <div>
                <label htmlFor="trainer-qualifications" className="block text-sm font-semibold text-gray-700 mb-2">Qualifications</label>
                <textarea
                  id="trainer-qualifications"
                  {...register('qualifications')}
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  placeholder="Enter qualifications (optional)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-tm-number" className="block text-sm font-semibold text-gray-700 mb-2">TM Number</label>
                  <input
                    id="trainer-tm-number"
                    {...register('tm_number')}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter TM number (optional)"
                  />
                </div>

                <div>
                  <label htmlFor="trainer-tm-expiration" className="block text-sm font-semibold text-gray-700 mb-2">TM Expiration</label>
                  <input
                    id="trainer-tm-expiration"
                    {...register('tm_expiration')}
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-nttc-number" className="block text-sm font-semibold text-gray-700 mb-2">NTTC Number</label>
                  <input
                    id="trainer-nttc-number"
                    {...register('nttc_number')}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter NTTC number (optional)"
                  />
                </div>

                <div>
                  <label htmlFor="trainer-nttc-expiration" className="block text-sm font-semibold text-gray-700 mb-2">NTTC Expiration</label>
                  <input
                    id="trainer-nttc-expiration"
                    {...register('nttc_expiration')}
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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

      {/* Edit Trainer Modal */}
      {showEditModal && selectedTrainer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Edit Trainer</h3>
            <form onSubmit={handleSubmit(onUpdateTrainer)} className="space-y-4">
              <div>
                <label htmlFor="trainer-edit-name" className="block text-sm font-semibold text-gray-700 mb-2">Trainer Name</label>
                <input
                  id="trainer-edit-name"
                  {...register('trainer_name')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter trainer name"
                />
              </div>

              <div>
                <label htmlFor="trainer-edit-qualifications" className="block text-sm font-semibold text-gray-700 mb-2">Qualifications</label>
                <textarea
                  id="trainer-edit-qualifications"
                  {...register('qualifications')}
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  placeholder="Enter qualifications"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-edit-tm-number" className="block text-sm font-semibold text-gray-700 mb-2">TM Number</label>
                  <input
                    id="trainer-edit-tm-number"
                    {...register('tm_number')}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter TM number"
                  />
                </div>

                <div>
                  <label htmlFor="trainer-edit-tm-expiration" className="block text-sm font-semibold text-gray-700 mb-2">TM Expiration</label>
                  <input
                    id="trainer-edit-tm-expiration"
                    {...register('tm_expiration')}
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trainer-edit-nttc-number" className="block text-sm font-semibold text-gray-700 mb-2">NTTC Number</label>
                  <input
                    id="trainer-edit-nttc-number"
                    {...register('nttc_number')}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter NTTC number"
                  />
                </div>

                <div>
                  <label htmlFor="trainer-edit-nttc-expiration" className="block text-sm font-semibold text-gray-700 mb-2">NTTC Expiration</label>
                  <input
                    id="trainer-edit-nttc-expiration"
                    {...register('nttc_expiration')}
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Update Trainer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Trainers
