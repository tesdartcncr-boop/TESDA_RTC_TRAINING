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

  // Load all teaching load summary for badge counts
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
      console.error('Failed to load all teaching load:', error)
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

  // Load teaching load for a program
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
      console.error('Failed to load program teaching load:', error)
      setTeachingLoads([])
    }
  }, [])

  // Load teaching load for a trainer
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
      console.error('Failed to load trainer teaching load:', error)
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
    cacheManager.clearPattern('teaching_loads_')
    cacheManager.clearPattern('program_teaching_loads:')
    cacheManager.clearPattern('trainer_teaching_loads:')
    cacheManager.clearPattern('all_teaching_loads_combined')
    cacheManager.clearPattern('schedules_trainer_programs:')
    cacheManager.clearPattern('schedules_schedule:')
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

    const previousTeachingLoads = [...teachingLoads]
    const previousAllTeachingLoads = [...allTeachingLoads]

    setDeleteTarget(null)

    // 1. Immediately trigger transition animation
    setTeachingLoads((prev) =>
      prev.map((l) => (l.id === load.id ? { ...l, isDeleting: true } : l))
    )

    // 2. Filter out of active list after animation time (300ms)
    setTimeout(() => {
      setTeachingLoads((prev) => prev.filter((l) => l.id !== load.id))
      setAllTeachingLoads((prev) =>
        prev.filter(
          (l) =>
            !(
              isSameId(l.trainer_id, load.trainer_id) &&
              isSameId(l.program_id, load.program_id)
            )
        )
      )
    }, 300)

    try {
      const response = await fetch(`${API_BASE}/api/trainers/${load.trainer_id}/programs/${load.program_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Failed to delete teaching load')
      }

      if (selectedLoad?.id === load.id) {
        setSelectedLoad(null)
      }

      refreshTeachingLoadCaches()

      if (selectedProgram?.id === load.program_id) {
        loadProgramTeachingLoads(load.program_id)
      }

      if (selectedTrainer?.id === load.trainer_id) {
        loadTrainerTeachingLoads(load.trainer_id)
      }

      loadAllTeachingLoads()
    } catch (error) {
      console.error('Failed to delete teaching load:', error)
      // 3. Rollback on failure
      setTeachingLoads(previousTeachingLoads)
      setAllTeachingLoads(previousAllTeachingLoads)
      toast.error(error.message || 'Failed to delete teaching load')
    }
  }, [teachingLoads, allTeachingLoads, selectedLoad, selectedProgram?.id, selectedTrainer?.id, refreshTeachingLoadCaches, loadProgramTeachingLoads, loadTrainerTeachingLoads, loadAllTeachingLoads])

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
        <h1 className="mt-4 text-4xl font-black">Teaching Load</h1>
        <p className="mt-3 max-w-2xl text-cyan-50/90">
          View and manage approved teaching load across all programs and trainers.
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
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 lg:w-80"
            />
          </div>
        </div>

      </section>

      {/* Content */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
            Loading teaching load...
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
                  <p className="text-sm text-slate-500">No teaching load assigned to this program.</p>
                ) : (
                  <div className="space-y-2">
                    {teachingLoads.filter((load) => isSameId(load.program_id, program.id) && matchesProgressFilter(load)).length === 0 ? (
                      <p className="text-sm text-slate-500">No teaching load match this filter.</p>
                    ) : null}
                    {teachingLoads
                      .filter((load) => isSameId(load.program_id, program.id) && matchesProgressFilter(load))
                      .sort((left, right) => getTrainerDisplayName(left).localeCompare(getTrainerDisplayName(right)))
                      .map((load) => (
                        <div
                          key={load.id}
                          onClick={() => onLoadSelect(load)}
                          className={`flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer transition-all duration-300 transform origin-center hover:border-cyan-300 hover:bg-cyan-50 ${
                            load.isDeleting
                              ? 'opacity-0 scale-95 pointer-events-none'
                              : 'opacity-100 scale-100'
                          }`}
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
                  <p className="text-sm text-slate-500">No teaching load assigned to this trainer.</p>
                ) : (
                  <div className="space-y-2">
                    {teachingLoads.filter((load) => isSameId(load.trainer_id, trainer.id) && matchesProgressFilter(load)).length === 0 ? (
                      <p className="text-sm text-slate-500">No teaching load match this filter.</p>
                    ) : null}
                    {teachingLoads
                      .filter((load) => isSameId(load.trainer_id, trainer.id) && matchesProgressFilter(load))
                      .sort((left, right) => getProgramDisplayName(left).localeCompare(getProgramDisplayName(right)))
                      .map((load) => (
                        <div
                          key={load.id}
                          onClick={() => onLoadSelect(load)}
                          className={`flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer transition-all duration-300 transform origin-center hover:border-cyan-300 hover:bg-cyan-50 ${
                            load.isDeleting
                              ? 'opacity-0 scale-95 pointer-events-none'
                              : 'opacity-100 scale-100'
                          }`}
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

// Editable Calendar View Component
function ReadOnlyCalendarView({ teachingLoad }) {
  const [loadDetail, setLoadDetail] = useState(teachingLoad)
  const [scheduleDays, setScheduleDays] = useState([])
  const [loading, setLoading] = useState(true)

  // Edit config states
  const [isEditingConfig, setIsEditingConfig] = useState(false)
  const [editHoursPerDay, setEditHoursPerDay] = useState(teachingLoad.hours_per_day || 8)
  const [editAllowedDays, setEditAllowedDays] = useState(teachingLoad.allowed_days || [0, 1, 2, 3, 4])
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  // Confirm custom add/remove states
  const [dateToConfirmAdd, setDateToConfirmAdd] = useState(null)
  const [isAddingCustomDate, setIsAddingCustomDate] = useState(false)
  const [dateToConfirmRemove, setDateToConfirmRemove] = useState(null)
  const [isRemovingCustomDate, setIsRemovingCustomDate] = useState(false)

  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    setLoadDetail(teachingLoad)
    setEditHoursPerDay(teachingLoad.hours_per_day || 8)
    setEditAllowedDays(teachingLoad.allowed_days || [0, 1, 2, 3, 4])
  }, [teachingLoad])

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE}/api/schedules/trainer/${loadDetail.trainer_id}/program/${loadDetail.program_id}/schedule`, {
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
  }, [loadDetail.trainer_id, loadDetail.program_id])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const handleSaveConfig = async () => {
    if (editHoursPerDay < 1 || editHoursPerDay > 24) {
      setErrorMsg('Hours per day must be between 1 and 24')
      return
    }
    if (editAllowedDays.length === 0) {
      setErrorMsg('Please select at least one schedule day')
      return
    }

    try {
      setIsSavingConfig(true)
      setErrorMsg('')
      const response = await fetch(`${API_BASE}/api/schedules/trainer/${loadDetail.trainer_id}/program/${loadDetail.program_id}/schedule-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          hours_per_day: editHoursPerDay,
          allowed_days: editAllowedDays,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to update schedule config')
      }

      const updatedDetail = await response.json()
      setLoadDetail(updatedDetail)
      setIsEditingConfig(false)
      await loadSchedule()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleAddCustomDate = async () => {
    if (!dateToConfirmAdd) return

    try {
      setIsAddingCustomDate(true)
      setErrorMsg('')
      const response = await fetch(`${API_BASE}/api/schedules/trainer/${loadDetail.trainer_id}/program/${loadDetail.program_id}/custom-date`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          date: dateToConfirmAdd,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to add custom date')
      }

      const updatedDetail = await response.json()
      setLoadDetail(updatedDetail)
      setDateToConfirmAdd(null)
      await loadSchedule()
    } catch (err) {
      alert(err.message)
    } finally {
      setIsAddingCustomDate(false)
    }
  }

  const handleRemoveCustomDate = async () => {
    if (!dateToConfirmRemove) return

    try {
      setIsRemovingCustomDate(true)
      setErrorMsg('')
      const response = await fetch(`${API_BASE}/api/schedules/trainer/${loadDetail.trainer_id}/program/${loadDetail.program_id}/custom-date/${dateToConfirmRemove}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to remove custom date')
      }

      const updatedDetail = await response.json()
      setLoadDetail(updatedDetail)
      setDateToConfirmRemove(null)
      await loadSchedule()
    } catch (err) {
      alert(err.message)
    } finally {
      setIsRemovingCustomDate(false)
    }
  }

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

  const generateCalendarWeeks = () => {
    if (scheduleDays.length === 0) return []

    // Sort entries by schedule_date
    const sortedEntries = [...scheduleDays].sort((a, b) => {
      const dateA = new Date(`${String(a.schedule_date).split('T')[0]}T00:00:00`).getTime()
      const dateB = new Date(`${String(b.schedule_date).split('T')[0]}T00:00:00`).getTime()
      return dateA - dateB
    })

    const firstDatePart = String(sortedEntries[0].schedule_date).split('T')[0]
    const firstDate = new Date(`${firstDatePart}T00:00:00`)
    const dayOfWeek = firstDate.getDay() // 0 = Sun, 1 = Mon, ...
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const startOfWeek = new Date(firstDate)
    startOfWeek.setDate(firstDate.getDate() - daysToMonday)

    const lastDatePart = String(sortedEntries[sortedEntries.length - 1].schedule_date).split('T')[0]
    const lastDate = new Date(`${lastDatePart}T00:00:00`)
    const lastDayOfWeek = lastDate.getDay()
    const daysToSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek
    const endOfWeek = new Date(lastDate)
    endOfWeek.setDate(lastDate.getDate() + daysToSunday)

    const weeks = []
    let current = new Date(startOfWeek)

    const dateToEntryMap = {}
    for (const entry of scheduleDays) {
      if (entry.schedule_date) {
        const dateStr = String(entry.schedule_date).split('T')[0]
        dateToEntryMap[dateStr] = entry
      }
    }

    while (current <= endOfWeek) {
      const week = []
      for (let i = 0; i < 7; i++) {
        const dateStr = current.toISOString().split('T')[0]
        const entry = dateToEntryMap[dateStr]

        week.push({
          date: new Date(current),
          dateStr: dateStr,
          entry: entry || null,
          dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
          isWeekend: i === 5 || i === 6,
        })

        current.setDate(current.getDate() + 1)
      }
      weeks.push(week)
    }

    return weeks
  }

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
          <h3 className="text-xl font-bold text-slate-900">{loadDetail.program_name}</h3>
          <p className="text-sm text-slate-600">{loadDetail.program_type} • {loadDetail.hours_per_day} hrs/day</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditHoursPerDay(loadDetail.hours_per_day || 8)
            setEditAllowedDays(loadDetail.allowed_days || [0, 1, 2, 3, 4])
            setErrorMsg('')
            setIsEditingConfig(true)
          }}
          className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
        >
          Edit Schedule Settings
        </button>
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
            {generateCalendarWeeks().map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="grid grid-cols-7 gap-1">
                {week.map((cell) => {
                  const formattedDate = new Date(`${cell.dateStr}T00:00:00`).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })

                  if (cell.entry === null) {
                    const shortDate = new Date(`${cell.dateStr}T00:00:00`).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })
                    return (
                      <button 
                        type="button"
                        key={cell.dateStr} 
                        onClick={() => setDateToConfirmAdd(cell.dateStr)}
                        className="aspect-square rounded-lg border border-slate-100 p-2 text-center flex flex-col justify-between bg-slate-50/50 hover:bg-cyan-50/40 hover:border-cyan-200 transition-all cursor-pointer w-full text-left"
                      >
                        <div className="opacity-40">
                          <p className="text-[10px] font-bold text-slate-400">{cell.dayName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{shortDate}</p>
                        </div>
                        <div className="flex justify-center my-1 opacity-20">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-slate-400 bg-slate-200">
                            +
                          </span>
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 opacity-40">
                          Off Day
                        </p>
                      </button>
                    )
                  }
                  
                  const entry = cell.entry
                  const status = entry?.status
                  const color = getStatusOption(status)?.color || 'bg-slate-300'
                  const isCustom = entry?.is_custom === true
                  
                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => {
                        if (isCustom) {
                          setDateToConfirmRemove(cell.dateStr)
                        }
                      }}
                      className={`aspect-square bg-white border rounded-lg p-2 text-center flex flex-col justify-between transition-all ${
                        isCustom 
                          ? 'border-cyan-300 shadow-sm cursor-pointer hover:bg-rose-50 hover:border-rose-300' 
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start text-left">
                        <div>
                          <p className="text-[10px] font-bold text-slate-700">Day {entry.day_number}</p>
                          <p className="text-[9px] text-slate-500 font-medium">{formattedDate}</p>
                        </div>
                        {isCustom && (
                          <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-cyan-700 leading-none">
                            Remedial
                          </span>
                        )}
                      </div>
                      <div className="flex justify-center my-1">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}>
                          {status ? getStatusDisplay(status).charAt(0).toUpperCase() : entry.day_number}
                        </span>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 truncate">
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

      {/* Edit Config Modal */}
      {isEditingConfig && (
        <ModalShell
          title="Edit Schedule Settings"
          onClose={() => setIsEditingConfig(false)}
          maxWidth="max-w-xl"
        >
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700">Hours per Day</label>
              <input
                type="number"
                min="1"
                max="24"
                value={editHoursPerDay}
                onChange={(e) => setEditHoursPerDay(parseInt(e.target.value) || 8)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Schedule Work Days</label>
              <div className="flex flex-wrap gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, idx) => {
                  const isActive = editAllowedDays.includes(idx)
                  return (
                    <button
                      key={dayName}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          setEditAllowedDays(editAllowedDays.filter((d) => d !== idx))
                        } else {
                          setEditAllowedDays([...editAllowedDays, idx])
                        }
                      }}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {dayName}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-xs space-y-1">
              <p className="font-bold">⚠️ Warning</p>
              <p>
                Changing schedule days or hours per day will recalculate all class dates. 
                Any previously marked days may be shifted, unmarked, or removed depending on the new schedule structure.
              </p>
            </div>

            {errorMsg && (
              <p className="text-sm font-semibold text-rose-600">{errorMsg}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditingConfig(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                disabled={isSavingConfig}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition"
                disabled={isSavingConfig}
              >
                {isSavingConfig ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Add Custom Date Modal */}
      {dateToConfirmAdd && (
        <ModalShell
          title="Schedule Remedial/Meeting Class"
          onClose={() => setDateToConfirmAdd(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Do you want to add a remedial/meeting class on <strong className="text-slate-900">{new Date(`${dateToConfirmAdd}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Note: This remedial class will count towards the program hours, so the last class day of the regular schedule will be removed to keep the total hours from exceeding the program limit.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDateToConfirmAdd(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                disabled={isAddingCustomDate}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomDate}
                className="rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition"
                disabled={isAddingCustomDate}
              >
                {isAddingCustomDate ? 'Adding...' : 'Add Class'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Remove Custom Date Modal */}
      {dateToConfirmRemove && (
        <ModalShell
          title="Remove Remedial/Meeting Class"
          onClose={() => setDateToConfirmRemove(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to remove the remedial/meeting class scheduled on <strong className="text-slate-900">{new Date(`${dateToConfirmRemove}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>?
            </p>
            <p className="text-xs text-slate-500">
              Removing this date will shift the remaining schedule classes back to regular weekdays.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDateToConfirmRemove(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                disabled={isRemovingCustomDate}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveCustomDate}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition"
                disabled={isRemovingCustomDate}
              >
                {isRemovingCustomDate ? 'Removing...' : 'Remove Class'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
