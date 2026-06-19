import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Download, FileText, Loader2, Search, Square, Upload, User2, Users } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket } from '../utils/socket'
import { lookupSignatures, readSignatureFile, saveMySignature } from '../utils/signatures'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const REPORT_CACHE_VERSION = 'v6'

const getToken = () => localStorage.getItem('supervisor_token') || sessionStorage.getItem('supervisor_session_token')

const formatDate = (value) => {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).split('T')[0] || 'N/A'
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })
}

const formatDateTime = (value) => {
  const parsed = value ? new Date(value) : new Date()
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString('en-PH')
  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const slugify = (value) => String(value || 'trainer-report')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const loadProgressLabel = (load) => {
  if (load?.progress_status === 'completed') return 'Completed'
  return 'In Progress'
}

const loadApprovalLabel = (load) => {
  if (load?.approval_status) {
    return String(load.approval_status).replaceAll('_', ' ')
  }
  return 'Approved'
}

const isApprovedLoad = (load) => load?.approval_status === 'approved'

const getImageFormat = (dataUrl) => dataUrl?.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'

const toDataUrl = async (response) => {
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const fetchTesdaLogo = async () => {
  try {
    const response = await fetch(`${API_BASE}/tesda-icon.png`)
    if (!response.ok) return null
    return await toDataUrl(response)
  } catch (error) {
    console.error('Failed to load TESDA logo:', error)
    return null
  }
}

const getTrainerDisplayName = (trainer) => {
  const fullName = [trainer?.first_name, trainer?.middle_name, trainer?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return trainer?.full_name || trainer?.trainer_name || fullName || trainer?.username || 'Unnamed trainer'
}

const getTrainerSearchText = (trainer) => {
  return [
    trainer?.first_name,
    trainer?.middle_name,
    trainer?.last_name,
    trainer?.full_name,
    trainer?.trainer_name,
    trainer?.username,
    trainer?.email,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function GenerateReport() {
  const { user } = useAuth()
  const [trainers, setTrainers] = useState([])
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [loads, setLoads] = useState([])
  const [selectedLoadIds, setSelectedLoadIds] = useState(new Set())
  const [trainerSearch, setTrainerSearch] = useState('')
  const [loadingTrainers, setLoadingTrainers] = useState(true)
  const [loadingLoads, setLoadingLoads] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [availableSignatures, setAvailableSignatures] = useState({})
  const [signatureUpload, setSignatureUpload] = useState(null)

  const selectedTrainer = useMemo(
    () => trainers.find((trainer) => String(trainer.id) === String(selectedTrainerId)) || null,
    [selectedTrainerId, trainers],
  )

  const selectedLoads = useMemo(
    () => loads.filter((load) => selectedLoadIds.has(load.id)),
    [loads, selectedLoadIds],
  )

  const selectedTrainerName = useMemo(() => getTrainerDisplayName(selectedTrainer), [selectedTrainer])
  const selectedTrainerTmNumber = selectedTrainer?.tm_number || 'N/A'

  const filteredTrainers = useMemo(() => {
    if (!trainerSearch.trim()) return trainers
    const query = trainerSearch.toLowerCase()
    return trainers.filter((trainer) => getTrainerSearchText(trainer).includes(query))
  }, [trainerSearch, trainers])

  const loadTrainers = useCallback(async () => {
    setLoadingTrainers(true)
    try {
      const cacheKey = cacheManager.generateKey('supervisor_report_trainers', {
        version: REPORT_CACHE_VERSION,
      })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setTrainers(cached)
        return
      }

      const allTrainers = []
      let page = 1

      while (page <= 20) {
        const response = await fetch(`${API_BASE}/api/trainers/?skip=${(page - 1) * 100}&limit=100`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })

        if (!response.ok) {
          throw new Error('Failed to load trainers')
        }

        const data = await response.json()
        const nextTrainers = Array.isArray(data?.data) ? data.data : []
        allTrainers.push(...nextTrainers)

        if (!data?.has_more || nextTrainers.length < 100) {
          break
        }

        page += 1
      }

      setTrainers(allTrainers)
      cacheManager.set(cacheKey, allTrainers)
      setSelectedTrainerId((current) => current || (allTrainers.length > 0 ? String(allTrainers[0].id) : ''))
    } catch (error) {
      console.error(error)
      toast.error('Failed to load trainers')
      setTrainers([])
    } finally {
      setLoadingTrainers(false)
    }
  }, [])

  const loadTrainerLoads = useCallback(async (trainerId) => {
    if (!trainerId) {
      setLoads([])
      setSelectedLoadIds(new Set())
      return
    }

    setLoadingLoads(true)
    try {
      const cacheKey = cacheManager.generateKey('supervisor_report_loads', {
        trainer_id: trainerId,
        version: REPORT_CACHE_VERSION,
      })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        const approvedCachedLoads = cached.filter(isApprovedLoad)
        setLoads(approvedCachedLoads)
        setSelectedLoadIds(new Set(approvedCachedLoads.map((load) => load.id)))
      }

      const response = await fetch(`${API_BASE}/api/schedules/trainer/${trainerId}/programs?approval_status=approved`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Failed to load trainer loads')
      }
      const data = await response.json()
      const nextLoads = Array.isArray(data) ? data : []
      const fallbackLoads = Array.isArray(data?.data) ? data.data : []
      const resolvedLoads = (nextLoads.length > 0 ? nextLoads : fallbackLoads).filter(isApprovedLoad)
      setLoads(resolvedLoads)
      setSelectedLoadIds(new Set(resolvedLoads.map((load) => load.id)))
      cacheManager.set(cacheKey, resolvedLoads, 60000)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load trainer loads')
      setLoads([])
      setSelectedLoadIds(new Set())
    } finally {
      setLoadingLoads(false)
    }
  }, [])

  useEffect(() => {
    loadTrainers()
  }, [loadTrainers])

  useEffect(() => {
    if (!selectedTrainerId && filteredTrainers.length > 0) {
      setSelectedTrainerId(String(filteredTrainers[0].id))
    }
  }, [filteredTrainers, selectedTrainerId])

  useEffect(() => {
    loadTrainerLoads(selectedTrainerId)
  }, [loadTrainerLoads, selectedTrainerId])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const refreshReportCaches = () => {
      cacheManager.clearPattern('supervisor_report_')
      loadTrainers()
      if (selectedTrainerId) {
        loadTrainerLoads(selectedTrainerId)
      }
    }

    socket.on('program_update', refreshReportCaches)
    socket.on('schedule_update', refreshReportCaches)
    socket.on('trainer_update', refreshReportCaches)

    return () => {
      socket.off('program_update', refreshReportCaches)
      socket.off('schedule_update', refreshReportCaches)
      socket.off('trainer_update', refreshReportCaches)
    }
  }, [loadTrainers, loadTrainerLoads, selectedTrainerId])

  const toggleLoad = (loadId) => {
    setSelectedLoadIds((current) => {
      const next = new Set(current)
      if (next.has(loadId)) {
        next.delete(loadId)
      } else {
        next.add(loadId)
      }
      return next
    })
  }

  const setAllSelected = (enabled) => {
    setSelectedLoadIds(new Set(enabled ? loads.map((load) => load.id) : []))
  }

  const getSelectedSignerIds = () => Array.from(new Set(
    selectedLoads
      .flatMap((load) => [
        load.assigned_by_signature_enabled ? load.assigned_by : null,
        load.approved_by,
      ])
      .filter(Boolean)
      .map((userId) => Number.parseInt(userId, 10))
      .filter((userId) => Number.isFinite(userId)),
  ))

  const openSignatureDialog = async () => {
    if (!selectedTrainer) {
      toast.error('Please select a trainer first')
      return
    }

    if (selectedLoads.length === 0) {
      toast.error('Please select at least one load to include')
      return
    }

    try {
      const signatures = await lookupSignatures(API_BASE, getToken(), getSelectedSignerIds())
      setAvailableSignatures(signatures)
    } catch (error) {
      console.error(error)
      setAvailableSignatures({})
    }
    setSignatureUpload(null)
    setSignatureDialogOpen(true)
  }

  const handleReportSignatureFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const imageData = await readSignatureFile(file)
      setSignatureUpload({ imageData, fileName: file.name })
    } catch (error) {
      toast.error(error.message)
      event.target.value = ''
    }
  }

  const generateWithUploadedSignature = async () => {
    if (!signatureUpload?.imageData) {
      toast.error('Please choose a signature image first')
      return
    }

    try {
      const signature = await saveMySignature(API_BASE, getToken(), signatureUpload.imageData, signatureUpload.fileName)
      const nextSignatures = {
        ...availableSignatures,
        ...(user?.id ? { [String(user.id)]: signature } : {}),
      }
      setAvailableSignatures(nextSignatures)
      toast.success('Signature saved for future reports')
      await generateReport(nextSignatures)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const drawPdfHeader = async (doc, logoDataUrl, title, trainerName, trainerTmNumber, trainerPrograms) => {
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 14

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', margin, 10, 24, 24)
    }

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(31, 41, 55)
    doc.setFontSize(11)
    doc.text('Republic of the Philippines', pageWidth / 2, 16, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Technical Education and Skills Development Authority', pageWidth / 2, 22, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('National Capital Region', pageWidth / 2, 28, { align: 'center' })
    doc.setDrawColor(59, 130, 246)
    doc.setLineWidth(0.5)
    doc.line(margin, 34, pageWidth - margin, 34)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.text(title, margin, 44)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Trainer: ${trainerName}`, margin, 50)
    doc.text(`Generated: ${formatDateTime()}`, margin, 55)
    doc.text(`Selected Loads: ${selectedLoads.length}`, margin, 60)

    const infoTop = 64
    const programText = trainerPrograms.length > 0
      ? trainerPrograms.map((load) => load.program_name || 'Unnamed program').join(', ')
      : 'No selected programs'
    const splitPrograms = doc.splitTextToSize(`Program/s: ${programText}`, pageWidth - margin * 2 - 6)
    const infoHeight = Math.max(18, 12 + splitPrograms.length * 4)

    doc.setDrawColor(203, 213, 225)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(margin, infoTop, pageWidth - margin * 2, infoHeight, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(15, 23, 42)
    doc.text(`TM Number: ${trainerTmNumber || 'N/A'}`, margin + 3, infoTop + 7)
    doc.setFont('helvetica', 'normal')
    doc.text(splitPrograms, margin + 3, infoTop + 13)

    return infoTop + infoHeight + 6
  }

  const generateReport = async (signaturesByUserId = {}) => {
    if (!selectedTrainer) {
      toast.error('Please select a trainer first')
      return
    }

    if (selectedLoads.length === 0) {
      toast.error('Please select at least one load to include')
      return
    }

    setGenerating(true)
    try {
      setSignatureDialogOpen(false)
      const doc = new jsPDF('p', 'mm', 'a4')
      const logo = await fetchTesdaLogo()
      const tableStartY = await drawPdfHeader(
        doc,
        logo,
        'Trainer Teaching Load Report',
        selectedTrainerName,
        selectedTrainerTmNumber,
        selectedLoads,
      )

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: 14, right: 14 },
        head: [['Program', 'Modality', 'Approval', 'Progress', 'Hours/Day', 'Days', 'Start Date']],
        body: selectedLoads.map((load) => [
          load.program_name || 'Unnamed program',
          load.program_type || 'N/A',
          loadApprovalLabel(load),
          loadProgressLabel(load),
          String(load.hours_per_day ?? 'N/A'),
          String(load.program_days ?? 'N/A'),
          formatDate(load.schedule_date || load.created_at),
        ]),
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 2,
          textColor: [31, 41, 55],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        didDrawPage: (data) => {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(100, 116, 139)
          doc.text(`Page ${doc.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.getHeight() - 8)
        },
      })

      const footerMargin = 14
      const footerStartY = (doc.lastAutoTable?.finalY || 90) + 10
      const pageHeight = doc.internal.pageSize.getHeight()

      // Aggregate unique prepared-by and approved-by pairs from selected loads
      const uniqueList = (items, userField, nameField, positionField, signatureEnabledField = null) => {
        const map = new Map()
        items.forEach((it) => {
          const userId = it?.[userField] || null
          const name = it?.[nameField] || 'N/A'
          const position = it?.[positionField] || 'N/A'
          const key = userId ? String(userId) : `${name}||${position}`
          const signatureEnabled = signatureEnabledField ? it?.[signatureEnabledField] === true : true
          if (!map.has(key)) map.set(key, { userId, name, position, signatureEnabled })
        })
        return Array.from(map.values())
      }

      const preparedList = uniqueList(selectedLoads, 'assigned_by', 'assigned_by_name', 'assigned_by_position', 'assigned_by_signature_enabled')
      const approvedList = uniqueList(selectedLoads, 'approved_by', 'approved_by_name', 'approved_by_position')

      // Calculate block heights based on number of signatories (stack vertically if multiple)
      const itemHeight = 30
      const preparedBlockHeight = Math.max(28, preparedList.length * itemHeight + 8)
      const approvedBlockHeight = Math.max(28, approvedList.length * itemHeight + 8)
      const blockHeight = Math.max(preparedBlockHeight, approvedBlockHeight)

      const needsNewPage = footerStartY + blockHeight + 12 > pageHeight - 12
      if (needsNewPage) doc.addPage()

      const footerY = needsNewPage ? 20 : footerStartY
      const blockTop = footerY
      const blockWidth = (doc.internal.pageSize.getWidth() - footerMargin * 2 - 8) / 2

      const renderSignatoryList = (x, label, items) => {
        doc.setDrawColor(203, 213, 225)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, blockTop, blockWidth, Math.max(28, items.length * itemHeight + 8), 2, 2, 'S')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text(label, x + 3, blockTop + 6)

        doc.setFont('helvetica', 'normal')
        items.forEach((it, idx) => {
          const itemTop = blockTop + 8 + idx * itemHeight

          // draw signature line on top of the printed name to leave space for signing above
          doc.setDrawColor(100, 116, 139)
          const lineY = itemTop + 12
          const signature = it.signatureEnabled ? signaturesByUserId[String(it.userId)]?.image_data : null
          if (signature) {
            try {
              doc.addImage(signature, getImageFormat(signature), x + 10, lineY - 11, blockWidth - 20, 10, undefined, 'FAST')
            } catch (error) {
              console.error('Failed to draw signature image:', error)
            }
          }
          doc.line(x + 6, lineY, x + blockWidth - 6, lineY)

          // printed name and position below the signature line
          doc.setFontSize(9)
          doc.text(it.name || 'N/A', x + 6, lineY + 6)
          doc.setFontSize(8)
          doc.text(it.position || 'N/A', x + 6, lineY + 10)
        })
      }

      renderSignatoryList(footerMargin, 'Prepared by', preparedList.length > 0 ? preparedList : [{ userId: null, name: 'N/A', position: 'N/A' }])
      renderSignatoryList(footerMargin + blockWidth + 8, 'Approved by', approvedList.length > 0 ? approvedList : [{ userId: null, name: 'N/A', position: 'N/A' }])

      const fileName = `tesda-trainer-report-${slugify(selectedTrainerName)}.pdf`
      doc.save(fileName)
    } catch (error) {
      console.error(error)
      toast.error('Failed to generate PDF report')
    } finally {
      setGenerating(false)
    }
  }

  let trainerListContent
  if (loadingTrainers) {
    trainerListContent = (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">Loading trainers...</div>
    )
  } else if (filteredTrainers.length === 0) {
    trainerListContent = (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">No trainers found.</div>
    )
  } else {
    trainerListContent = filteredTrainers.map((trainer) => {
      const trainerName = getTrainerDisplayName(trainer)
      return (
        <button
          key={trainer.id}
          type="button"
          onClick={() => setSelectedTrainerId(String(trainer.id))}
          className={`w-full rounded-3xl border p-4 text-left transition ${
            String(selectedTrainerId) === String(trainer.id)
              ? 'border-cyan-400 bg-cyan-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <User2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="truncate text-base font-bold text-slate-900">{trainerName}</h3>
                  <p className="truncate text-sm text-slate-600">{trainer.email || 'No email set'}</p>
                </div>
                {String(selectedTrainerId) === String(trainer.id) && (
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-700">Selected</span>
                )}
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">TM Number: {trainer.tm_number || 'Not set'}</p>
            </div>
          </div>
        </button>
      )
    })
  }

  let loadListContent
  if (!selectedTrainer) {
    loadListContent = (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        Select a trainer to display their assigned loads.
      </div>
    )
  } else if (loadingLoads) {
    loadListContent = (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">Loading assigned loads...</div>
    )
  } else if (loads.length === 0) {
    loadListContent = (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
        No assigned loads were found for this trainer.
      </div>
    )
  } else {
    loadListContent = loads.map((load) => {
      const selected = selectedLoadIds.has(load.id)
      return (
        <button
          type="button"
          key={load.id}
          onClick={() => toggleLoad(load.id)}
          className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
            selected
              ? 'border-cyan-400 bg-cyan-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="mt-1">
              {selected ? <CheckSquare className="h-5 w-5 text-cyan-600" /> : <Square className="h-5 w-5 text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="truncate text-lg font-bold text-slate-900">{load.program_name || 'Unnamed program'}</h3>
                  <p className="text-sm text-slate-600">{load.program_type || 'No program type'} • {load.hours_per_day ?? 'N/A'} hrs/day</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                    {loadProgressLabel(load)}
                  </span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">
                    {loadApprovalLabel(load)}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Schedule Days</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{load.program_days ?? 'N/A'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Start Date</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(load.schedule_date || load.created_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </button>
      )
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-800 to-blue-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC - NCR</p>
        <h1 className="mt-4 text-4xl font-black">Generate Report</h1>
        <p className="mt-3 max-w-2xl text-cyan-50/90">
          Select a trainer, review all assigned loads, and export an A4 PDF report with the official TESDA header.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
              <Users className="h-4 w-4" />
              Select Trainer
            </div>
            <p className="mt-2 text-sm text-slate-600">Choose the trainer whose loads will be included in the report.</p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={trainerSearch}
              onChange={(event) => setTrainerSearch(event.target.value)}
              placeholder="Search trainer"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
            />
          </div>

          <div className="max-h-[24rem] space-y-3 overflow-y-auto pr-1">
            {trainerListContent}
          </div>
        </div>

        <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                <FileText className="h-4 w-4" />
                Load Selection
              </div>
              <h2 className="mt-2 text-2xl font-black text-slate-900">{selectedTrainer ? selectedTrainerName : 'No trainer selected'}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {loadingLoads ? 'Loading assigned loads...' : `${selectedLoads.length} of ${loads.length} loads selected for export.`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAllSelected(true)}
                disabled={loads.length === 0}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setAllSelected(false)}
                disabled={loads.length === 0}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={openSignatureDialog}
                disabled={generating || loadingLoads || !selectedTrainer || selectedLoads.length === 0}
                className="inline-flex items-center rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-sky-900/20 transition hover:from-sky-700 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Generate PDF
              </button>
            </div>
          </div>

          <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {loadListContent}
          </div>
        </div>
      </section>

      {signatureDialogOpen && (
        <ModalShell title="Digital Signatures" onClose={() => setSignatureDialogOpen(false)} maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Saved signatures found: {Object.keys(availableSignatures).length}</p>
              <p className="mt-1 text-xs text-slate-500">
                Saved admin signatures are placed on Prepared by. Saved center chief signatures are placed on Approved by.
              </p>
            </div>

            {signatureUpload?.imageData && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">New Signature Preview</p>
                <img src={signatureUpload.imageData} alt="Signature preview" className="h-20 max-w-full object-contain" />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => generateReport(availableSignatures)}
                disabled={generating || Object.keys(availableSignatures).length === 0}
                className="rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use Existing Signatures
              </button>
              <label className="inline-flex cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Upload className="mr-2 h-4 w-4" />
                Upload My Signature
                <input type="file" accept="image/png,image/jpeg" onChange={handleReportSignatureFileChange} className="hidden" />
              </label>
              <button
                type="button"
                onClick={generateWithUploadedSignature}
                disabled={generating || !signatureUpload?.imageData}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save and Generate
              </button>
              <button
                type="button"
                onClick={() => generateReport({})}
                disabled={generating}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Generate Without Digital Signatures
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
