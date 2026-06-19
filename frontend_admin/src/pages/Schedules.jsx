import React, { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Clock3, Plus, Upload, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'
import { fetchMySignature, readSignatureFile, saveMySignature } from '../utils/signatures'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const STATUS_COLORS = {
  complete: 'bg-emerald-500',
  absent: 'bg-rose-500',
  nat: 'bg-slate-600',
  leave: 'bg-sky-500',
  suspended: 'bg-amber-500',
  incomplete: 'bg-orange-500',
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

const getProgressBadge = (assignment) => {
  const completed = assignment?.progress_status === 'completed'
  return {
    label: completed ? 'Completed' : 'In Progress',
    tone: completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
  }
}

const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')
const fieldClassName = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder:text-slate-500 caret-slate-900 outline-none shadow-sm transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const formatDateOnly = (value) => (value ? String(value).split('T')[0] : 'Not set')

const isDateExpired = (value) => {
  if (!value) return false
  const dateOnly = String(value).split('T')[0]
  const expiryDate = new Date(`${dateOnly}T00:00:00`)
  if (Number.isNaN(expiryDate.getTime())) return false
  expiryDate.setHours(23, 59, 59, 999)
  return expiryDate.getTime() < Date.now()
}

const shouldRemoveAssignmentForEvent = (assignment, payload) => {
  if (!assignment || !payload) return false

  if (payload.event_type === 'program_deleted') {
    return String(assignment.program_id) === String(payload.program_id)
  }

  if (payload.event_type === 'assignment_deleted') {
    return String(assignment.trainer_id) === String(payload.trainer_id) && String(assignment.program_id) === String(payload.program_id)
  }

  return false
}

const updateAssignmentsForScheduleEvent = (currentAssignments, payload) => {
  if (!Array.isArray(currentAssignments) || currentAssignments.length === 0) return currentAssignments

  if (payload?.event_type === 'program_deleted' || payload?.event_type === 'assignment_deleted') {
    return currentAssignments.filter((assignment) => !shouldRemoveAssignmentForEvent(assignment, payload))
  }

  return currentAssignments
}

export default function Schedules() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [scheduleDays, setScheduleDays] = useState([])
  const [trainers, setTrainers] = useState([])
  const [eligiblePrograms, setEligiblePrograms] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expiredTrainer, setExpiredTrainer] = useState(null)
  const [assignmentWarning, setAssignmentWarning] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [savedSignature, setSavedSignature] = useState(null)
  const [signatureChoice, setSignatureChoice] = useState('none')
  const [signatureUpload, setSignatureUpload] = useState(null)

  const createForm = useForm({
    defaultValues: {
      trainer_id: '',
      program_id: '',
      hours_per_day: 8,
      schedule_date: '',
      batch: '',
    },
  })

  const loadAssignments = async (forceRefresh = false) => {
    setLoading(true)
    try {
      const cacheKey = cacheManager.generateKey('approval_queue', { status: statusFilter || 'all' })
      const cached = forceRefresh ? null : cacheManager.get(cacheKey)
      if (cached !== null) {
        setAssignments(cached)
        if (selectedAssignment) {
          const refreshed = cached.find((item) => item.id === selectedAssignment.id)
          setSelectedAssignment(refreshed || null)
        }
      }

      const query = statusFilter === 'all' ? '' : `?approval_status=${encodeURIComponent(statusFilter)}`
      const response = await fetch(`${API_BASE}/api/schedules/approval-queue${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextAssignments = Array.isArray(data) ? data : []
      setAssignments(nextAssignments)
      cacheManager.set(cacheKey, nextAssignments)
      if (selectedAssignment) {
        const refreshed = nextAssignments.find((item) => item.id === selectedAssignment.id)
        setSelectedAssignment(refreshed || null)
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to load teaching load')
    } finally {
      setLoading(false)
    }
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setAssignmentWarning(null)
    setSignatureUpload(null)
    setSignatureChoice(savedSignature ? 'existing' : 'none')
  }

  useEffect(() => {
    if (!showCreateModal) return

    const loadSignature = async () => {
      try {
        const signature = await fetchMySignature(API_BASE, getToken())
        setSavedSignature(signature)
        setSignatureChoice(signature ? 'existing' : 'none')
      } catch (error) {
        console.error(error)
      }
    }

    loadSignature()
  }, [showCreateModal])

  const handleSignatureFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const imageData = await readSignatureFile(file)
      setSignatureUpload({ imageData, fileName: file.name })
      setSignatureChoice('upload')
    } catch (error) {
      toast.error(error.message)
      event.target.value = ''
    }
  }

  const loadTrainers = async () => {
    const cacheKey = cacheManager.generateKey('trainers_list', { search: null })
    const cached = cacheManager.get(cacheKey)
    if (cached !== null) {
      setTrainers(cached)
      return
    }

    const response = await fetch(`${API_BASE}/api/trainers/?skip=0&limit=100`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const data = await response.json()
    const nextTrainers = data.data || []
    setTrainers(nextTrainers)
    cacheManager.set(cacheKey, nextTrainers)
  }

  const loadSchedule = async (assignment) => {
    try {
      const cacheKey = cacheManager.generateKey('schedule_days', {
        trainer_id: assignment.trainer_id,
        program_id: assignment.program_id,
      })
      const cached = cacheManager.get(cacheKey)
      setSelectedAssignment(assignment)
      if (cached !== null) {
        setScheduleDays(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/schedules/trainer/${assignment.trainer_id}/program/${assignment.program_id}/schedule`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextDays = Array.isArray(data) ? data : []
      setScheduleDays(nextDays)
      cacheManager.set(cacheKey, nextDays)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load schedule calendar')
    }
  }

  const loadEligiblePrograms = async (trainerId) => {
    if (!trainerId) {
      setEligiblePrograms([])
      return
    }

    try {
      const qualificationsCacheKey = cacheManager.generateKey('trainer_qualifications', { trainer_id: trainerId })
      const programsCacheKey = cacheManager.generateKey('programs_list', { search: null })

      const cachedQualifications = cacheManager.get(qualificationsCacheKey)
      const cachedPrograms = cacheManager.get(programsCacheKey)

      let qualifications = cachedQualifications
      let programs = cachedPrograms

      if (qualifications === null || programs === null) {
        const [qualificationsResponse, programsResponse] = await Promise.all([
          fetch(`${API_BASE}/api/trainers/${trainerId}/qualifications`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
          fetch(`${API_BASE}/api/programs/?skip=0&limit=100`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
        ])

        const qualificationsData = await qualificationsResponse.json()
        const programsData = await programsResponse.json()
        qualifications = (qualificationsData.data || [])
        programs = (programsData.data || [])

        cacheManager.set(qualificationsCacheKey, qualifications)
        cacheManager.set(programsCacheKey, programs)
      }

      const qualifiedProgramIds = new Set((qualifications || []).map((row) => row.program_id))
      const nextPrograms = (programs || [])
        .filter((program) => qualifiedProgramIds.has(program.id))
        .map((program) => {
          const qualification = (qualifications || []).find((row) => row.program_id === program.id)
          return {
            ...program,
            qualification,
            programExpired: isDateExpired(program.validity),
            qualificationExpired: isDateExpired(qualification?.nttc_expiration),
          }
        })

      setEligiblePrograms(nextPrograms)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load trainer qualifications')
    }
  }

  const isTmExpired = (tmExpiration) => {
    if (!tmExpiration) return false
    const dateOnly = String(tmExpiration).split('T')[0]
    const expiryDate = new Date(`${dateOnly}T00:00:00`)
    if (Number.isNaN(expiryDate.getTime())) return false
    expiryDate.setHours(23, 59, 59, 999)
    return expiryDate.getTime() < Date.now()
  }

  const getLoadOwner = (assignment) => {
    if (assignment?.approval_status === 'for approval') {
      return {
        label: 'Created by',
        name: assignment.assigned_by_name || 'Not set',
        position: assignment.assigned_by_position || '',
        tone: 'border-amber-200 bg-amber-50 text-amber-800',
      }
    }

    return {
      label: 'Reviewed by',
      name: assignment?.approved_by_name || 'Not set',
      position: assignment?.approved_by_position || '',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    }
  }

  const handleTrainerChange = (event) => {
    const trainerId = event.target.value
    const selectedTrainer = trainers.find((trainer) => String(trainer.id) === String(trainerId))
    setAssignmentWarning(null)

    if (selectedTrainer && isTmExpired(selectedTrainer.tm_expiration)) {
      setExpiredTrainer(selectedTrainer)
      createForm.setValue('trainer_id', '')
      createForm.setValue('program_id', '')
      setEligiblePrograms([])
      event.target.value = ''
      return
    }

    createForm.setValue('trainer_id', trainerId)
    createForm.setValue('program_id', '')
    loadEligiblePrograms(trainerId)
  }

  useEffect(() => {
    loadAssignments(true)
  }, [statusFilter])

  useEffect(() => {
    if (user?.user_type === 'admin') {
      loadTrainers()
    }
  }, [user?.user_type])

  useEffect(() => {
    if (!user?.id) return

    const socket = getSocket()
    if (!socket) return

    registerUser(user.user_id || user.id)

    const handleScheduleUpdate = (payload) => {
      if (!payload || !['assignment_approval_updated', 'assignment_created', 'assignment_deleted', 'program_deleted'].includes(payload.event_type)) return

      cacheManager.clearPattern('approval_queue:')
      cacheManager.clearPattern('trainer_programs:')
      cacheManager.clearPattern('schedules_trainer_programs:')
      cacheManager.clearPattern('schedules_schedule:')
      setSelectedAssignment((current) => {
        if (!current) return null
        const sameAssignment = String(current.trainer_id) === String(payload.trainer_id) && String(current.program_id) === String(payload.program_id)
        const sameProgram = payload.event_type === 'program_deleted' && String(current.program_id) === String(payload.program_id)
        if (sameAssignment || sameProgram) {
          setScheduleDays([])
          return payload.event_type === 'assignment_deleted' || payload.event_type === 'program_deleted' ? null : current
        }
        return current
      })
      setAssignments((current) => updateAssignmentsForScheduleEvent(current, payload))
      loadAssignments(true)
    }

    socket.on('schedule_update', handleScheduleUpdate)

    return () => {
      socket.off('schedule_update', handleScheduleUpdate)
    }
  }, [loadAssignments, user?.id, user?.user_id])

  useEffect(() => {
    if (!user?.id) return

    const socket = getSocket()
    if (!socket) return

    const handleProgramUpdate = (payload) => {
      if (!payload?.event_type || !['program_created', 'program_updated', 'program_deleted'].includes(payload.event_type)) return

      cacheManager.clearPattern('approval_queue:')
      cacheManager.clearPattern('schedule_days:')
      cacheManager.clearPattern('trainer_programs:')
      cacheManager.clearPattern('schedules_trainer_programs:')
      cacheManager.clearPattern('schedules_schedule:')
      loadAssignments(true)
      setSelectedAssignment((current) => {
        if (!current || String(current.program_id) !== String(payload.program_id)) return current
        setScheduleDays([])
        return payload.event_type === 'program_deleted' ? null : current
      })
    }

    socket.on('program_update', handleProgramUpdate)

    return () => {
      socket.off('program_update', handleProgramUpdate)
    }
  }, [loadAssignments, user?.id, user?.user_id])

  useEffect(() => {
    if (location.state?.openCreateModal) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  const filteredAssignments = useMemo(() => {
    return statusFilter === 'all' ? assignments : assignments.filter((assignment) => assignment.approval_status === statusFilter)
  }, [assignments, statusFilter])

  const handleCreate = async (values) => {
    const selectedTrainer = trainers.find((trainer) => String(trainer.id) === String(values.trainer_id))
    const selectedProgram = eligiblePrograms.find((program) => String(program.id) === String(values.program_id))
    if (selectedTrainer && isTmExpired(selectedTrainer.tm_expiration)) {
      setExpiredTrainer(selectedTrainer)
      toast.error('TM is expired. This trainer cannot be assigned a teaching load.')
      return
    }

    if (!selectedProgram) {
      toast.error('Please choose a qualified program.')
      return
    }

    if (selectedProgram.programExpired) {
      setAssignmentWarning({
        title: 'Program Validity Expired',
        message: `${selectedProgram.name} cannot be assigned because the program validity date has expired.`,
        detail: `Validity Date: ${formatDateOnly(selectedProgram.validity)}`,
      })
      return
    }

    if (selectedProgram.qualificationExpired) {
      setAssignmentWarning({
        title: 'NTTC Expired',
        message: `${selectedTrainer?.trainer_name || selectedTrainer?.username || 'This trainer'} cannot be assigned to ${selectedProgram.name} because the NTTC qualification for this program has expired.`,
        detail: `NTTC Expiration: ${formatDateOnly(selectedProgram.qualification?.nttc_expiration)}`,
      })
      return
    }

    setIsProcessing(true)
    try {
      let finalUseDigitalSignature = false
      if (signatureChoice === 'upload' && signatureUpload?.imageData) {
        const signature = await saveMySignature(API_BASE, getToken(), signatureUpload.imageData, signatureUpload.fileName)
        setSavedSignature(signature)
        setSignatureUpload(null)
        setSignatureChoice('existing')
        toast.success('Signature saved for future reports')
        finalUseDigitalSignature = true
      } else if (savedSignature) {
        finalUseDigitalSignature = true
      } else {
        toast.error('A digital signature is required. Please upload one.')
        setIsProcessing(false)
        return
      }

      const response = await fetch(`${API_BASE}/api/trainers/${values.trainer_id}/programs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          program_id: Number.parseInt(values.program_id, 10),
          hours_per_day: Number.parseInt(values.hours_per_day, 10),
          schedule_date: values.schedule_date || null,
          batch: values.batch || null,
          use_digital_signature: finalUseDigitalSignature,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create teaching load')
      }
      toast.success('Teaching load created and submitted for approval')
      cacheManager.clearPattern('approval_queue:')
      cacheManager.clearPattern('schedule_days:')
      cacheManager.clearPattern('stats_')
      cacheManager.clearPattern('admin_dashboard_stats')
      setAssignmentWarning(null)
      createForm.reset({
        trainer_id: '',
        program_id: '',
        hours_per_day: 8,
        schedule_date: '',
        batch: '',
      })
      setEligiblePrograms([])
      closeCreateModal()
      loadAssignments(true)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApproval = async (nextStatus) => {
    if (!selectedAssignment) return
    setIsProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/schedules/trainer/${selectedAssignment.trainer_id}/program/${selectedAssignment.program_id}/approval`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ approval_status: nextStatus }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update approval')
      }
      toast.success(`Teaching load ${nextStatus}`)
      const data = await response.json()
      setSelectedAssignment(data)
      cacheManager.clearPattern('approval_queue:')
      cacheManager.clearPattern('schedule_days:')
      cacheManager.clearPattern('stats_')
      cacheManager.clearPattern('admin_dashboard_stats')
      loadAssignments()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const calendarDays = selectedAssignment?.program_days || 0
  let assignmentsPanel
  if (loading) {
    assignmentsPanel = <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-slate-500">Loading teaching load...</div>
  } else if (filteredAssignments.length === 0) {
    assignmentsPanel = <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No teaching load found.</div>
  } else {
    assignmentsPanel = filteredAssignments.map((assignment) => (
      <button
        type="button"
        key={assignment.id}
        onClick={() => loadSchedule(assignment)}
        className={`w-full rounded-[2rem] border p-5 text-left shadow-sm transition ${
          selectedAssignment?.id === assignment.id
            ? 'border-sky-400 bg-sky-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{assignment.approval_status}</p>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${getProgressBadge(assignment).tone}`}>
                {getProgressBadge(assignment).label}
              </span>
            </div>
            <h3 className="mt-2 text-lg font-bold text-slate-900">{assignment.program_name}</h3>
            <p className="mt-1 text-sm text-slate-600">{assignment.trainer_name}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
            {assignment.hours_per_day} hrs/day
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-600">
          <p>Start Date: {assignment.schedule_date || 'Not set'}</p>
          <p>Total Hours: {assignment.program_total_hours || 0}</p>
          <p>Calendar Days: {assignment.program_days || 0}</p>
        </div>
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${getLoadOwner(assignment).tone}`}>
          <p className="font-semibold uppercase tracking-[0.18em]">{getLoadOwner(assignment).label}</p>
          <p className="mt-1 font-bold">{getLoadOwner(assignment).name}</p>
          {getLoadOwner(assignment).position && <p className="text-xs">{getLoadOwner(assignment).position}</p>}
        </div>
      </button>
    ))
  }

  const detailsPanel = selectedAssignment ? (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{selectedAssignment.approval_status}</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">{selectedAssignment.program_name}</h2>
          <p className="mt-1 text-sm text-slate-600">{selectedAssignment.trainer_name}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
          <p><span className="font-semibold">Type:</span> {selectedAssignment.program_type}</p>
          <p><span className="font-semibold">Validity Date:</span> {formatDateOnly(selectedAssignment.program_validity)}</p>
          <p><span className="font-semibold">Hours/Day:</span> {selectedAssignment.hours_per_day}</p>
        </div>
      </div>

      <div className={`rounded-[1.75rem] border p-5 ${getLoadOwner(selectedAssignment).tone}`}>
        <p className="text-xs font-bold uppercase tracking-[0.2em]">{getLoadOwner(selectedAssignment).label}</p>
        <p className="mt-2 text-xl font-black">{getLoadOwner(selectedAssignment).name}</p>
        {getLoadOwner(selectedAssignment).position && <p className="mt-1 text-sm">{getLoadOwner(selectedAssignment).position}</p>}
      </div>

      {user?.user_type === 'supervisor' && selectedAssignment.approval_status !== 'approved' && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => handleApproval('approved')} disabled={isProcessing} className="inline-flex items-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve
          </button>
          <button type="button" onClick={() => handleApproval('rejected')} disabled={isProcessing} className="inline-flex items-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Start Date</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{selectedAssignment.schedule_date || 'Not set'}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Total Hours</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{selectedAssignment.program_total_hours || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Generated Days</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{selectedAssignment.program_days || 0}</p>
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <Clock3 className="h-5 w-5 text-sky-600" />
          <h3 className="text-lg font-bold text-slate-900">Weekday Calendar</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: calendarDays }, (_, index) => index + 1).map((dayNumber) => {
            const entry = scheduleDays.find((row) => row.day_number === dayNumber)
            const status = entry?.status
            const color = getStatusOption(status)?.color || 'bg-slate-300'
            return (
              <div key={dayNumber} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Day {dayNumber}</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">{entry?.schedule_date || 'Pending date'}</p>
                <div className="mt-4 flex justify-center">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}>
                    {status ? getStatusDisplay(status).charAt(0).toUpperCase() : dayNumber}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{getStatusDisplay(status)}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center text-center text-slate-500">
      <CalendarDays className="h-12 w-12 text-slate-300" />
      <p className="mt-4 text-lg font-semibold text-slate-700">Select a teaching load</p>
      <p className="mt-2 max-w-md text-sm">Open a card on the left to view the weekday calendar, approval status, and generated schedule days.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {isProcessing && (
        <div className="sticky top-0 z-20 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-1.5 w-full animate-pulse bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-500" />
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Teaching Load</h1>
          <p className="mt-2 text-sm text-slate-600">Assign qualified trainers, generate weekday calendars, and approve the load workflow.</p>
        </div>
        {user?.user_type === 'admin' && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isProcessing}
            className="inline-flex items-center rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Teaching Load
          </button>
        )}
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {['all', 'for approval', 'approved', 'rejected'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatusFilter(option)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                statusFilter === option
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.3fr)]">
        <div className="max-h-[40rem] space-y-4 overflow-y-auto pr-1">{assignmentsPanel}</div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6 xl:self-start">
          {detailsPanel}
        </div>
      </div>

      {showCreateModal && (
        <ModalShell title="Create Teaching Load" onClose={closeCreateModal} maxWidth="max-w-5xl">
          <form className="space-y-4" onSubmit={createForm.handleSubmit(handleCreate)}>
            <div>
              <label htmlFor="teaching_load_trainer" className="block text-sm font-semibold text-slate-700">Trainer</label>
              <select
                id="teaching_load_trainer"
                {...createForm.register('trainer_id', { required: true })}
                onChange={handleTrainerChange}
                className={`${fieldClassName} mt-2`}
              >
                <option value="">Select trainer</option>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>{trainer.trainer_name || trainer.username}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="teaching_load_program" className="block text-sm font-semibold text-slate-700">Qualified Program</label>
              <select id="teaching_load_program" {...createForm.register('program_id', { required: true })} className={`${fieldClassName} mt-2`}>
                <option value="">Select program</option>
                {eligiblePrograms.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}{program.programExpired ? ' (Program expired)' : ''}{!program.programExpired && program.qualificationExpired ? ' (NTTC expired)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="teaching_load_hours_per_day" className="block text-sm font-semibold text-slate-700">Schedule Type</label>
              <select id="teaching_load_hours_per_day" {...createForm.register('hours_per_day')} className={`${fieldClassName} mt-2`}>
                <option value={8}>8 hours/day</option>
                <option value={4}>4 hours/day</option>
              </select>
            </div>
            <div>
              <label htmlFor="teaching_load_start_date" className="block text-sm font-semibold text-slate-700">Start Date</label>
              <input id="teaching_load_start_date" type="date" {...createForm.register('schedule_date')} className={`${fieldClassName} mt-2`} />
            </div>
            <div>
              <label htmlFor="teaching_load_batch" className="block text-sm font-semibold text-slate-700">Batch</label>
              <input id="teaching_load_batch" type="text" {...createForm.register('batch')} placeholder="yyyy-batch" className={`${fieldClassName} mt-2`} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Digital Signature</p>
                  <p className="text-xs text-slate-500">Required. Saved to your account and reused on generated reports.</p>
                </div>
              </div>
              {(signatureUpload?.imageData || savedSignature?.image_data) && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-400 mb-1">
                    {signatureUpload?.imageData ? "New Signature Preview" : "Existing Signature Preview"}
                  </p>
                  <img
                    src={signatureUpload?.imageData || savedSignature?.image_data}
                    alt="Signature preview"
                    className="h-16 max-w-full object-contain"
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
                  <Upload className="mr-2 h-4 w-4" />
                  {savedSignature ? 'Upload New Signature' : 'Upload Signature'}
                  <input type="file" accept="image/png,image/jpeg" onChange={handleSignatureFileChange} className="hidden" />
                </label>
                {savedSignature && signatureChoice !== 'existing' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSignatureChoice('existing')
                      setSignatureUpload(null)
                    }}
                    className="rounded-xl bg-white text-slate-700 px-3 py-2 text-xs font-semibold ring-1 ring-slate-200 transition hover:bg-slate-100"
                  >
                    Use Existing Signature
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              The calendar is generated automatically using weekdays only. New extra days are added when a day is marked absent, NAT, leave, suspended, or incomplete.
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeCreateModal} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="submit" disabled={isProcessing} className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{isProcessing ? 'Processing...' : 'Assign Load'}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {expiredTrainer && (
        <ModalShell title="TMC Level I Expired" onClose={() => setExpiredTrainer(null)} maxWidth="max-w-lg">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              {expiredTrainer.trainer_name || expiredTrainer.username} cannot be assigned a teaching load because the TMC Level I is expired.
            </p>
            <p className="text-sm font-semibold text-rose-600">
              TMC Level I Expiration: {expiredTrainer.tm_expiration ? expiredTrainer.tm_expiration.split('T')[0] : 'Not set'}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setExpiredTrainer(null)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                OK
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {assignmentWarning && (
        <ModalShell title={assignmentWarning.title} onClose={() => setAssignmentWarning(null)} maxWidth="max-w-lg">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">{assignmentWarning.message}</p>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {assignmentWarning.detail}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAssignmentWarning(null)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                OK
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
