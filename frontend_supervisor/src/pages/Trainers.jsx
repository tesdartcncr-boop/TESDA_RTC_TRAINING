import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, Pencil, Plus, Search, Trash2, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const getToken = () => localStorage.getItem('supervisor_token') || sessionStorage.getItem('supervisor_session_token')

const inputClassName = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-black placeholder:text-slate-500 caret-slate-900 outline-none shadow-sm transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const formatDateOnly = (value) => (value ? String(value).split('T')[0] : '')

const emptyTrainerValues = {
  username: '',
  email: '',
  password: '',
  trainer_name: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  extension: '',
  trainer_type: '',
  tm_number: '',
  tm_expiration: '',
  nttc_number: '',
  nttc_expiration: '',
  ctpr_recognition_number: '',
}

function QualificationSelector({ programs, selectedQualifications, setSelectedQualifications }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredPrograms = useMemo(() => {
    if (!searchTerm.trim()) return programs
    return programs.filter((program) => program.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [programs, searchTerm])

  const isSelected = (programId) => selectedQualifications.some((qualification) => qualification.program_id === programId)

  const toggleSelection = (program) => {
    if (isSelected(program.id)) {
      setSelectedQualifications((current) => current.filter((qualification) => qualification.program_id !== program.id))
      return
    }
    setSelectedQualifications((current) => [...current, { program_id: program.id, nttc_number: '', nttc_expiration: '' }])
  }

  const updateNttcNumber = (programId, value) => {
    setSelectedQualifications((current) => current.map((qualification) => (
      qualification.program_id === programId
        ? { ...qualification, nttc_number: value }
        : qualification
    )))
  }

  const updateNttcExpiration = (programId, value) => {
    setSelectedQualifications((current) => current.map((qualification) => (
      qualification.program_id === programId
        ? { ...qualification, nttc_expiration: value }
        : qualification
    )))
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div>
        <h4 className="text-lg font-bold text-slate-900">Qualifications</h4>
        <p className="text-sm text-slate-600">Choose from created program names and add the matching NTTC number and expiration date.</p>
      </div>
      <input
        type="text"
        id="qualification_search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search qualification..."
        className={inputClassName}
      />
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
        {filteredPrograms.map((program) => {
          const selected = selectedQualifications.find((qualification) => qualification.program_id === program.id)
          return (
            <div key={program.id} className="rounded-2xl border border-slate-200 p-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleSelection(program)} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                <span className="font-medium text-slate-800">{program.name}</span>
              </label>
              {selected && (
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    id={`nttc_number_${program.id}`}
                    value={selected.nttc_number || ''}
                    onChange={(event) => updateNttcNumber(program.id, event.target.value)}
                    placeholder="NTTC number"
                    className={`${inputClassName} text-sm`}
                  />
                  <div>
                    <label htmlFor={`nttc_expiration_${program.id}`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Expiration Date
                    </label>
                    <input
                      type="date"
                      id={`nttc_expiration_${program.id}`}
                      value={formatDateOnly(selected.nttc_expiration)}
                      onChange={(event) => updateNttcExpiration(program.id, event.target.value)}
                      className={inputClassName}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {!filteredPrograms.length && <p className="text-sm text-slate-500">No qualifications found.</p>}
      </div>
    </div>
  )
}

function TrainerFormFields({ form, isEdit }) {
  const mode = isEdit ? 'edit' : 'create'
  const fieldClass = `${inputClassName} mt-2`
  const requiredIfCreate = (message) => (isEdit ? {} : { required: message })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label htmlFor={`${mode}_first_name`} className="block text-sm font-semibold text-slate-700">First Name</label>
        <input id={`${mode}_first_name`} {...form.register('first_name', requiredIfCreate('First name is required'))} placeholder="e.g. Juan" className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`${mode}_middle_name`} className="block text-sm font-semibold text-slate-700">Middle Name</label>
        <input id={`${mode}_middle_name`} {...form.register('middle_name')} placeholder="e.g. Carlos" className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`${mode}_last_name`} className="block text-sm font-semibold text-slate-700">Surname</label>
        <input id={`${mode}_last_name`} {...form.register('last_name', requiredIfCreate('Surname is required'))} placeholder="e.g. Dela Cruz" className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`${mode}_extension`} className="block text-sm font-semibold text-slate-700">Extension</label>
        <input id={`${mode}_extension`} {...form.register('extension')} placeholder="e.g. Jr." className={fieldClass} />
      </div>
      {!isEdit && (
        <div>
          <label htmlFor="create_username" className="block text-sm font-semibold text-slate-700">Username</label>
          <input id="create_username" {...form.register('username', requiredIfCreate('Username is required'))} placeholder="e.g. juan_dela_cruz" className={fieldClass} />
        </div>
      )}
      <div>
        <label htmlFor={`${mode}_email`} className="block text-sm font-semibold text-slate-700">Email</label>
        <input id={`${mode}_email`} type="email" {...form.register('email', requiredIfCreate('Email is required'))} placeholder="e.g. juan@rtc.local" className={fieldClass} />
      </div>
      {!isEdit && (
        <div>
          <label htmlFor="create_password" className="block text-sm font-semibold text-slate-700">Password</label>
          <input id="create_password" type="password" {...form.register('password', requiredIfCreate('Password is required'))} placeholder="Min 8 characters" className={fieldClass} />
        </div>
      )}
      <div>
        <label htmlFor={`${mode}_trainer_name`} className="block text-sm font-semibold text-slate-700">Trainer Name</label>
        <input id={`${mode}_trainer_name`} {...form.register('trainer_name')} placeholder="Optional display name" className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`${mode}_trainer_type`} className="block text-sm font-semibold text-slate-700">Trainer Type</label>
        <select id={`${mode}_trainer_type`} {...form.register('trainer_type')} className={fieldClass}>
          <option value="">Select trainer type</option>
          <option value="Permanent">Permanent</option>
          <option value="JO/Oncall">JO/Oncall</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${mode}_tm_number`} className="block text-sm font-semibold text-slate-700">TMC Level I Number</label>
        <input id={`${mode}_tm_number`} {...form.register('tm_number')} placeholder="e.g. TMC123456" className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`${mode}_tm_expiration`} className="block text-sm font-semibold text-slate-700">TMC Level I Expiration</label>
        <input id={`${mode}_tm_expiration`} type="date" {...form.register('tm_expiration')} className={fieldClass} />
      </div>
    </div>
  )
}

TrainerFormFields.propTypes = {
  form: PropTypes.shape({
    register: PropTypes.func.isRequired,
  }).isRequired,
  isEdit: PropTypes.bool,
}

TrainerFormFields.defaultProps = {
  isEdit: false,
}

export default function Trainers() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [trainers, setTrainers] = useState([])
  const [programs, setPrograms] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTrainer, setEditingTrainer] = useState(null)
  const [createQualifications, setCreateQualifications] = useState([])
  const [editQualifications, setEditQualifications] = useState([])

  const createForm = useForm({ defaultValues: emptyTrainerValues })
  const editForm = useForm({ defaultValues: emptyTrainerValues })

  const invalidateTrainerCaches = () => {
    cacheManager.clearPattern('trainers_list:')
    cacheManager.clearPattern('trainer_qualifications:')
    cacheManager.clearPattern('stats_')
    cacheManager.clearPattern('admin_history')
  }

  const loadTrainers = useCallback(async () => {
    setLoading(true)
    try {
      const cacheKey = cacheManager.generateKey('trainers_list', { search: searchTerm || null })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setTrainers(cached)
        setLoading(false)
        return
      }

      const response = await fetch(`${API_BASE}/api/trainers/?skip=0&limit=100&search=${encodeURIComponent(searchTerm)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextTrainers = data.data || []
      setTrainers(nextTrainers)
      cacheManager.set(cacheKey, nextTrainers)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load trainers')
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  const loadPrograms = useCallback(async () => {
    try {
      const cacheKey = cacheManager.generateKey('programs_list', { search: null })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setPrograms(cached)
        return
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
    }
  }, [])

  const loadQualifications = async (trainerId) => {
    const cacheKey = cacheManager.generateKey('trainer_qualifications', { trainer_id: trainerId })
    const cached = cacheManager.get(cacheKey)
    if (cached !== null) {
      return cached
    }

    const response = await fetch(`${API_BASE}/api/trainers/${trainerId}/qualifications`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await response.json()
    const qualifications = (data.data || []).map((qualification) => ({
      program_id: qualification.program_id,
      nttc_number: qualification.nttc_number || '',
      nttc_expiration: qualification.nttc_expiration ? formatDateOnly(qualification.nttc_expiration) : '',
    }))
    cacheManager.set(cacheKey, qualifications)
    return qualifications
  }

  useEffect(() => {
    loadTrainers()
  }, [loadTrainers])

  useEffect(() => {
    loadPrograms()
  }, [loadPrograms])

  useEffect(() => {
    if (!user?.id) return undefined

    const socket = getSocket()
    if (!socket) return undefined

    registerUser(user.user_id || user.id)

    const handleTrainerUpdate = () => {
      invalidateTrainerCaches()
      loadTrainers()
    }

    const handleProgramUpdate = () => {
      cacheManager.clearPattern('programs_list:')
      cacheManager.clearPattern('trainer_qualifications:')
      loadPrograms()
    }

    socket.on('trainer_update', handleTrainerUpdate)
    socket.on('program_update', handleProgramUpdate)

    return () => {
      socket.off('trainer_update', handleTrainerUpdate)
      socket.off('program_update', handleProgramUpdate)
    }
  }, [loadPrograms, loadTrainers, user?.id, user?.user_id])

  useEffect(() => {
    if (location.state?.openCreateModal) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const filteredTrainers = useMemo(() => {
    if (!searchTerm.trim()) return trainers
    const query = searchTerm.toLowerCase()
    return trainers.filter((trainer) =>
      [trainer.trainer_name, trainer.first_name, trainer.last_name, trainer.username, trainer.email]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [trainers, searchTerm])

  const handleCreate = async (values) => {
    try {
      const payload = {
        ...values,
        tm_expiration: values.tm_expiration || null,
        nttc_expiration: values.nttc_expiration || null,
        qualifications: createQualifications,
      }
      const response = await fetch(`${API_BASE}/api/trainers/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create trainer')
      }
      toast.success('Trainer created successfully')
      invalidateTrainerCaches()
      createForm.reset(emptyTrainerValues)
      setCreateQualifications([])
      setShowCreateModal(false)
      loadTrainers()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const syncQualifications = async (trainerId, desiredQualifications) => {
    const currentQualifications = await loadQualifications(trainerId)
    const currentIds = currentQualifications.map((qualification) => qualification.program_id)
    const desiredIds = new Set(desiredQualifications.map((qualification) => qualification.program_id))

    const toAddOrUpdate = desiredQualifications
    const toRemove = currentIds.filter((programId) => !desiredIds.has(programId))

    const changedQualifications = toAddOrUpdate.filter((qualification) => {
      const current = currentQualifications.find((item) => item.program_id === qualification.program_id)
      return !current || current.nttc_number !== qualification.nttc_number || current.nttc_expiration !== qualification.nttc_expiration
    })

    for (const qualification of changedQualifications) {
      await fetch(`${API_BASE}/api/trainers/${trainerId}/qualifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(qualification),
      })
    }

    for (const programId of toRemove) {
      await fetch(`${API_BASE}/api/trainers/${trainerId}/qualifications/${programId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
    }

    cacheManager.clearPattern('trainer_qualifications:')
  }

  const handleOpenEdit = async (trainer) => {
    setEditingTrainer(trainer)
    editForm.reset({
      ...emptyTrainerValues,
      email: trainer.email || '',
      trainer_name: trainer.trainer_name || '',
      first_name: trainer.first_name || '',
      middle_name: trainer.middle_name || '',
      last_name: trainer.last_name || '',
      extension: trainer.extension || '',
      trainer_type: trainer.trainer_type || '',
      tm_number: trainer.tm_number || '',
      tm_expiration: trainer.tm_expiration ? trainer.tm_expiration.split('T')[0] : '',
      nttc_number: trainer.nttc_number || '',
      nttc_expiration: trainer.nttc_expiration ? trainer.nttc_expiration.split('T')[0] : '',
      ctpr_recognition_number: trainer.ctpr_recognition_number || '',
    })
    setEditQualifications(await loadQualifications(trainer.id))
  }

  const handleUpdate = async (values) => {
    try {
      const payload = Object.entries({
        email: values.email,
        trainer_name: values.trainer_name,
        first_name: values.first_name,
        middle_name: values.middle_name,
        last_name: values.last_name,
        extension: values.extension,
        trainer_type: values.trainer_type,
        tm_number: values.tm_number,
        tm_expiration: values.tm_expiration,
        nttc_number: values.nttc_number,
        nttc_expiration: values.nttc_expiration,
        ctpr_recognition_number: values.ctpr_recognition_number,
      }).reduce((acc, [key, value]) => {
        if (value === undefined || value === null) {
          return acc
        }
        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (!trimmed) {
            return acc
          }
          acc[key] = trimmed
          return acc
        }
        acc[key] = value
        return acc
      }, {})

      const response = await fetch(`${API_BASE}/api/trainers/${editingTrainer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update trainer')
      }

      await syncQualifications(editingTrainer.id, editQualifications)
      toast.success('Trainer updated successfully')
      invalidateTrainerCaches()
      setEditingTrainer(null)
      loadTrainers()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleDelete = async (trainerId) => {
    if (!globalThis.confirm('Delete this trainer account?')) return
    const previousTrainers = [...trainers]

    // 1. Immediately trigger transition animation
    setTrainers((prev) =>
      prev.map((t) => (t.id === trainerId ? { ...t, isDeleting: true } : t))
    )

    // 2. Filter out of active list after animation time (300ms)
    setTimeout(() => {
      setTrainers((prev) => prev.filter((t) => t.id !== trainerId))
    }, 300)

    try {
      const response = await fetch(`${API_BASE}/api/trainers/${trainerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to delete trainer')
      }
      toast.success('Trainer deleted successfully')
      invalidateTrainerCaches()
      loadTrainers()
    } catch (error) {
      // 3. Rollback on failure
      setTrainers(previousTrainers)
      toast.error(error.message)
    }
  }

  const renderTrainerForm = (form, qualifications, setQualifications, isEdit = false) => (
    <form className="space-y-6" onSubmit={form.handleSubmit(isEdit ? handleUpdate : handleCreate)}>
      <TrainerFormFields form={form} isEdit={isEdit} />

      <QualificationSelector
        programs={programs}
        selectedQualifications={qualifications}
        setSelectedQualifications={setQualifications}
      />

      <div className="flex justify-end gap-3">
        <button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">
          {isEdit ? 'Update Trainer' : 'Create Trainer'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Trainer</h1>
          <p className="mt-2 text-sm text-slate-600">Create trainer accounts, assign qualifications, and update profile details except username and password.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/20"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Trainer
        </button>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search trainer name, username, or email..."
            className={`${inputClassName} pl-12`}
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center text-slate-500">Loading trainers...</div>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto pr-1">
          <div className="grid gap-5 xl:grid-cols-2">
          {filteredTrainers.map((trainer) => (
            <div
              key={trainer.id}
              className={`rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 transform origin-center ${
                trainer.isDeleting
                  ? 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                  : 'opacity-100 scale-100 translate-y-0'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <User className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{trainer.trainer_name || `${trainer.first_name || ''} ${trainer.last_name || ''}`.trim() || trainer.username}</h3>
                    <p className="text-sm text-slate-500">@{trainer.username}</p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <Mail className="h-4 w-4" />
                      <span>{trainer.email || 'No email'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <p><span className="font-semibold text-slate-800">Type:</span> {trainer.trainer_type || 'Not set'}</p>
                <p><span className="font-semibold text-slate-800">TMC Level I Number:</span> {trainer.tm_number || 'Not set'}</p>
                <p><span className="font-semibold text-slate-800">TMC Level I Expiration:</span> {trainer.tm_expiration ? trainer.tm_expiration.split('T')[0] : 'Not set'}</p>
                <p><span className="font-semibold text-slate-800">Created:</span> {trainer.created_at?.split('T')[0]}</p>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => handleOpenEdit(trainer)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(trainer.id)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}

            {!filteredTrainers.length && (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 xl:col-span-2">
                No trainers found.
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <ModalShell
          title="Create Trainer"
          onClose={() => {
            setShowCreateModal(false)
            createForm.reset(emptyTrainerValues)
            setCreateQualifications([])
          }}
          maxWidth="max-w-5xl"
        >
          {renderTrainerForm(createForm, createQualifications, setCreateQualifications)}
        </ModalShell>
      )}

      {editingTrainer && (
        <ModalShell title="Edit Trainer" onClose={() => setEditingTrainer(null)} maxWidth="max-w-5xl">
          {renderTrainerForm(editForm, editQualifications, setEditQualifications, true)}
        </ModalShell>
      )}
    </div>
  )
}

QualificationSelector.propTypes = {
  programs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  selectedQualifications: PropTypes.arrayOf(PropTypes.shape({
    program_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    nttc_number: PropTypes.string,
    nttc_expiration: PropTypes.string,
  })).isRequired,
  setSelectedQualifications: PropTypes.func.isRequired,
}
