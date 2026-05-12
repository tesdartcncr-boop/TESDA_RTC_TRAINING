import React, { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { Briefcase, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = 'http://localhost:5000'
const PROGRAM_TYPES = [
  'Institution-Based',
  'Community-Based',
  'Microcredential',
]

const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')
const fieldClassName = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder:text-slate-500 caret-slate-900 outline-none shadow-sm transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'

export default function Programs() {
  const location = useLocation()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProgram, setEditingProgram] = useState(null)

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

  const loadPrograms = async () => {
    setLoading(true)
    try {
      const cacheKey = cacheManager.generateKey('programs_list', { search: searchTerm || null })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setPrograms(cached)
        setLoading(false)
        return
      }

      const response = await fetch(`${API_BASE}/api/programs/?skip=0&limit=100&search=${encodeURIComponent(searchTerm)}`, {
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
  }

  useEffect(() => {
    loadPrograms()
  }, [searchTerm])

  useEffect(() => {
    if (location.state?.openCreateModal) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const filteredPrograms = useMemo(() => {
    if (!searchTerm.trim()) return programs
    const query = searchTerm.toLowerCase()
    return programs.filter((program) =>
      [program.name, program.description, program.validity, program.type]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [programs, searchTerm])

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
      loadPrograms()
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
      loadPrograms()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleDelete = async (programId) => {
    if (!globalThis.confirm('Deactivate this program?')) return
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
      loadPrograms()
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Programs</h1>
          <p className="mt-2 text-sm text-slate-600">Manage the qualification catalog used for trainer profiles and teaching loads.</p>
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
            placeholder="Search program name, type, or validity..."
            className={`${fieldClassName} pl-12`}
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center text-slate-500">Loading programs...</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {filteredPrograms.map((program) => (
            <div key={program.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
                <p><span className="font-semibold text-slate-800">Recognition Number:</span> {program.recognition_number || 'Not set'}</p>
                <p><span className="font-semibold text-slate-800">Validity:</span> {program.validity || 'Not set'}</p>
                <p><span className="font-semibold text-slate-800">Hours:</span> {program.hours || 0}</p>
                <p><span className="font-semibold text-slate-800">Weekday Days:</span> {program.days || 0}</p>
                <p>{program.description || 'No description provided.'}</p>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => handleOpenEdit(program)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(program.id)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">
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
      )}

      {showCreateModal && (
        <ModalShell title="Create Program" onClose={() => setShowCreateModal(false)} maxWidth="max-w-2xl">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={createForm.handleSubmit(handleCreate)}>
            <div className="md:col-span-2">
              <label htmlFor="program_name" className="block text-sm font-semibold text-slate-700">Program Name</label>
              <input id="program_name" {...createForm.register('name', { required: 'Program name is required' })} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="program_recognition_number" className="block text-sm font-semibold text-slate-700">Recognition Number</label>
              <input id="program_recognition_number" {...createForm.register('recognition_number')} placeholder="Enter recognition number" className={`${fieldClassName} mt-2`} />
            </div>
            <div>
              <label htmlFor="program_type" className="block text-sm font-semibold text-slate-700">Program Type</label>
              <select id="program_type" {...createForm.register('type')} className={`${fieldClassName} mt-2`}>
                {PROGRAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="program_validity" className="block text-sm font-semibold text-slate-700">Validity</label>
              <input id="program_validity" {...createForm.register('validity')} placeholder="e.g. 3 years" className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="program_hours" className="block text-sm font-semibold text-slate-700">Number of Hours</label>
              <input id="program_hours" type="number" {...createForm.register('hours')} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="program_description" className="block text-sm font-semibold text-slate-700">Description</label>
              <textarea id="program_description" rows={4} {...createForm.register('description')} className={`${fieldClassName} mt-2`} />
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
              <label htmlFor="edit_program_recognition_number" className="block text-sm font-semibold text-slate-700">Recognition Number</label>
              <input id="edit_program_recognition_number" {...editForm.register('recognition_number')} placeholder="Enter recognition number" className={`${fieldClassName} mt-2`} />
            </div>
            <div>
              <label htmlFor="edit_program_type" className="block text-sm font-semibold text-slate-700">Program Type</label>
              <select id="edit_program_type" {...editForm.register('type')} className={`${fieldClassName} mt-2`}>
                {PROGRAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit_program_validity" className="block text-sm font-semibold text-slate-700">Validity</label>
              <input id="edit_program_validity" {...editForm.register('validity')} className={`${fieldClassName} mt-2`} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="edit_program_hours" className="block text-sm font-semibold text-slate-700">Number of Hours</label>
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
    </div>
  )
}
