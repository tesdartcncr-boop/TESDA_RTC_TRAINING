import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Search, Users, CalendarDays, BookOpen, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')
const PAGE_SIZE = 15
const TEACHING_LOADS_CACHE_VERSION = 'v2'

const getTrainerDisplayName = (trainer) => (
  trainer?.trainer_name || trainer?.full_name || trainer?.username || trainer?.email || 'Unnamed trainer'
)

const getProgramDisplayName = (program) => program?.name || 'Unnamed program'
const isSameId = (left, right) => String(left) === String(right)
const getProgressKey = (status) => String(status || '').trim().toLowerCase().replace(/\s+/g, '-')

const getTotalPages = (payload, page) => {
  if (Number.isFinite(payload?.totalPages) && payload.totalPages > 0) {
    return payload.totalPages
  }

  const totalCount = Number(payload?.total ?? payload?.totalCount)
  if (Number.isFinite(totalCount) && totalCount >= 0) {
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  }

  if (typeof payload?.has_more === 'boolean') {
    return payload.has_more ? page + 1 : Math.max(page, 1)
  }

  const rowCount = Array.isArray(payload?.data) ? payload.data.length : 0
  return rowCount >= PAGE_SIZE ? page + 1 : Math.max(page, 1)
}

export default function TeachingLoads() {
  const { user } = useAuth()
  const [programs, setPrograms] = useState([])
  const [trainers, setTrainers] = useState([])
  const [teachingLoads, setTeachingLoads] = useState([])
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [selectedLoad, setSelectedLoad] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [viewMode, setViewMode] = useState('programs') // 'programs' or 'trainers'
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [programPage, setProgramPage] = useState(1)
  const [trainerPage, setTrainerPage] = useState(1)
  const [programTotalPages, setProgramTotalPages] = useState(0)
  const [trainerTotalPages, setTrainerTotalPages] = useState(0)
  const [expandedItems, setExpandedItems] = useState(new Set())
  const [teachingLoadsLoading, setTeachingLoadsLoading] = useState(false)
  const [allTeachingLoads, setAllTeachingLoads] = useState([])
  const [programProgressFilter, setProgramProgressFilter] = useState('all')
  const [trainerProgressFilter, setTrainerProgressFilter] = useState('all')

  // Load all teaching loads summary for badge counts
  const loadAllTeachingLoads = useCallback(async () => {
    try {
      const cacheKey = cacheManager.generateKey('all_teaching_loads_combined')
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setAllTeachingLoads(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/admin/teaching-loads/summary`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const allLoads = Array.isArray(data) ? data : []
      setAllTeachingLoads(allLoads)
      cacheManager.set(cacheKey, allLoads, 60000)
    } catch (error) {
      console.error('Failed to load all teaching loads:', error)
      setAllTeachingLoads([])
    }
  }, [])

  // Load programs with pagination
  const loadPrograms = useCallback(async (page = 1, search = '') => {
    try {
      const cacheKey = cacheManager.generateKey('teaching_loads_programs', { page, search, version: TEACHING_LOADS_CACHE_VERSION })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setPrograms(cached.data)
        setProgramTotalPages(cached.totalPages)
        return
      }

      const skip = (page - 1) * PAGE_SIZE
      const response = await fetch(`${API_BASE}/api/programs/?skip=${skip}&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextPrograms = data.data || []
      const totalPages = getTotalPages(data, page)
      setPrograms(nextPrograms)
      setProgramTotalPages(totalPages)
      cacheManager.set(cacheKey, { data: nextPrograms, totalPages }, 300000)
    } catch (error) {
      console.error('Failed to load programs:', error)
      setPrograms([])
    }
  }, [])

  // Load trainers with pagination
  const loadTrainers = useCallback(async (page = 1, search = '') => {
    try {
      const cacheKey = cacheManager.generateKey('teaching_loads_trainers', { page, search, version: TEACHING_LOADS_CACHE_VERSION })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setTrainers(cached.data)
        setTrainerTotalPages(cached.totalPages)
        return
      }

      const skip = (page - 1) * PAGE_SIZE
      const response = await fetch(`${API_BASE}/api/trainers/?skip=${skip}&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextTrainers = data.data || []
      const totalPages = getTotalPages(data, page)
      setTrainers(nextTrainers)
      setTrainerTotalPages(totalPages)
      cacheManager.set(cacheKey, { data: nextTrainers, totalPages }, 300000)
    } catch (error) {
      console.error('Failed to load trainers:', error)
      setTrainers([])
    }
  }, [])

  // Load teaching loads for a program
  const loadProgramTeachingLoads = useCallback(async (programId) => {
    try {
      const cacheKey = cacheManager.generateKey('program_teaching_loads', { program_id: programId })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setTeachingLoads(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/admin/programs/${programId}/teaching-loads`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextLoads = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      setTeachingLoads(nextLoads)
      cacheManager.set(cacheKey, nextLoads, 300000)
    } catch (error) {
      console.error('Failed to load program teaching loads:', error)
      setTeachingLoads([])
    }
  }, [])

  // Load teaching loads for a trainer
  const loadTrainerTeachingLoads = useCallback(async (trainerId) => {
    try {
      const cacheKey = cacheManager.generateKey('trainer_teaching_loads', { trainer_id: trainerId })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setTeachingLoads(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/schedules/trainer/${trainerId}/programs`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextLoads = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      setTeachingLoads(nextLoads)
      cacheManager.set(cacheKey, nextLoads, 300000)
    } catch (error) {
      console.error('Failed to load trainer teaching loads:', error)
      setTeachingLoads([])
    }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        if (viewMode === 'programs') {
          await Promise.all([
            loadPrograms(programPage, searchTerm),
            loadAllTeachingLoads(),
          ])
          return
        }

        await Promise.all([
          loadTrainers(trainerPage, searchTerm),
          loadAllTeachingLoads(),
        ])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [loadAllTeachingLoads, loadPrograms, loadTrainers, programPage, searchTerm, trainerPage, viewMode])

  // Pagination handlers
  const handleProgramPageChange = (newPage) => {
    setProgramPage(newPage)
  }

  const handleTrainerPageChange = (newPage) => {
    setTrainerPage(newPage)
  }

  const handleSearchChange = (value) => {
    setSearchTerm(value)
    if (viewMode === 'programs') {
      setProgramPage(1)
      return
    }

    setTrainerPage(1)
  }

  // Toggle expanded state
  const toggleExpanded = (id) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  // Program selection handler
  const handleProgramSelect = async (program) => {
    setSelectedProgram(program)
    setSelectedTrainer(null)
    setTeachingLoadsLoading(true)
    setExpandedItems((prevExpanded) => {
      const nextExpanded = new Set(prevExpanded)
      nextExpanded.add(program.id)
      return nextExpanded
    })
    await loadProgramTeachingLoads(program.id)
    setTeachingLoadsLoading(false)
  }

  // Trainer selection handler
  const handleTrainerSelect = async (trainer) => {
    setSelectedTrainer(trainer)
    setSelectedProgram(null)
    setTeachingLoadsLoading(true)
    setExpandedItems((prevExpanded) => {
      const nextExpanded = new Set(prevExpanded)
      nextExpanded.add(trainer.id)
      return nextExpanded
    })
    await loadTrainerTeachingLoads(trainer.id)
    setTeachingLoadsLoading(false)
  }

  const refreshTeachingLoadCaches = useCallback(async () => {
    cacheManager.clearPattern('teaching_loads_|program_teaching_loads|trainer_teaching_loads|all_teaching_loads_combined|schedules_trainer_programs|schedules_schedule')
    await loadAllTeachingLoads()
  }, [loadAllTeachingLoads])

  useEffect(() => {
    if (!user?.id) return

    const socket = getSocket()
    if (!socket) return

    registerUser(user.user_id || user.id)

    const handleScheduleUpdate = (payload) => {
      if (!payload || !['assignment_approval_updated', 'assignment_created', 'assignment_deleted'].includes(payload.event_type)) return

      cacheManager.clearPattern('teaching_loads_')
      cacheManager.clearPattern('program_teaching_loads:')
      cacheManager.clearPattern('trainer_teaching_loads:')
      cacheManager.clearPattern('all_teaching_loads_combined')

      refreshTeachingLoadCaches()

      if (selectedProgram?.id === payload.program_id) {
        loadProgramTeachingLoads(payload.program_id)
      }

      if (selectedTrainer?.id === payload.trainer_id) {
        loadTrainerTeachingLoads(payload.trainer_id)
      }

      if (selectedLoad && String(selectedLoad.program_id) === String(payload.program_id) && String(selectedLoad.trainer_id) === String(payload.trainer_id)) {
        setSelectedLoad((current) => current ? { ...current, approval_status: payload.data?.approval_status || current.approval_status, progress_status: payload.data?.progress_status || current.progress_status } : current)
      }
    }

    socket.on('schedule_update', handleScheduleUpdate)

    return () => {
      socket.off('schedule_update', handleScheduleUpdate)
    }
  }, [loadProgramTeachingLoads, loadTrainerTeachingLoads, refreshTeachingLoadCaches, selectedLoad, selectedProgram?.id, selectedTrainer?.id, user?.id, user?.user_id])

  useEffect(() => {
    if (!user?.id) return

    const socket = getSocket()
    if (!socket) return

    const handleProgramUpdate = (payload) => {
      if (payload?.event_type !== 'program_deleted') return

      cacheManager.clearPattern('teaching_loads_programs:')
      cacheManager.clearPattern('teaching_loads_trainers:')
      cacheManager.clearPattern('programs_list:')
      cacheManager.clearPattern('program_teaching_loads:')
      cacheManager.clearPattern('trainer_teaching_loads:')
      cacheManager.clearPattern('all_teaching_loads_combined')
      refreshTeachingLoadCaches()
      loadPrograms(programPage, searchTerm)
      if (selectedLoad?.program_id === payload.program_id) {
        setSelectedLoad(null)
      }
      if (selectedProgram?.id === payload.program_id) {
        setSelectedProgram(null)
      }
      if (selectedTrainer?.id) {
        loadTrainerTeachingLoads(selectedTrainer.id)
      }
    }

    socket.on('program_update', handleProgramUpdate)

    return () => {
      socket.off('program_update', handleProgramUpdate)
    }
  }, [loadPrograms, loadTrainerTeachingLoads, programPage, refreshTeachingLoadCaches, searchTerm, selectedLoad?.program_id, selectedProgram?.id, selectedTrainer?.id, user?.id, user?.user_id])

  const handleDeleteTeachingLoad = useCallback(async (load) => {
    if (!load) return

    setIsDeleting(true)
    try {
      const response = await fetch(`${API_BASE}/api/trainers/${load.trainer_id}/programs/${load.program_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Failed to delete teaching load')
      }

      setDeleteTarget(null)
      if (selectedLoad?.id === load.id) {
        setSelectedLoad(null)
      }

      await refreshTeachingLoadCaches()

      if (selectedProgram?.id === load.program_id) {
        await loadProgramTeachingLoads(load.program_id)
      }

      if (selectedTrainer?.id === load.trainer_id) {
        await loadTrainerTeachingLoads(load.trainer_id)
      }
    } catch (error) {
      console.error('Failed to delete teaching load:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [loadProgramTeachingLoads, loadTrainerTeachingLoads, refreshTeachingLoadCaches, selectedLoad, selectedProgram?.id, selectedTrainer?.id])

  // Filter data based on search term
  const filteredPrograms = useMemo(() => {
    const nextPrograms = !searchTerm
      ? programs
      : programs.filter((program) =>
          (program.name && program.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (program.type && program.type.toLowerCase().includes(searchTerm.toLowerCase()))
        )

    return [...nextPrograms].sort((left, right) => getProgramDisplayName(left).localeCompare(getProgramDisplayName(right)))
  }, [programs, searchTerm])

  const filteredTrainers = useMemo(() => {
    const nextTrainers = !searchTerm
      ? trainers
      : trainers.filter((trainer) => {
          const displayName = getTrainerDisplayName(trainer).toLowerCase()
          return displayName.includes(searchTerm.toLowerCase()) || (trainer.email && trainer.email.toLowerCase().includes(searchTerm.toLowerCase()))
        })

    return [...nextTrainers].sort((left, right) => getTrainerDisplayName(left).localeCompare(getTrainerDisplayName(right)))
  }, [trainers, searchTerm])

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-800 to-blue-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC - NCR</p>
        <h1 className="mt-4 text-4xl font-black">Teaching Loads</h1>
        <p className="mt-3 max-w-2xl text-cyan-50/90">
          View and manage approved teaching loads across all programs and trainers.
        </p>
      </section>

      {/* Controls */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('programs')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                viewMode === 'programs'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BookOpen className="mr-2 h-4 w-4 inline" />
              Programs
            </button>
            <button
              type="button"
              onClick={() => setViewMode('trainers')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                viewMode === 'trainers'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="mr-2 h-4 w-4 inline" />
              Trainers
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${viewMode === 'programs' ? 'programs' : 'trainers'}...`}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 lg:w-80"
            />
          </div>
        </div>

      </section>

      {/* Content */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
            Loading teaching loads...
          </div>
        ) : viewMode === 'programs' ? (
          <ProgramsView
            programs={filteredPrograms}
            selectedProgram={selectedProgram}
            teachingLoads={teachingLoads}
            allTeachingLoads={allTeachingLoads}
            teachingLoadsLoading={teachingLoadsLoading}
            expandedItems={expandedItems}
            onProgramSelect={handleProgramSelect}
            onLoadSelect={setSelectedLoad}
            toggleExpanded={toggleExpanded}
            currentPage={programPage}
            totalPages={programTotalPages}
            onPageChange={handleProgramPageChange}
            progressFilter={programProgressFilter}
            setProgressFilter={setProgramProgressFilter}
            onRequestDelete={setDeleteTarget}
          />
        ) : (
          <TrainersView
            trainers={filteredTrainers}
            selectedTrainer={selectedTrainer}
            teachingLoads={teachingLoads}
            allTeachingLoads={allTeachingLoads}
            teachingLoadsLoading={teachingLoadsLoading}
            expandedItems={expandedItems}
            onTrainerSelect={handleTrainerSelect}
            onLoadSelect={setSelectedLoad}
            toggleExpanded={toggleExpanded}
            currentPage={trainerPage}
            totalPages={trainerTotalPages}
            onPageChange={handleTrainerPageChange}
            progressFilter={trainerProgressFilter}
            setProgressFilter={setTrainerProgressFilter}
            onRequestDelete={setDeleteTarget}
          />
        )}
      </section>

      {/* Calendar Modal */}
      {selectedLoad && (
        <ModalShell
          title={`${selectedLoad.program_name} - ${selectedLoad.trainer_name}`}
          onClose={() => setSelectedLoad(null)}
          maxWidth="max-w-6xl"
        >
          <ReadOnlyCalendarView teachingLoad={selectedLoad} />
        </ModalShell>
      )}

      {deleteTarget && (
        <ModalShell
          title="Delete Teaching Load"
          onClose={() => setDeleteTarget(null)}
          maxWidth="max-w-lg"
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
              <p className="font-bold">This will permanently remove the teaching load.</p>
              <p className="mt-2 text-sm">
                {deleteTarget.program_name} - {deleteTarget.trainer_name}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTeachingLoad(deleteTarget)}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Teaching Load'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// Programs View Component
function ProgramsView({
  programs,
  selectedProgram,
  teachingLoads,
  allTeachingLoads,
  teachingLoadsLoading,
  expandedItems,
  onProgramSelect,
  onLoadSelect,
  toggleExpanded,
  currentPage,
  totalPages,
  onPageChange,
  progressFilter,
  setProgressFilter,
  onRequestDelete,
}) {
  const matchesProgressFilter = (load) => progressFilter === 'all' || getProgressKey(load?.progress_status) === progressFilter

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        {['all', 'completed'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setProgressFilter(option)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              progressFilter === option
                ? 'bg-cyan-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            {option === 'all' ? 'All Loads' : 'Completed Only'}
          </button>
        ))}
      </div>
      {programs.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No programs found.
        </div>
      ) : (
        programs.map((program) => (
          <div key={program.id} className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => onProgramSelect(program)}
              className="w-full p-4 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{program.name}</h3>
                  <p className="text-sm text-slate-600">{program.type} • {program.hours || 0} hours</p>
                  <p className="text-xs text-slate-500 mt-1">COPR/ Recognition: {program.recognition_number || 'Not set'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-700">
                    {(selectedProgram?.id === program.id ? teachingLoads : allTeachingLoads).filter((load) => isSameId(load.program_id, program.id) && matchesProgressFilter(load)).length} trainers
                  </span>
                  {expandedItems.has(program.id) ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              </div>
            </button>
            
            {expandedItems.has(program.id) && selectedProgram?.id === program.id && (
              <div className="border-t border-slate-200 p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Assigned Trainers</h4>
                {teachingLoadsLoading ? (
                  <p className="text-sm text-slate-500">Loading assigned trainers...</p>
                ) : teachingLoads.length === 0 ? (
                  <p className="text-sm text-slate-500">No teaching loads assigned to this program.</p>
                ) : (
                  <div className="space-y-2">
                    {teachingLoads.filter((load) => isSameId(load.program_id, program.id) && matchesProgressFilter(load)).length === 0 ? (
                      <p className="text-sm text-slate-500">No teaching loads match this filter.</p>
                    ) : null}
                    {teachingLoads
                      .filter((load) => isSameId(load.program_id, program.id) && matchesProgressFilter(load))
                      .sort((left, right) => getTrainerDisplayName(left).localeCompare(getTrainerDisplayName(right)))
                      .map((load) => (
                        <div
                          key={load.id}
                          onClick={() => onLoadSelect(load)}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer transition hover:border-cyan-300 hover:bg-cyan-50"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{load.trainer_name}</p>
                            <p className="text-xs text-slate-600">{load.hours_per_day} hrs/day • {load.program_days} days</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${load.progress_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {load.progress_status === 'completed' ? 'Completed' : 'In Progress'}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onRequestDelete(load)
                              }}
                              className="rounded-full border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                              aria-label={`Delete teaching load for ${load.trainer_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <CalendarDays className="h-4 w-4 text-cyan-600" />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="flex items-center px-3 py-2 text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// Trainers View Component
function TrainersView({
  trainers,
  selectedTrainer,
  teachingLoads,
  allTeachingLoads,
  teachingLoadsLoading,
  expandedItems,
  onTrainerSelect,
  onLoadSelect,
  toggleExpanded,
  currentPage,
  totalPages,
  onPageChange,
  progressFilter,
  setProgressFilter,
  onRequestDelete,
}) {
  const matchesProgressFilter = (load) => progressFilter === 'all' || getProgressKey(load?.progress_status) === progressFilter

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        {['all', 'in-progress', 'completed'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setProgressFilter(option)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              progressFilter === option
                ? 'bg-cyan-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            {option === 'all' ? 'All Loads' : option === 'in-progress' ? 'In Progress' : 'Completed'}
          </button>
        ))}
      </div>
      {trainers.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No trainers found.
        </div>
      ) : (
        trainers.map((trainer) => (
          <div key={trainer.id} className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => onTrainerSelect(trainer)}
              className="w-full p-4 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{getTrainerDisplayName(trainer)}</h3>
                  <p className="text-sm text-slate-600">{trainer.email}</p>
                  <p className="text-xs text-slate-500 mt-1">TMC Level I Number: {trainer.tm_number || 'Not set'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-700">
                    {(selectedTrainer?.id === trainer.id ? teachingLoads : allTeachingLoads).filter((load) => isSameId(load.trainer_id, trainer.id) && matchesProgressFilter(load)).length} programs
                  </span>
                  {expandedItems.has(trainer.id) ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              </div>
            </button>
            
            {expandedItems.has(trainer.id) && selectedTrainer?.id === trainer.id && (
              <div className="border-t border-slate-200 p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Assigned Programs</h4>
                {teachingLoadsLoading ? (
                  <p className="text-sm text-slate-500">Loading assigned programs...</p>
                ) : teachingLoads.length === 0 ? (
                  <p className="text-sm text-slate-500">No teaching loads assigned to this trainer.</p>
                ) : (
                  <div className="space-y-2">
                    {teachingLoads.filter((load) => isSameId(load.trainer_id, trainer.id) && matchesProgressFilter(load)).length === 0 ? (
                      <p className="text-sm text-slate-500">No teaching loads match this filter.</p>
                    ) : null}
                    {teachingLoads
                      .filter((load) => isSameId(load.trainer_id, trainer.id) && matchesProgressFilter(load))
                      .sort((left, right) => getProgramDisplayName(left).localeCompare(getProgramDisplayName(right)))
                      .map((load) => (
                        <div
                          key={load.id}
                          onClick={() => onLoadSelect(load)}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer transition hover:border-cyan-300 hover:bg-cyan-50"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{load.program_name}</p>
                            <p className="text-xs text-slate-600">{load.program_type} • {load.hours_per_day} hrs/day</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${load.progress_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {load.progress_status === 'completed' ? 'Completed' : 'In Progress'}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onRequestDelete(load)
                              }}
                              className="rounded-full border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                              aria-label={`Delete teaching load for ${load.program_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <CalendarDays className="h-4 w-4 text-cyan-600" />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="flex items-center px-3 py-2 text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// Read-Only Calendar View Component
function ReadOnlyCalendarView({ teachingLoad }) {
  const [scheduleDays, setScheduleDays] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/schedules/trainer/${teachingLoad.trainer_id}/program/${teachingLoad.program_id}/schedule`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        const data = await response.json()
        setScheduleDays(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Failed to load schedule:', error)
        setScheduleDays([])
      } finally {
        setLoading(false)
      }
    }
    loadSchedule()
  }, [teachingLoad])

  const STATUS_OPTIONS = [
    { key: 'complete', label: 'Complete', color: 'bg-emerald-500' },
    { key: 'absent', label: 'Absent', color: 'bg-rose-500' },
    { key: 'nat', label: 'NAT - No Action Taken', shortLabel: 'NAT', color: 'bg-slate-600' },
    { key: 'leave', label: 'On Leave', color: 'bg-sky-500' },
    { key: 'suspended', label: 'Suspended', color: 'bg-amber-500' },
    { key: 'incomplete', label: 'Incomplete', color: 'bg-orange-500' },
  ]
  const getStatusOption = (status) => STATUS_OPTIONS.find((option) => option.key === status)
  const getStatusDisplay = (status) => getStatusOption(status)?.shortLabel || status || 'open'

  // Helper function to generate calendar weeks
  const generateCalendarWeeks = (totalDays) => {
    const weeks = []
    let currentDay = 1
    
    while (currentDay <= totalDays) {
      const week = []
      
      // Add Monday to Friday (work days)
      for (let i = 0; i < 5; i++) {
        if (currentDay <= totalDays) {
          week.push({
            dayNumber: currentDay,
            dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i],
            isWeekend: false
          })
          currentDay++
        } else {
          week.push(null)
        }
      }
      
      // Add Saturday and Sunday (weekend)
      for (let i = 0; i < 2; i++) {
        week.push({
          dayNumber: null,
          dayName: ['Sat', 'Sun'][i],
          isWeekend: true
        })
      }
      
      weeks.push(week)
    }
    
    return weeks
  }

  const calendarDays = Math.max(teachingLoad.program_days || 0, scheduleDays.length)
  const dayMap = useMemo(() => Object.fromEntries(scheduleDays.map((day) => [day.day_number, day])), [scheduleDays])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
        Loading calendar...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-cyan-600" />
        <div>
          <h3 className="text-xl font-bold text-slate-900">{teachingLoad.program_name}</h3>
          <p className="text-sm text-slate-600">{teachingLoad.program_type} • {teachingLoad.hours_per_day} hrs/day</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Calendar Header */}
          <div className="grid grid-cols-7 gap-1 mb-2 border-b border-slate-200 pb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{day}</p>
              </div>
            ))}
          </div>
          
          {/* Calendar Weeks */}
          <div className="space-y-1">
            {generateCalendarWeeks(calendarDays).map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((day, dayIndex) => {
                  if (day === null) {
                    return (
                      <div key={`empty-${dayIndex}`} className="aspect-square" />
                    )
                  }
                  
                  if (day.isWeekend) {
                    return (
                      <div key={`weekend-${dayIndex}`} className="aspect-square bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center">
                        <p className="text-xs font-medium text-slate-400">{day.dayName}</p>
                      </div>
                    )
                  }
                  
                  const entry = dayMap[day.dayNumber]
                  const status = entry?.status
                  const color = getStatusOption(status)?.color || 'bg-slate-300'
                  
                  return (
                    <div
                      key={day.dayNumber}
                      className="aspect-square bg-white border border-slate-200 rounded-lg p-2 text-center"
                    >
                      <p className="text-xs font-bold text-slate-700">Day {day.dayNumber}</p>
                      <div className="mt-1 flex justify-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}>
                          {status ? getStatusDisplay(status).charAt(0).toUpperCase() : day.dayNumber}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 truncate">
                        {getStatusDisplay(status)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Legend */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Status Legend</h4>
        <div className="grid gap-2 md:grid-cols-5">
          {STATUS_OPTIONS.map((option) => (
            <div key={option.key} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${option.color}`} />
              <span className="text-xs font-semibold text-slate-700">{option.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
