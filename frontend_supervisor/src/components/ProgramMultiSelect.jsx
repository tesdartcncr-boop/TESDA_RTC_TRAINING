/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Loader, Search, X } from 'lucide-react'
import { cacheManager } from '../utils/cacheManager'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const PAGE_SIZE = 8

const normalizeProgram = (program) => ({
  id: String(program.id),
  name: program.name,
})

function useProgramSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [programs, setPrograms] = useState([])
  const [selectedPrograms, setSelectedPrograms] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [skip, setSkip] = useState(0)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)
  const loadMoreRef = useRef(null)

  const fetchPrograms = useCallback(async (currentSkip = 0, append = false, query = searchTerm) => {
    try {
      setError(null)

      const cacheKey = cacheManager.generateKey('programs', {
        skip: currentSkip,
        limit: PAGE_SIZE,
        search: query || null,
      })
      const cached = cacheManager.get(cacheKey)

      if (cached) {
        const cachedPrograms = (cached.data || []).map(normalizeProgram)
        if (append) {
          setPrograms((previous) => {
            const existingIds = new Set(previous.map((program) => program.id))
            return [...previous, ...cachedPrograms.filter((program) => !existingIds.has(program.id))]
          })
        } else {
          setPrograms(cachedPrograms)
        }
        setHasMore(Boolean(cached.has_more))
        return
      }

      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }

      const response = await fetch(
        `${API_BASE_URL}/api/programs/?skip=${currentSkip}&limit=${PAGE_SIZE}&search=${encodeURIComponent(query || '')}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to load programs')
      }

      const data = await response.json()
      cacheManager.set(cacheKey, data)

      const nextPrograms = (data.data || []).map(normalizeProgram)
      if (append) {
        setPrograms((previous) => {
          const existingIds = new Set(previous.map((program) => program.id))
          return [...previous, ...nextPrograms.filter((program) => !existingIds.has(program.id))]
        })
      } else {
        setPrograms(nextPrograms)
      }

      setHasMore(Boolean(data.has_more))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [searchTerm, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const timer = globalThis.setTimeout(() => {
      setPrograms([])
      setSkip(0)
      setHasMore(true)
      fetchPrograms(0, false, searchTerm)
    }, 200)

    return () => globalThis.clearTimeout(timer)
  }, [fetchPrograms, isOpen, searchTerm])

  useEffect(() => {
    if (!isOpen || !hasMore || loading || loadingMore || !loadMoreRef.current) {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          const nextSkip = skip + PAGE_SIZE
          setSkip(nextSkip)
          fetchPrograms(nextSkip, true, searchTerm)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [fetchPrograms, hasMore, isOpen, loading, loadingMore, searchTerm, skip])

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const toggleProgram = (program) => {
    const nextProgram = normalizeProgram(program)
    const isSelected = selectedPrograms.some((item) => item.id === nextProgram.id)
    const nextSelected = isSelected
      ? selectedPrograms.filter((item) => item.id !== nextProgram.id)
      : [...selectedPrograms, nextProgram]

    setSelectedPrograms(nextSelected)
    return nextSelected.map((item) => item.id)
  }

  const removeProgram = (programId) => {
    const nextSelected = selectedPrograms.filter((item) => item.id !== programId)
    setSelectedPrograms(nextSelected)
    return nextSelected.map((item) => item.id)
  }

  const clearSelection = () => setSelectedPrograms([])

  let selectedLabel = 'Search and select qualifications'
  if (selectedPrograms.length > 0) {
    selectedLabel = `${selectedPrograms.length} qualification${selectedPrograms.length === 1 ? '' : 's'} selected`
  }

  let statusLabel = 'End of results'
  if (loadingMore) {
    statusLabel = 'Loading more...'
  } else if (hasMore) {
    statusLabel = 'Scroll for more'
  }

  return {
    isOpen,
    setIsOpen,
    searchTerm,
    setSearchTerm,
    programs,
    selectedPrograms,
    loading,
    loadingMore,
    error,
    containerRef,
    loadMoreRef,
    toggleProgram,
    removeProgram,
    clearSelection,
    selectedLabel,
    statusLabel,
  }
}

function ProgramChips({ selectedPrograms, onRemove }) {
  if (selectedPrograms.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {selectedPrograms.map((program) => (
        <span
          key={program.id}
          className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800"
        >
          <span className="max-w-[160px] truncate">{program.name}</span>
          <button
            type="button"
            onClick={() => onRemove(program.id)}
            className="rounded-full p-0.5 hover:bg-blue-200"
            aria-label={`Remove ${program.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

function ProgramOptions({ programs, loading, loadingMore, hasError, error, onSelect, selectedPrograms, loadMoreRef, statusLabel }) {
  const renderContent = () => {
    if (loading && programs.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Loader className="h-4 w-4 animate-spin" />
          Loading programs...
        </div>
      )
    }

    if (hasError) {
      return <p className="px-3 py-4 text-sm text-red-600">{error}</p>
    }

    if (programs.length === 0) {
      return <p className="px-3 py-4 text-sm text-gray-500">No programs found</p>
    }

    return (
      <div className="space-y-1">
        {programs.map((program) => {
          const isSelected = selectedPrograms.some((item) => item.id === program.id)

          return (
            <button
              key={program.id}
              type="button"
              onClick={() => onSelect(program)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-3 min-w-0 flex-1 truncate text-sm font-medium">{program.name}</span>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-transparent'}`}>
                <Check className="h-3 w-3" />
              </span>
            </button>
          )
        })}

        <div ref={loadMoreRef} className="py-2 text-center text-xs text-gray-400">
          {statusLabel}
        </div>
      </div>
    )
  }

  return renderContent()
}

const ProgramMultiSelect = ({ selectedProgramIds = [], onSelectionChange }) => {
  const {
    isOpen,
    setIsOpen,
    searchTerm,
    setSearchTerm,
    programs,
    selectedPrograms,
    loading,
    loadingMore,
    error,
    containerRef,
    loadMoreRef,
    toggleProgram,
    removeProgram,
    clearSelection,
    selectedLabel,
    statusLabel,
  } = useProgramSearch()

  useEffect(() => {
    if (selectedProgramIds.length === 0 && selectedPrograms.length > 0) {
      clearSelection()
    }
  }, [clearSelection, selectedProgramIds.length, selectedPrograms.length])

  const handleSelect = (program) => {
    onSelectionChange(toggleProgram(program))
  }

  const handleRemove = (programId) => {
    onSelectionChange(removeProgram(programId))
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 focus:border-blue-500 focus:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-700">Assigned Qualifications</p>
          <p className="truncate text-sm text-gray-500">{selectedLabel}</p>
        </div>
        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <ProgramChips selectedPrograms={selectedPrograms} onRemove={handleRemove} />

      {isOpen && (
        <div className="absolute z-30 mt-3 w-full rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="border-b border-gray-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border-2 border-gray-200 py-2.5 pl-10 pr-3 text-sm text-black focus:border-blue-500 focus:outline-none"
                placeholder="Search qualifications..."
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <ProgramOptions
              programs={programs}
              loading={loading}
              loadingMore={loadingMore}
              hasError={Boolean(error)}
              error={error}
              onSelect={handleSelect}
              selectedPrograms={selectedPrograms}
              loadMoreRef={loadMoreRef}
              statusLabel={statusLabel}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ProgramMultiSelect