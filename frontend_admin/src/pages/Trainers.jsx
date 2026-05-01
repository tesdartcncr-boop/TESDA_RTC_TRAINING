import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { Users, UserPlus, Search, Edit, Trash2, Download, Award, BookOpen, Plus, Loader, AlertCircle, X } from 'lucide-react'
import { cacheManager } from '../utils/cacheManager'
import { getSocket } from '../utils/socket'

const Trainers = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [trainers, setTrainers] = useState([])
  const [filteredTrainers, setFilteredTrainers] = useState([])
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showQuickAssignModal, setShowQuickAssignModal] = useState(false)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [quickAssignTarget, setQuickAssignTarget] = useState(null)
  const [quickAssignSearchTerm, setQuickAssignSearchTerm] = useState('')
  const [quickAssignAssignedPrograms, setQuickAssignAssignedPrograms] = useState([])
  const [quickAssignSelectedPrograms, setQuickAssignSelectedPrograms] = useState([])
  const [selectedEditPrograms, setSelectedEditPrograms] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [skip, setSkip] = useState(0)
  const [limit] = useState(12)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const observerTarget = useRef(null)
  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm()

  useEffect(() => { if (successMessage) { const t = setTimeout(() => setSuccessMessage(null), 3000); return () => clearTimeout(t) } }, [successMessage])

  const fetchPrograms = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:5000/api/programs/?skip=0&limit=100', { headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` } })
      if (res.ok) { const data = await res.json(); setPrograms(data.data || []) }
    } catch (e) { console.error(e) }
  }, [])

  const fetchTrainerPrograms = useCallback(async (trainerId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/trainers/${trainerId}/programs`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` } })
      if (res.ok) { const data = await res.json(); return data.data || [] }
      return []
    } catch (e) { console.error(e); return [] }
  }, [])

  const fetchTrainers = useCallback(async (currentSkip = 0, append = false) => {
    try {
      setError(null)
      const cacheKey = cacheManager.generateKey('trainers', { skip: currentSkip, limit })
      const cached = cacheManager.get(cacheKey)
      if (cached) {
        if (append) { setTrainers(p => [...p, ...cached.data]) } else { setTrainers(cached.data); setFilteredTrainers(cached.data) }
        setHasMore(cached.has_more); setLoading(false); return
      }
      const res = await fetch(`http://localhost:5000/api/trainers/?skip=${currentSkip}&limit=${limit}&search=${searchTerm}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` } })
      if (!res.ok) throw new Error('Failed to fetch trainers')
      const data = await res.json()
      cacheManager.set(cacheKey, data)
      if (append) { setTrainers(p => [...p, ...data.data]) } else { setTrainers(data.data); setFilteredTrainers(data.data) }
      setHasMore(data.has_more)
    } catch (e) { setError(e.message) } finally { setLoading(false); setIsLoadingMore(false) }
  }, [limit, searchTerm])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    
    const handleTrainerUpdate = (data) => {
      console.log('Trainer update received:', data)
      cacheManager.clearPattern('trainers:.*')
      setSkip(0)
      fetchTrainers(0, false)
    }
    
    socket.on('trainer_update', handleTrainerUpdate)
    
    return () => {
      socket.off('trainer_update', handleTrainerUpdate)
    }
  }, [fetchTrainers])

  useEffect(() => { setSkip(0); setLoading(true); fetchTrainers(0, false); fetchPrograms() }, [searchTerm, fetchTrainers, fetchPrograms])

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
        setIsLoadingMore(true); const newSkip = skip + limit; setSkip(newSkip); fetchTrainers(newSkip, true)
      }
    }, { threshold: 0.1 })
    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => observer.disconnect()
  }, [skip, hasMore, isLoadingMore, loading, limit, fetchTrainers])

  useEffect(() => { setFilteredTrainers(trainers) }, [trainers])

  useEffect(() => {
    if (location.state?.openCreateModal) { setShowCreateModal(true); navigate(location.pathname, { replace: true, state: {} }) }
  }, [location, navigate])

  const onCreateTrainer = async (data) => {
    setIsLoading(true)
    try {
      const cleanedData = { username: data.username, password: data.password, trainer_name: data.trainer_name || null, tm_number: data.tm_number || null, tm_expiration: data.tm_expiration ? new Date(data.tm_expiration).toISOString() : null, nttc_number: data.nttc_number || null, nttc_expiration: data.nttc_expiration ? new Date(data.nttc_expiration).toISOString() : null }
      const res = await fetch('http://localhost:5000/api/trainers/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }, body: JSON.stringify(cleanedData) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed') }
      cacheManager.clearPattern('trainers:.*'); setSkip(0); await fetchTrainers(0, false); setShowCreateModal(false); reset(); setSuccessMessage('Trainer created!')
    } catch (e) { setError(e.message) } finally { setIsLoading(false) }
  }

  const onUpdateTrainer = async (data) => {
    setIsLoading(true)
    try {
      const cleanedData = { trainer_name: data.trainer_name || null, tm_number: data.tm_number || null, tm_expiration: data.tm_expiration ? new Date(data.tm_expiration).toISOString() : null, nttc_number: data.nttc_number || null, nttc_expiration: data.nttc_expiration ? new Date(data.nttc_expiration).toISOString() : null }
      const res = await fetch(`http://localhost:5000/api/trainers/${selectedTrainer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` }, body: JSON.stringify(cleanedData) })
      if (!res.ok) throw new Error('Failed to update')
      const token = localStorage.getItem('admin_token')
      const currentAssignments = await fetchTrainerPrograms(selectedTrainer.id)
      const currentIds = currentAssignments.map(a => String(a.program.id))
      const toAdd = selectedEditPrograms.filter(id => !currentIds.includes(id))
      for (const pid of toAdd) { await fetch(`http://localhost:5000/api/trainers/${selectedTrainer.id}/programs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ trainer_id: selectedTrainer.id, program_id: Number.parseInt(pid, 10), assigned_by: 1 }) }) }
      const toRemove = currentIds.filter(id => !selectedEditPrograms.includes(id))
      for (const pid of toRemove) { await fetch(`http://localhost:5000/api/trainers/${selectedTrainer.id}/programs/${pid}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }) }
      cacheManager.clearPattern('trainers:.*'); setSkip(0); await fetchTrainers(0, false); setShowEditModal(false); setSelectedTrainer(null); setSelectedEditPrograms([]); reset(); setSuccessMessage('Trainer updated!')
    } catch (e) { setError(e.message) } finally { setIsLoading(false) }
  }

  const onDeleteTrainer = async (trainerId) => {
    if (!confirm('Deactivate this trainer?')) return
    try {
      const res = await fetch(`http://localhost:5000/api/trainers/${trainerId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` } })
      if (!res.ok) throw new Error('Failed')
      cacheManager.clearPattern('trainers:.*'); setSkip(0); await fetchTrainers(0, false); setSuccessMessage('Trainer deactivated!')
    } catch (e) { setError(e.message) }
  }

  const onQuickAssign = async () => {
    if (quickAssignSelectedPrograms.length === 0 || !quickAssignTarget) return
    setIsLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      await Promise.all(quickAssignSelectedPrograms.map((programId) => fetch(`http://localhost:5000/api/trainers/${quickAssignTarget.id}/programs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ trainer_id: quickAssignTarget.id, program_id: Number.parseInt(programId, 10), assigned_by: 1 })
      })))
      setSelectedEditPrograms((current) => Array.from(new Set([...current, ...quickAssignSelectedPrograms])))
      closeQuickAssignModal()
      setSuccessMessage('Programs assigned!')
      cacheManager.clearPattern('trainers:.*')
      await fetchTrainers(0, false)
    } catch (e) { setError(e.message) } finally { setIsLoading(false) }
  }

  const openEditModal = async (trainer) => {
    setSelectedTrainer(trainer)
    setValue('trainer_name', trainer.trainer_name || '')
    setValue('tm_number', trainer.tm_number || '')
    setValue('tm_expiration', trainer.tm_expiration ? new Date(trainer.tm_expiration).toISOString().split('T')[0] : '')
    setValue('nttc_number', trainer.nttc_number || '')
    setValue('nttc_expiration', trainer.nttc_expiration ? new Date(trainer.nttc_expiration).toISOString().split('T')[0] : '')
    const assignments = await fetchTrainerPrograms(trainer.id)
    setSelectedEditPrograms(assignments.map(a => String(a.program.id)))
    setShowEditModal(true)
  }

  const openQuickAssignModal = async (trainer) => {
    setQuickAssignTarget(trainer)
    setQuickAssignSearchTerm('')
    const assignments = await fetchTrainerPrograms(trainer.id)
    setQuickAssignAssignedPrograms(assignments.map((assignment) => String(assignment.program.id)))
    setQuickAssignSelectedPrograms([])
    setShowQuickAssignModal(true)
  }

  const closeQuickAssignModal = () => {
    setShowQuickAssignModal(false)
    setQuickAssignTarget(null)
    setQuickAssignSearchTerm('')
    setQuickAssignAssignedPrograms([])
    setQuickAssignSelectedPrograms([])
  }

  const assignedProgramMap = programs.reduce((map, program) => {
    map[String(program.id)] = program
    return map
  }, {})

  const quickAssignAvailablePrograms = programs.filter((program) => !quickAssignAssignedPrograms.includes(String(program.id))).filter((program) => {
    const query = quickAssignSearchTerm.trim().toLowerCase()
    if (!query) return true
    return program.name.toLowerCase().includes(query)
  })

  const toggleQuickAssignProgram = (programId) => {
    setQuickAssignSelectedPrograms((current) => current.includes(programId) ? current.filter((id) => id !== programId) : [...current, programId])
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set'
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const exportTrainers = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/admin/trainers/export', { headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` } })
      const data = await res.json()
      const csv = [Object.keys(data.data[0]).join(','), ...data.data.map(row => Object.values(row).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = globalThis.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'trainers.csv'; a.click()
    } catch (e) { console.error(e) }
  }

  if (loading && trainers.length === 0) return <div className="flex items-center justify-center h-64"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div><p className="mt-4 text-gray-600">Loading...</p></div></div>

  return (
    <div className="space-y-6">
      {successMessage && <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-md"><div className="flex items-center"><div className="h-5 w-5 text-green-500 mr-3 font-bold">✓</div><p className="text-green-800 font-semibold">{successMessage}</p><button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-500 hover:text-green-700"><X className="h-4 w-4" /></button></div></div>}
      {error && <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md"><div className="flex items-center"><AlertCircle className="h-5 w-5 text-red-500 mr-3" /><p className="text-red-800">{error}</p><button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button></div></div>}

      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-gray-900">Trainers</h1><p className="mt-2 text-base text-gray-600 font-medium">Manage trainer accounts</p></div>
        <div className="flex space-x-3">
          <button onClick={exportTrainers} className="flex items-center px-4 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-100"><Download className="h-4 w-4 mr-2" />Export</button>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md"><UserPlus className="h-5 w-5 mr-2" />Add Trainer</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="relative"><Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" /><input type="text" placeholder="Search by name or username..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" /></div>
      </div>

      {filteredTrainers.length === 0 && !loading ? (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-16 text-center"><Users className="mx-auto h-16 w-16 text-gray-400" /><h3 className="mt-4 text-lg font-bold text-gray-900">No trainers found</h3></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTrainers.map((trainer) => (
              <div key={trainer.id} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow border border-gray-200 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-3"><span className="text-blue-600 font-bold text-lg">{trainer.trainer_name ? trainer.trainer_name.charAt(0) : trainer.username.charAt(0)}</span></div>
                      <h3 className="text-lg font-bold text-gray-900">{trainer.trainer_name || 'N/A'}</h3>
                      <p className="text-sm text-gray-500 font-medium">@{trainer.username}</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-gray-700 flex items-center"><BookOpen className="h-4 w-4 mr-1 text-blue-600" />Assigned Programs:</p>
                        <button onClick={() => openQuickAssignModal(trainer)} className="inline-flex items-center px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"><Plus className="h-3 w-3 mr-1" />Add more</button>
                      </div>
                      <TrainerProgramsList trainerId={trainer.id} fetchTrainerPrograms={fetchTrainerPrograms} />
                    </div>

                    <div className="space-y-2">
                      {trainer.tm_number && <div className="flex items-start text-sm text-gray-700"><Award className="h-5 w-5 mr-2 text-blue-600 mt-0.5 flex-shrink-0" /><div><p className="font-semibold">TM: {trainer.tm_number}</p><p className="text-gray-500 text-xs">Expires: {formatDate(trainer.tm_expiration)}</p></div></div>}
                      {trainer.nttc_number && <div className="flex items-start text-sm text-gray-700"><Award className="h-5 w-5 mr-2 text-green-600 mt-0.5 flex-shrink-0" /><div><p className="font-semibold">NTTC: {trainer.nttc_number}</p><p className="text-gray-500 text-xs">Expires: {formatDate(trainer.nttc_expiration)}</p></div></div>}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex space-x-2">
                      <button onClick={() => openEditModal(trainer)} className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"><Edit className="h-4 w-4 mr-2" />Edit</button>
                      <button onClick={() => onDeleteTrainer(trainer.id)} className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="h-4 w-4 mr-2" />Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isLoadingMore && <div className="flex justify-center py-8"><Loader className="h-6 w-6 animate-spin text-blue-600" /></div>}
          <div ref={observerTarget} className="py-8" />
        </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-gray-900">Create New Trainer</h3><button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-6 w-6" /></button></div>
            <form onSubmit={handleSubmit(onCreateTrainer)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">Username *</label><input {...register('username', { required: 'Required' })} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Enter username" />{errors.username && <p className="mt-2 text-sm font-semibold text-red-600">{errors.username.message}</p>}</div>
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">Password *</label><input {...register('password', { required: 'Required' })} type="password" className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Enter password" />{errors.password && <p className="mt-2 text-sm font-semibold text-red-600">{errors.password.message}</p>}</div>
              </div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-2">Trainer Name</label><input {...register('trainer_name')} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Enter trainer name (optional)" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">TM Number</label><input {...register('tm_number')} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="TM number (optional)" /></div>
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">TM Expiration</label><input {...register('tm_expiration')} type="date" className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">NTTC Number</label><input {...register('nttc_number')} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="NTTC number (optional)" /></div>
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">NTTC Expiration</label><input {...register('nttc_expiration')} type="date" className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" /></div>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={isLoading} className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50">{isLoading ? 'Creating...' : 'Create Trainer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedTrainer && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6"><h3 className="text-2xl font-bold text-gray-900">Edit Trainer</h3><button onClick={() => { setShowEditModal(false); setSelectedEditPrograms([]) }} className="text-gray-400 hover:text-gray-600"><X className="h-6 w-6" /></button></div>
            <form onSubmit={handleSubmit(onUpdateTrainer)} className="space-y-4">
              <div><label className="block text-sm font-semibold text-gray-700 mb-2">Trainer Name</label><input {...register('trainer_name')} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Enter trainer name" /></div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="block text-sm font-semibold text-gray-700">Assigned Programs</span>
                  <button type="button" onClick={() => openQuickAssignModal(selectedTrainer)} className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"><Plus className="h-3 w-3 mr-1" />Add more</button>
                </div>
                <div className="border-2 border-gray-200 rounded-lg p-4 max-h-40 overflow-y-auto">
                  {selectedEditPrograms.length === 0 ? <p className="text-sm text-gray-500">No programs assigned</p> : (
                    <div className="flex flex-wrap gap-2">
                      {selectedEditPrograms.map((programId) => {
                        const program = assignedProgramMap[programId]
                        return (
                          <span key={programId} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            <span>{program?.name || 'Unknown'}</span>
                            <button type="button" onClick={() => setSelectedEditPrograms((current) => current.filter((id) => id !== programId))} className="rounded-full p-0.5 hover:bg-blue-200" aria-label={`Remove ${program?.name || 'program'}`}>
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                {selectedEditPrograms.length > 0 && <p className="mt-2 text-sm text-blue-600 font-semibold">{selectedEditPrograms.length} program{selectedEditPrograms.length === 1 ? '' : 's'} selected</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">TM Number</label><input {...register('tm_number')} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="TM number" /></div>
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">TM Expiration</label><input {...register('tm_expiration')} type="date" className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">NTTC Number</label><input {...register('nttc_number')} className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="NTTC number" /></div>
                <div><label className="block text-sm font-semibold text-gray-700 mb-2">NTTC Expiration</label><input {...register('nttc_expiration')} type="date" className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" /></div>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => { setShowEditModal(false); setSelectedEditPrograms([]) }} className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={isLoading} className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50">{isLoading ? 'Updating...' : 'Update Trainer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Assign Modal */}
      {showQuickAssignModal && quickAssignTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl max-w-lg w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Add more programs</h3>
                <p className="mt-1 text-sm text-gray-500">{quickAssignTarget.trainer_name || quickAssignTarget.username}</p>
              </div>
              <button onClick={closeQuickAssignModal} className="text-gray-400 hover:text-gray-600"><X className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div className="relative"><Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" /><input type="text" value={quickAssignSearchTerm} onChange={(e) => setQuickAssignSearchTerm(e.target.value)} placeholder="Search unassigned programs..." className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" /></div>
              <div className="border-2 border-gray-200 rounded-lg p-4 max-h-72 overflow-y-auto">
                {quickAssignAvailablePrograms.length === 0 ? <p className="text-sm text-gray-500">No unassigned programs found</p> : (
                  <div className="space-y-2">
                    {quickAssignAvailablePrograms.map((program) => {
                      const checked = quickAssignSelectedPrograms.includes(String(program.id))
                      return (
                        <label key={program.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                          <input type="checkbox" checked={checked} onChange={() => toggleQuickAssignProgram(String(program.id))} className="h-4 w-4 text-blue-600" />
                          <span className="text-sm text-gray-700 font-medium">{program.name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-4"><button onClick={closeQuickAssignModal} className="px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button><button onClick={onQuickAssign} disabled={isLoading || quickAssignSelectedPrograms.length === 0} className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50">{isLoading ? 'Assigning...' : 'Add selected'}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TrainerProgramsList({ trainerId, fetchTrainerPrograms }) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { const load = async () => { const data = await fetchTrainerPrograms(trainerId); setAssignments(data); setLoading(false) }; load() }, [trainerId, fetchTrainerPrograms])

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>
  if (assignments.length === 0) return <p className="text-sm text-gray-500 italic">No programs assigned</p>

  return (
    <div className="flex flex-wrap gap-1">
      {assignments.map((a) => (<span key={a.id} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{a.program?.name || 'Unknown'}</span>))}
    </div>
  )
}

export default Trainers
