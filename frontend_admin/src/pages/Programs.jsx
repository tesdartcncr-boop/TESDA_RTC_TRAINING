import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Download,
  Clock,
  Tag
} from 'lucide-react'

const Programs = () => {
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

  useEffect(() => {
    fetchPrograms()
  }, [])

  useEffect(() => {
    filterPrograms()
  }, [programs, searchTerm, filterType])

  const fetchPrograms = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/programs/', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        }
      })
      const data = await response.json()
      setPrograms(data)
    } catch (error) {
      console.error('Failed to fetch programs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterPrograms = () => {
    let filtered = programs

    if (searchTerm) {
      filtered = filtered.filter(program =>
        program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(program => program.type === filterType)
    }

    setFilteredPrograms(filtered)
  }

  const onCreateProgram = async (data) => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:5000/api/programs/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        await fetchPrograms()
        setShowCreateModal(false)
        reset()
      }
    } catch (error) {
      console.error('Failed to create program:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const onUpdateProgram = async (data) => {
    setIsLoading(true)
    try {
      const response = await fetch(`http://localhost:5000/api/programs/${selectedProgram.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        await fetchPrograms()
        setShowEditModal(false)
        setSelectedProgram(null)
        reset()
      }
    } catch (error) {
      console.error('Failed to update program:', error)
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
      
      if (response.ok) {
        await fetchPrograms()
      }
    } catch (error) {
      console.error('Failed to delete program:', error)
    }
  }

  const openEditModal = (program) => {
    setSelectedProgram(program)
    setValue('name', program.name)
    setValue('description', program.description || '')
    setValue('type', program.type)
    setValue('hours', program.hours)
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
      const url = window.URL.createObjectURL(blob)
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
        return 'bg-blue-100 text-blue-800'
      case 'Community-Based':
        return 'bg-green-100 text-green-800'
      case 'Others':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage training programs and courses
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportPrograms}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Program
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
                placeholder="Search programs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              <svg className={`h-4 w-4 ml-2 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showFilters && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                <div className="p-2">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                      filterType === 'all' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    All Types
                  </button>
                  {programTypes.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setFilterType(type.value)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm ${
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
          <div className="mt-4 flex items-center">
            <span className="text-sm text-gray-500">Filter: </span>
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {filterType}
            </span>
            <button
              onClick={() => setFilterType('all')}
              className="ml-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Programs Grid */}
      {filteredPrograms.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No programs found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || filterType !== 'all' 
              ? 'Try adjusting your search or filters' 
              : 'No programs available at the moment'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPrograms.map((program) => (
            <div key={program.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">{program.name}</h3>
                  <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(program.type)}`}>
                    {program.type}
                  </span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="h-4 w-4 mr-2" />
                  {program.hours} hours
                </div>
                
                <div className="text-sm text-gray-600">
                  {program.description || 'No description available'}
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditModal(program)}
                      className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteProgram(program.id)}
                      className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800"
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
      )}

      {/* Create Program Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Program</h3>
              <form onSubmit={handleSubmit(onCreateProgram)}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Program Name *</label>
                    <input
                      {...register('name', { required: 'Program name is required' })}
                      className="input-field mt-1"
                      placeholder="Enter program name"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      className="input-field mt-1"
                      placeholder="Enter program description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Program Type *</label>
                    <select
                      {...register('type', { required: 'Program type is required' })}
                      className="input-field mt-1"
                    >
                      <option value="">Select type</option>
                      {programTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    {errors.type && (
                      <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Number of Hours *</label>
                    <input
                      {...register('hours', { 
                        required: 'Hours is required',
                        min: { value: 1, message: 'Hours must be at least 1' }
                      })}
                      type="number"
                      className="input-field mt-1"
                      placeholder="Enter number of hours"
                    />
                    {errors.hours && (
                      <p className="mt-1 text-sm text-red-600">{errors.hours.message}</p>
                    )}
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
                    {isLoading ? 'Creating...' : 'Create Program'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Program Modal */}
      {showEditModal && selectedProgram && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowEditModal(false)} />
            <div className="relative bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Program</h3>
              <form onSubmit={handleSubmit(onUpdateProgram)}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Program Name</label>
                    <input
                      {...register('name')}
                      className="input-field mt-1"
                      placeholder="Enter program name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      className="input-field mt-1"
                      placeholder="Enter program description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Program Type</label>
                    <select
                      {...register('type')}
                      className="input-field mt-1"
                    >
                      {programTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Number of Hours</label>
                    <input
                      {...register('hours', { 
                        min: { value: 1, message: 'Hours must be at least 1' }
                      })}
                      type="number"
                      className="input-field mt-1"
                      placeholder="Enter number of hours"
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
                    {isLoading ? 'Updating...' : 'Update Program'}
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

export default Programs
