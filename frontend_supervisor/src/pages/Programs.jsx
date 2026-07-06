import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { Briefcase, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket } from '../utils/socket'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const PROGRAM_TYPES = [
  'Institution-Based',
  'Community-Based',
  'Microcredential',
]

const buildDefaultProgramTypes = () => PROGRAM_TYPES.map((name, index) => ({ id: index + 1, name }))

const normalizeProgramTypes = (data) => {
  if (!Array.isArray(data)) {
    return []
  }

  return data
    .map((programType, index) => {
      if (typeof programType === 'string') {
        return { id: index + 1, name: programType }
      }

      if (!programType || typeof programType !== 'object') {
        return null
      }

      if (!programType.name) {
        return null
      }

      return {
        ...programType,
        id: programType.id ?? index + 1,
        name: programType.name,
      }
    })
    .filter(Boolean)
}

const getToken = () => localStorage.getItem('supervisor_token') || sessionStorage.getItem('supervisor_session_token')
const fieldClassName = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-black placeholder:text-slate-500 caret-slate-900 outline-none shadow-sm transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const formatDateOnly = (value) => (value ? String(value).split('T')[0] : 'Not set')

export default function Programs() {
  const location = useLocation()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [programTypes, setProgramTypes] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProgram, setEditingProgram] = useState(null)
  const [programToDelete, setProgramToDelete] = useState(null)


  const createForm = useForm({
    defaultValues: {
      name: '',
      type: 'Institution-Based',
      validity: '',
      hours: '',
      description: '',
      recognition_number: '',
    },
  })
  const editForm = useForm()

  const loadPrograms = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    try {
      const cacheKey = cacheManager.generateKey('programs_list', { version: 'local-search-v1' })
      const cached = forceRefresh ? null : cacheManager.get(cacheKey)
      if (cached !== null) {
        setPrograms(cached)
      }

      const response = await fetch(`${API_BASE}/api/programs/?skip=0&limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextPrograms = data.data || []
      setPrograms(nextPrograms)
      cacheManager.set(cacheKey, nextPrograms)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load programs')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProgramTypes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/programs/types`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Failed to load program types')
      }

      const data = await response.json()
      const nextTypes = normalizeProgramTypes(data)
      setProgramTypes(nextTypes.length > 0 ? nextTypes : buildDefaultProgramTypes())
    } catch (error) {
      console.error(error)
      setProgramTypes((currentTypes) => (currentTypes.length > 0 ? currentTypes : buildDefaultProgramTypes()))
    }
  }

  useEffect(() => {
    loadPrograms(false)
  }, [loadPrograms])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const handleProgramUpdate = () => {
      cacheManager.clearPattern('programs_list:')
      cacheManager.clearPattern('programs:')
      loadPrograms(true)
    }

    socket.on('program_update', handleProgramUpdate)

    return () => {
      socket.off('program_update', handleProgramUpdate)
    }
  }, [loadPrograms])

  useEffect(() => {
    loadProgramTypes()
  }, [])

  useEffect(() => {
    if (location.state?.openCreateModal) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const filteredPrograms = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    let nextPrograms = programs

    if (query) {
      nextPrograms = programs.filter((program) => {
        const fields = [program.name, program.description, program.validity, program.type, program.recognition_number]
        return fields.filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
      })
    }

    return [...nextPrograms].sort((left, right) => (left.name || '').localeCompare(right.name || ''))
  }, [programs, searchTerm])

  const availableProgramTypes = programTypes.length > 0 ? programTypes : buildDefaultProgramTypes()

  const handleCreate = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/api/programs/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: values.name,
          type: values.type,
          validity: values.validity || null,
          hours: values.hours ? Number.parseInt(values.hours, 10) : null,
          description: values.description || null,
          recognition_number: values.recognition_number || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create program')
      }

      toast.success('Program created successfully')
      cacheManager.clearPattern('programs_list:')
      cacheManager.clearPattern('programs:')
      cacheManager.clearPattern('stats_')
      createForm.reset()
      setShowCreateModal(false)
      loadPrograms(true)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleOpenEdit = (program) => {
    setEditingProgram(program)
    editForm.reset({
      name: program.name,
      type: program.type,
      validity: program.validity || '',
      hours: program.hours || '',
      description: program.description || '',
      recognition_number: program.recognition_number || '',
    })
  }

  const handleUpdate = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/api/programs/${editingProgram.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: values.name,
          type: values.type,
          validity: values.validity || null,
          hours: values.hours ? Number.parseInt(values.hours, 10) : null,
          description: values.description || null,
          recognition_number: values.recognition_number || null,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update program')
      }
      toast.success('Program updated successfully')
      cacheManager.clearPattern('programs_list:')
      cacheManager.clearPattern('programs:')
      cacheManager.clearPattern('stats_')
      setEditingProgram(null)
      loadPrograms(true)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleDelete = async (programId) => {
    setProgramToDelete(null)
    const previousPrograms = [...programs]

    // 1. Immediately trigger transition animation
    setPrograms((prev) =>
      prev.map((p) => (p.id === programId ? { ...p, isDeleting: true } : p))
    )

    // 2. Filter out of active list after animation time (300ms)
    setTimeout(() => {
      setPrograms((prev) => prev.filter((p) => p.id !== programId))
    }, 300)

    try {
      const response = await fetch(`${API_BASE}/api/programs/${programId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to deactivate program')
      }
      toast.success('Program deactivated successfully')
      cacheManager.clearPattern('programs_list:')
      cacheManager.clearPattern('programs:')
      cacheManager.clearPattern('stats_')
      cacheManager.clearPattern('admin_history')
      loadPrograms(true)
    } catch (error) {
      // 3. Rollback on failure
      setPrograms(previousPrograms)
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Programs</h1>
          <p className="mt-2 text-sm text-slate-600">Manage the qualification catalog used for trainer profiles and teaching load.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/20"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Program
        </button>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search program name, type, or validity date..."
            className={`${fieldClassName} pl-12`}
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center text-slate-500">Loading programs...</div>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto pr-1">
          <div className="grid gap-5 xl:grid-cols-3">
          {filteredPrograms.map((program) => (
            <div
              key={program.id}
              className={`rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 transform origin-center ${
                program.isDeleting
                  ? 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                  : 'opacity-100 scale-100 translate-y-0'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Briefcase className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-slate-900">{program.name}</h3>
                  <p className="mt-2 text-sm text-slate-500">{program.type}</p>
                </div>
              </div>
              <div className="mt-5 space-y-2 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-800">COPR/ Recognition Number:</span> {program.recognition_number || 'Not set'}</p>
                <p><span className="font-semibold text-slate-800">Validity Date:</span> {formatDateOnly(program.validity)}</p>
                <p><span className="font-semibold text-slate-800">Nominal Duration:</span> {program.hours || 0}</p>
                <p><span className="font-semibold text-slate-800">Weekday Days:</span> {program.days || 0}</p>
                <p>{program.description || 'No description provided.'}</p>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => handleOpenEdit(program)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </button>
                <button type="button" onClick={() => setProgramToDelete(program)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}

            {!filteredPrograms.length && (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 xl:col-span-3">
                No programs found.
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <ModalShell title="Create Program" onClose={() => setShowCreateModal(false)} maxWidth="max-w-5xl">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={createForm.handleSubmit(handleCreate)}>
            <div className="md:col-span-2">
              <label htmlFor="program_name" className="block text-sm font-semibold text-slate-700">Program Name</label>
              <input id="program_name" {...createForm.register('name', { required: 'Program name is required' })} placeholder="e.g. Welding Basics" className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="program_recognition_number" className="block text-sm font-semibold text-slate-700">COPR/ Recognition Number</label>
              <input id="program_recognition_number" {...createForm.register('recognition_number')} placeholder="Enter COPR/ recognition number" className={`${fieldClassName} mt-2`} />
            </div>
            <div>
              <label htmlFor="program_type" className="block text-sm font-semibold text-slate-700">Program Type</label>
              <select id="program_type" {...createForm.register('type')} className={`${fieldClassName} mt-2`}>
                {availableProgramTypes.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="program_validity" className="block text-sm font-semibold text-slate-700">Validity Date</label>
              <input id="program_validity" type="date" {...createForm.register('validity')} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="program_hours" className="block text-sm font-semibold text-slate-700">Nominal Duration</label>
              <input id="program_hours" type="number" {...createForm.register('hours')} placeholder="e.g. 120" className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="program_description" className="block text-sm font-semibold text-slate-700">Description</label>
              <textarea id="program_description" rows={4} {...createForm.register('description')} placeholder="Describe the program objectives and curriculum..." className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Save Program</button>
            </div>
          </form>
        </ModalShell>
      )}

      {editingProgram && (
        <ModalShell title="Edit Program" onClose={() => setEditingProgram(null)} maxWidth="max-w-2xl">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={editForm.handleSubmit(handleUpdate)}>
            <div className="md:col-span-2">
              <label htmlFor="edit_program_name" className="block text-sm font-semibold text-slate-700">Program Name</label>
              <input id="edit_program_name" {...editForm.register('name', { required: true })} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="edit_program_recognition_number" className="block text-sm font-semibold text-slate-700">COPR/ Recognition Number</label>
              <input id="edit_program_recognition_number" {...editForm.register('recognition_number')} placeholder="Enter COPR/ recognition number" className={`${fieldClassName} mt-2`} />
            </div>
            <div>
              <label htmlFor="edit_program_type" className="block text-sm font-semibold text-slate-700">Program Type</label>
              <select id="edit_program_type" {...editForm.register('type')} className={`${fieldClassName} mt-2`}>
                {availableProgramTypes.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit_program_validity" className="block text-sm font-semibold text-slate-700">Validity Date</label>
              <input id="edit_program_validity" type="date" {...editForm.register('validity')} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="edit_program_hours" className="block text-sm font-semibold text-slate-700">Nominal Duration</label>
              <input id="edit_program_hours" type="number" {...editForm.register('hours')} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="edit_program_description" className="block text-sm font-semibold text-slate-700">Description</label>
              <textarea id="edit_program_description" rows={4} {...editForm.register('description')} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingProgram(null)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Update Program</button>
            </div>
          </form>
        </ModalShell>
      )}
      {programToDelete && (
        <ModalShell title="Confirm Delete" onClose={() => setProgramToDelete(null)} maxWidth="max-w-lg">
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Are you sure you want to deactivate the program <strong>{programToDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProgramToDelete(null)}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(programToDelete.id)}
                className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Deactivate
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
