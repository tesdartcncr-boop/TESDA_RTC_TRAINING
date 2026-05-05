import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Download,
  Clock,
  ChevronDown,
  Loader,
  AlertCircle
} from 'lucide-react'
import { cacheManager } from '../utils/cacheManager'

const Programs = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState([])
  const [filteredPrograms, setFilteredPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
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

  const programTypes = [
    { value: 'Institution', label: 'Institution' },
    { value: 'Community-Based', label: 'Community-Based' },
    { value: 'Others', label: 'Others' }
  ]

  // State for form values
  const [formHours, setFormHours] = useState(0)
  const computedDaysAtEightHours = formHours > 0 ? Math.floor(formHours / 8) : 0
  const computedDaysAtFourHours = formHours > 0 ? Math.floor(formHours / 4) : 0

  // Fetch programs with pagination
  const fetchPrograms = useCallback(async (currentSkip = 0, append = false) => {
    try {
      setError(null)
      const cacheKey = cacheManager.generateKey('programs', { skip: currentSkip, limit })
      
      // Try to get from browser cache first
      const cached = cacheManager.get(cacheKey)
      if (cached) {
        if (append) {
          setPrograms(prev => [...prev, ...cached.data])
        } else {
          setPrograms(cached.data)
          setFilteredPrograms(cached.data)
        }
        setHasMore(cached.has_more)
        setLoading(false)
        return
      }

      const response = await fetch(
        `http://localhost:5000/api/programs/?skip=${currentSkip}&limit=${limit}&search=${searchTerm}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
          }
        }
      )
      
      if (!response.ok) throw new Error('Failed to fetch programs')
      
      const data = await response.json()
      
      // Cache the result
      cacheManager.set(cacheKey, data)
      
      if (append) {
        setPrograms(prev => [...prev, ...data.data])
      } else {
        setPrograms(data.data)
        setFilteredPrograms(data.data)
      }
      
      setHasMore(data.has_more)
    } catch (error) {
      console.error('Failed to fetch programs:', error)
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
    fetchPrograms(0, false)
  }, [searchTerm])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
          setIsLoadingMore(true)
          const newSkip = skip + limit
          setSkip(newSkip)
          fetchPrograms(newSkip, true)
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [skip, hasMore, isLoadingMore, loading, limit, fetchPrograms])

  const filterPrograms = useCallback(() => {
    let filtered = programs

    if (filterType !== 'all') {
      filtered = filtered.filter(program => program.type === filterType)
    }

    setFilteredPrograms(filtered)
  }, [programs, filterType])

  useEffect(() => {
    filterPrograms()
  }, [filterType, filterPrograms])

  useEffect(() => {
    if (location.state?.openCreateModal) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const onCreateProgram = async (data) => {
    setIsLoading(true)
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
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!response.ok) throw new Error('Failed to create program')
      
      // Invalidate cache and refresh
      cacheManager.clearPattern('programs:.*')
      await fetchPrograms(0, false)
      setShowCreateModal(false)
      reset()
      setFormHours(0)
      setSkip(0)
    } catch (error) {
      console.error('Failed to create program:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const onUpdateProgram = async (data) => {
    setIsLoading(true)
    try {
      const normalizedType = typeof data.type === 'object' ? data.type.value : data.type

      const cleanedData = {
        name: data.name || undefined,
        type: data.type ? normalizedType : undefined,
        description: data.description || null,
        hours: data.hours ? Number.parseInt(data.hours, 10) : null,
        schedule: data.schedule || undefined
      }
      
      // Remove undefined keys to only send changed fields
      Object.keys(cleanedData).forEach(key => cleanedData[key] === undefined && delete cleanedData[key])

      const response = await fetch(`http://localhost:5000/api/programs/${selectedProgram.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(cleanedData)
      })
      
      if (!response.ok) throw new Error('Failed to update program')
      
      // Invalidate cache and refresh
      cacheManager.clearPattern('programs:.*')
      setSkip(0)
      await fetchPrograms(0, false)
      setShowEditModal(false)
      setSelectedProgram(null)
      reset()
    } catch (error) {
      console.error('Failed to update program:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const onDeleteProgram = async (programId) => {
    if (!confirm('Are you sure you want to deactivate this program?')) return
    
    try {
      const response = await fetch(`http://localhost:5000/api/programs/${programId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      })
      
      if (!response.ok) throw new Error('Failed to delete program')
      
      // Invalidate cache and refresh
      cacheManager.clearPattern('programs:.*')
      setSkip(0)
      await fetchPrograms(0, false)
    } catch (error) {
      console.error('Failed to delete program:', error)
      setError(error.message)
    }
  }

  const openEditModal = (program) => {
    setSelectedProgram(program)
    setValue('name', program.name)
    setValue('description', program.description || '')
    setValue('type', program.type)
    setValue('hours', program.hours || '')
    setFormHours(program.hours || 0)
    setShowEditModal(true)
  }

  const exportPrograms = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/admin/programs/export', {
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
      a.download = 'programs.csv'
      a.click()
    } catch (error) {
      console.error('Failed to export programs:', error)
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'Institution':
        return 'bg-blue-100 text-blue-800 border border-blue-300'
      case 'Community-Based':
        return 'bg-green-100 text-green-800 border border-green-300'
      case 'Others':
        return 'bg-purple-100 text-purple-800 border border-purple-300'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading && programs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading programs...</p>
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
          <h1 className="text-3xl font-bold text-gray-900">Programs</h1>
          <p className="mt-2 text-base text-gray-600 font-medium">
            Manage training programs and courses
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportPrograms}
            className="flex items-center px-4 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-100 transition-all duration-200"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Program
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by program name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-3 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-semibold text-gray-700"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              <ChevronDown className={`h-4 w-4 ml-2 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            
            {showFilters && (
              <div className="absolute right-0 mt-3 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-10 overflow-hidden">
                <div className="p-2">
                  <button
                    onClick={() => {
                      setFilterType('all')
                      setShowFilters(false)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                      filterType === 'all' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    All Types
                  </button>
                  {programTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => {
                        setFilterType(type.value)
                        setShowFilters(false)
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                        filterType === type.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {filterType !== 'all' && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">Active Filter:</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
              {filterType}
            </span>
            <button
              onClick={() => setFilterType('all')}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Programs Grid */}
      {filteredPrograms.length === 0 && !loading ? (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-16 text-center">
          <BookOpen className="mx-auto h-16 w-16 text-gray-400" />
          <h3 className="mt-4 text-lg font-bold text-gray-900">No programs found</h3>
          <p className="mt-2 text-gray-600 font-medium">
            {searchTerm || filterType !== 'all' 
              ? 'Try adjusting your search or filters' 
              : 'Create your first program to get started'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-max">
            {filteredPrograms.map((program) => (
              <div key={program.id} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 border border-gray-200 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{program.name}</h3>
                      <span className={`mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getTypeColor(program.type)}`}>
                        {program.type}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    {program.hours && (
                      <div className="text-sm font-semibold text-gray-700">
                        <div className="flex items-center">
                          <Clock className="h-5 w-5 mr-3 text-blue-600" />
                          <span>{program.hours} hours</span>
                        </div>
                        <p className="ml-8 mt-1 text-gray-600">
                          {Math.floor(program.hours / 8)} days at 8 Hours/Day
                        </p>
                        <p className="ml-8 text-gray-600">
                          {Math.floor(program.hours / 4)} days at 4 Hours/Day
                        </p>
                      </div>
                    )}
                    
                    {program.description && (
                      <div className="text-sm text-gray-600 line-clamp-2">
                        {program.description}
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(program)}
                        className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteProgram(program.id)}
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

      {/* Create Program Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full overflow-hidden rounded-2xl bg-white p-8 shadow-[0_25px_70px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Create New Program</h3>
            <form onSubmit={handleSubmit(onCreateProgram)} className="space-y-4">
              <div>
                  <label htmlFor="program-name" className="block text-sm font-semibold text-gray-700 mb-2">Program Name *</label>
                <input
                    id="program-name"
                  {...register('name', { required: 'Program name is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter program name"
                />
                {errors.name && (
                  <p className="mt-2 text-sm font-semibold text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="program-type" className="block text-sm font-semibold text-gray-700 mb-2">Program Type *</label>
                <select
                  id="program-type"
                  {...register('type', { required: 'Program type is required' })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors font-medium"
                >
                  <option value="">Select type</option>
                  {programTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {errors.type && (
                  <p className="mt-2 text-sm font-semibold text-red-600">{errors.type.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="program-hours" className="block text-sm font-semibold text-gray-700 mb-2">Number of Hours</label>
                <input
                  id="program-hours"
                  {...register('hours')}
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
                      <p><span className="font-bold">{computedDaysAtEightHours} days</span> at 8 Hours/Day</p>
                      <p className="mt-1"><span className="font-bold">{computedDaysAtFourHours} days</span> at 4 Hours/Day</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="program-description" className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  id="program-description"
                  {...register('description')}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  placeholder="Enter program description (optional)"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
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
                  {isLoading ? 'Creating...' : 'Create Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Program Modal */}
      {showEditModal && selectedProgram && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full overflow-hidden rounded-2xl bg-white p-8 shadow-[0_25px_70px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Edit Program</h3>
            <form onSubmit={handleSubmit(onUpdateProgram)} className="space-y-4">
              <div>
                <label htmlFor="program-edit-name" className="block text-sm font-semibold text-gray-700 mb-2">Program Name</label>
                <input
                  id="program-edit-name"
                  {...register('name')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter program name"
                />
              </div>

              <div>
                <label htmlFor="program-edit-type" className="block text-sm font-semibold text-gray-700 mb-2">Program Type</label>
                <select
                  id="program-edit-type"
                  {...register('type')}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors font-medium"
                >
                  {programTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="program-edit-hours" className="block text-sm font-semibold text-gray-700 mb-2">Number of Hours</label>
                <input
                  id="program-edit-hours"
                  {...register('hours')}
                  type="number"
                  onChange={(e) => {
                    setFormHours(Number.parseInt(e.target.value, 10) || 0)
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter number of hours"
                />
              </div>

              {formHours > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start text-sm font-semibold text-blue-900">
                    <Clock className="h-5 w-5 mr-2 mt-0.5" />
                    <div>
                      <p><span className="font-bold">{computedDaysAtEightHours} days</span> at 8 Hours/Day</p>
                      <p className="mt-1"><span className="font-bold">{computedDaysAtFourHours} days</span> at 4 Hours/Day</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="program-edit-description" className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  id="program-edit-description"
                  {...register('description')}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  placeholder="Enter program description"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
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
                  {isLoading ? 'Updating...' : 'Update Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Programs
