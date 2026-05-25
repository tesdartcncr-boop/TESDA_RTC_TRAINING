import React, { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Mail, Pencil, Save, ShieldCheck, User, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')

const isExpiredDate = (value) => {
  if (!value) return false
  const dateOnly = String(value).split('T')[0]
  const expiryDate = new Date(`${dateOnly}T00:00:00`)
  if (Number.isNaN(expiryDate.getTime())) return false
  expiryDate.setHours(23, 59, 59, 999)
  return expiryDate.getTime() < Date.now()
}

export default function Profile() {
  const { user, updateProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [qualifications, setQualifications] = useState([])
  const form = useForm()

  useEffect(() => {
    form.reset({
      trainer_name: user?.trainer_name || '',
      sex: user?.sex || '',
      first_name: user?.first_name || '',
      middle_name: user?.middle_name || '',
      last_name: user?.last_name || '',
      extension: user?.extension || '',
      trainer_type: user?.trainer_type || '',
      ctpr_recognition_number: user?.ctpr_recognition_number || '',
    })
  }, [user])

  useEffect(() => {
    const loadQualifications = async () => {
      if (!user?.id) return
      const trainerId = user.trainer_id || user.id
      const response = await fetch(`${API_BASE}/api/trainers/${trainerId}/qualifications`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextQualifications = data.data || []
      setQualifications(nextQualifications)
    }
    loadQualifications()
  }, [user?.id, user?.trainer_id])

  const qualificationGroups = useMemo(() => {
    const active = []
    const expired = []

    for (const qualification of qualifications) {
      if (isExpiredDate(qualification?.nttc_expiration)) {
        expired.push(qualification)
      } else {
        active.push(qualification)
      }
    }

    return { active, expired }
  }, [qualifications])

  const isTmcExpired = isExpiredDate(user?.tm_expiration)
  let tmcStatus = 'Not set'
  if (user?.tm_number) {
    tmcStatus = isTmcExpired ? 'Expired' : 'Active'
  }

  const profileSummary = useMemo(() => ({
    activeQualifications: qualificationGroups.active.length,
    expiredQualifications: qualificationGroups.expired.length,
    qualificationTotal: qualifications.length,
  }), [qualificationGroups.active.length, qualificationGroups.expired.length, qualifications.length])

  const renderProfileField = (field) => {
    if (!isEditing || field === 'position') {
      return <p className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">{user?.[field] || 'Not set'}</p>
    }

    if (field === 'sex') {
      return (
        <select {...form.register(field)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100">
          <option value="">Select sex</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Prefer not to say">Prefer not to say</option>
        </select>
      )
    }

    return <input {...form.register(field)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" />
  }

  const handleSave = async (values) => {
    setIsLoading(true)
    try {
      const result = await updateProfile(values)
      if (result.success) {
        setIsEditing(false)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {isLoading && (
        <div className="sticky top-0 z-20 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-1.5 w-full animate-pulse bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-500" />
        </div>
      )}
      <section className="rounded-[2.25rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-cyan-900 to-blue-700 p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-white ring-1 ring-white/20 backdrop-blur">
              <User className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-100">Trainer Profile</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-white">{user?.trainer_name || user?.full_name || user?.username}</h1>
              <p className="mt-1 text-sm text-cyan-50/90">@{user?.username}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-cyan-50/90">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 ring-1 ring-white/10">
                  <Mail className="h-4 w-4" />
                  {user?.email}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 ring-1 ring-white/10">
                  <ShieldCheck className="h-4 w-4" />
                  {user?.position || 'Trainer'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[26rem]">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">TM Status</p>
              <p className="mt-2 text-xl font-black text-white">{tmcStatus}</p>
              <p className="mt-1 text-xs text-cyan-50/80">{user?.tm_number || 'No TMC number set'}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Qualifications</p>
              <p className="mt-2 text-xl font-black text-white">{profileSummary.qualificationTotal}</p>
              <p className="mt-1 text-xs text-cyan-50/80">{profileSummary.activeQualifications} active / {profileSummary.expiredQualifications} expired</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Account</p>
              <p className="mt-2 text-xl font-black text-white">{user?.trainer_type || 'Trainer'}</p>
              <p className="mt-1 text-xs text-cyan-50/80">{user?.sex || 'No sex set'}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          {isEditing ? (
            <>
              <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </button>
              <button type="button" onClick={form.handleSubmit(handleSave)} disabled={isLoading} className="inline-flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg disabled:cursor-not-allowed disabled:opacity-60">
                <Save className="mr-2 h-4 w-4" />
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg hover:bg-cyan-50">
              <Pencil className="mr-2 h-4 w-4" />
              Edit Profile
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:max-h-[32rem] lg:overflow-y-auto lg:pr-2">
          <h2 className="text-xl font-bold text-slate-900">Profile Details</h2>
          <p className="mt-2 text-sm text-slate-500">Keep your trainer information up to date for teaching load approvals and reports.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ['Trainer Name', 'trainer_name'],
              ['Sex', 'sex'],
              ['First Name', 'first_name'],
              ['Middle Name', 'middle_name'],
              ['Last Name', 'last_name'],
              ['Extension', 'extension'],
              ['Trainer Type', 'trainer_type'],
              ['Position', 'position'],
            ].map(([label, field]) => (
              <div key={field} className={field === 'trainer_name' ? 'md:col-span-2' : ''}>
                <label className="block text-sm font-semibold text-slate-700">{label}</label>
                {renderProfileField(field)}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Qualifications</h2>
            <p className="mt-2 text-sm text-slate-500">Active and expired qualifications are grouped so you can scan them quickly.</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">Active</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {qualificationGroups.active.length === 0 && <p className="text-sm text-slate-500">No active qualifications.</p>}
                  {qualificationGroups.active.map((qualification) => (
                    <span key={qualification.id} className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-bold text-emerald-700">
                      {qualification.program?.name || 'Unknown'}
                      {qualification.nttc_number ? ` • NTTC ${qualification.nttc_number}` : ''}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-600">Expired</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {qualificationGroups.expired.length === 0 && <p className="text-sm text-slate-500">No expired qualifications.</p>}
                  {qualificationGroups.expired.map((qualification) => (
                    <span key={qualification.id} className="rounded-full bg-rose-100 px-4 py-2 text-xs font-bold text-rose-700">
                      {qualification.program?.name || 'Unknown'}
                      {qualification.nttc_number ? ` • NTTC ${qualification.nttc_number}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Account Info</h2>
            <p className="mt-2 text-sm text-slate-500">Your account and TMC details used by the portal.</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <p><span className="font-semibold">Username:</span> {user?.username}</p>
              <p><span className="font-semibold">Email:</span> {user?.email}</p>
              <p><span className="font-semibold">Sex:</span> {user?.sex || 'Not set'}</p>
              <p><span className="font-semibold">Position:</span> {user?.position || 'Not set'}</p>
              <p><span className="font-semibold">TMC Level I Number:</span> {user?.tm_number || 'Not set'}</p>
              <p><span className="font-semibold">TMC Level I Status:</span> {tmcStatus}</p>
              <p><span className="font-semibold">TMC Level I Expiration:</span> {user?.tm_expiration ? user.tm_expiration.split('T')[0] : 'Not set'}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
