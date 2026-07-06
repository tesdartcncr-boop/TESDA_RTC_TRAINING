import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { BookOpen, Clock, Filter, Search, ChevronDown } from 'lucide-react'

const Programs = () => {
  const [programs, setPrograms] = useState([])
  const [filteredPrograms, setFilteredPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchPrograms()
  }, [])

  useEffect(() => {
    filterPrograms()
  }, [programs, searchTerm, filterType])

  const fetchPrograms = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/programs')
      setPrograms(response.data)
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
        program.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(program => program.type === filterType)
    }

    setFilteredPrograms(filtered)
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Training Programs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Browse and view available training programs
        </p>
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
                className="input-field pl-10 text-black"
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
              <ChevronDown className={`h-4 w-4 ml-2 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
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
                  <button
                    onClick={() => setFilterType('Institution')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                      filterType === 'Institution' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Institution
                  </button>
                  <button
                    onClick={() => setFilterType('Community-Based')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                      filterType === 'Community-Based' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Community-Based
                  </button>
                  <button
                    onClick={() => setFilterType('Others')}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                      filterType === 'Others' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Others
                  </button>
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
                  <button className="w-full btn-secondary text-center">
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{programs.length}</div>
            <div className="text-sm text-gray-500">Total Programs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {programs.filter(p => p.type === 'Institution').length}
            </div>
            <div className="text-sm text-gray-500">Institution Programs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {programs.filter(p => p.type === 'Community-Based').length}
            </div>
            <div className="text-sm text-gray-500">Community Programs</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Programs
