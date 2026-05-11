import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Mail, Pencil, Save, User, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')

export default function Profile() {
  const { user, updateProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [qualifications, setQualifications] = useState([])
  const form = useForm()

  useEffect(() => {
    form.reset({
      trainer_name: user?.trainer_name || '',
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
      const cacheKey = cacheManager.generateKey('trainer_qualifications', { trainer_id: trainerId })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setQualifications(cached)
        return
      }
      const response = await fetch(`${API_BASE}/api/trainers/${trainerId}/qualifications`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const nextQualifications = data.data || []
      setQualifications(nextQualifications)
      cacheManager.set(cacheKey, nextQualifications)
    }
    loadQualifications()
  }, [user?.id, user?.trainer_id])

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
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-100 text-cyan-700">
              <User className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900">{user?.trainer_name || user?.full_name || user?.username}</h1>
              <p className="mt-1 text-sm text-slate-500">@{user?.username}</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Mail className="h-4 w-4" />
                <span>{user?.email}</span>
              </div>
            </div>
          </div>

          {isEditing ? (
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </button>
              <button type="button" onClick={form.handleSubmit(handleSave)} className="inline-flex items-center rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white">
                <Save className="mr-2 h-4 w-4" />
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Pencil className="mr-2 h-4 w-4" />
              Edit Profile
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Profile Details</h2>
          <div className="mt-5 grid gap-4">
            {[
              ['Trainer Name', 'trainer_name'],
              ['First Name', 'first_name'],
              ['Middle Name', 'middle_name'],
              ['Last Name', 'last_name'],
              ['Extension', 'extension'],
              ['Trainer Type', 'trainer_type'],
              ['Recognition Number', 'ctpr_recognition_number'],
            ].map(([label, field]) => (
              <div key={field}>
                <label className="block text-sm font-semibold text-slate-700">{label}</label>
                {isEditing ? (
                  <input {...form.register(field)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" />
                ) : (
                  <p className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">{user?.[field] || 'Not set'}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Qualifications</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {qualifications.length === 0 && <p className="text-sm text-slate-500">No qualifications assigned yet.</p>}
              {qualifications.map((qualification) => (
                <span key={qualification.id} className="rounded-full bg-cyan-100 px-4 py-2 text-xs font-bold text-cyan-700">
                  {qualification.program?.name || 'Unknown'}
                  {qualification.nttc_number ? ` • NTTC ${qualification.nttc_number}` : ''}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Account Info</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <p><span className="font-semibold">Username:</span> {user?.username}</p>
              <p><span className="font-semibold">Email:</span> {user?.email}</p>
              <p><span className="font-semibold">TM Number:</span> {user?.tm_number || 'Not set'}</p>
              <p><span className="font-semibold">TM Expiration:</span> {user?.tm_expiration ? user.tm_expiration.split('T')[0] : 'Not set'}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
