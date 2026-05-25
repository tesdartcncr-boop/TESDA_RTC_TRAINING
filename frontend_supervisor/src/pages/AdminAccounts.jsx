import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { KeyRound, Mail, Pencil, Plus, ShieldCheck, Trash2, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('supervisor_token') || sessionStorage.getItem('supervisor_session_token')

export default function AdminAccounts() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [accountToDelete, setAccountToDelete] = useState(null)
  const roleFilter = searchParams.get('role') || (user?.user_type === 'supervisor' ? 'supervisor' : '')

  const createForm = useForm({
    defaultValues: {
      username: '',
      email: '',
      full_name: '',
      sex: '',
      position: '',
      password: '',
      user_type: roleFilter === 'supervisor' ? 'supervisor' : 'admin',
    },
  })

  const editForm = useForm({
    defaultValues: {
      email: '',
      full_name: '',
      sex: '',
      position: '',
      password: '',
      is_active: true,
    },
  })

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const cacheKey = cacheManager.generateKey('accounts_list', { role: roleFilter || null })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setAccounts(cached)
        setLoading(false)
        return
      }

      const query = roleFilter ? `?role=${encodeURIComponent(roleFilter)}` : ''
      const response = await fetch(`${API_BASE}/api/admin/accounts${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to load accounts')
      const nextAccounts = Array.isArray(data) ? data : []
      setAccounts(nextAccounts)
      cacheManager.set(cacheKey, nextAccounts)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [roleFilter])

  const handleCreate = async (values) => {
    setIsProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/admin/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(values),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to create account')
      toast.success('Account created successfully')
      cacheManager.clearPattern('accounts_list:')
      cacheManager.clearPattern('stats_')
      setShowCreateModal(false)
      createForm.reset()
      loadAccounts()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleOpenEdit = (account) => {
    setEditingAccount(account)
    editForm.reset({
      email: account.email,
      full_name: account.full_name || '',
      sex: account.sex || '',
      position: account.position || '',
      password: '',
      is_active: account.is_active,
    })
  }

  const handleUpdate = async (values) => {
    setIsProcessing(true)
    try {
      const payload = {
        email: values.email,
        full_name: values.full_name,
        sex: values.sex || null,
        position: values.position || null,
        is_active: values.is_active,
      }
      if (values.password) payload.password = values.password

      const response = await fetch(`${API_BASE}/api/admin/accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to update account')
      toast.success('Account updated successfully')
      cacheManager.clearPattern('accounts_list:')
      cacheManager.clearPattern('stats_')
      setEditingAccount(null)
      loadAccounts()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async (account) => {
    setAccountToDelete(null)
    setIsProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/api/admin/accounts/${account.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to delete account')

      toast.success('Account deleted successfully')
      cacheManager.clearPattern('accounts_list:')
      cacheManager.clearPattern('stats_')
      await loadAccounts()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const pageTitle = user?.user_type === 'supervisor' ? 'Center Chief Accounts' : 'Admin Accounts'
  const pageDescription = user?.user_type === 'supervisor'
    ? 'Review center chief accounts and manage password updates.'
    : 'Create and manage admin or center chief accounts with email-based password recovery.'

  return (
    <div className="space-y-6">
      {isProcessing && (
        <div className="sticky top-0 z-20 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-1.5 w-full animate-pulse bg-gradient-to-r from-sky-500 via-cyan-500 to-blue-500" />
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">{pageTitle}</h1>
          <p className="mt-2 text-sm text-slate-600">{pageDescription}</p>
        </div>
        {user?.user_type === 'admin' && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isProcessing}
            className="inline-flex items-center rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Account
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center text-slate-500">Loading accounts...</div>
      ) : (
        <div className="max-h-[34rem] overflow-y-auto pr-1">
          <div className="grid gap-5 xl:grid-cols-2">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  {account.user_type === 'admin' ? <ShieldCheck className="h-7 w-7" /> : <User className="h-7 w-7" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{account.user_type}</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{account.full_name || account.username}</h3>
                  <p className="text-sm text-slate-500">@{account.username}</p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Mail className="h-4 w-4" />
                    <span>{account.email}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p><span className="font-semibold text-slate-800">Sex:</span> {account.sex || 'Not set'}</p>
                    <p><span className="font-semibold text-slate-800">Position:</span> {account.position || 'Not set'}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${account.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {account.is_active ? 'Active' : 'Inactive'}
                </span>
                <button type="button" onClick={() => handleOpenEdit(account)} className="inline-flex items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setAccountToDelete(account)}
                  className="inline-flex items-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}

              {!accounts.length && (
                <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 xl:col-span-2">
                  No accounts found.
                </div>
              )}
            </div>
        </div>
      )}

      {showCreateModal && (
        <ModalShell title="Create Management Account" onClose={() => setShowCreateModal(false)} maxWidth="max-w-xl">
          <form className="space-y-4" onSubmit={createForm.handleSubmit(handleCreate)}>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Full Name</label>
              <input {...createForm.register('full_name', { required: true })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Sex</label>
              <select {...createForm.register('sex')} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">Select sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Position</label>
              <input {...createForm.register('position')} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Username</label>
              <input {...createForm.register('username', { required: true })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Email</label>
              <input type="email" {...createForm.register('email', { required: true })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Password</label>
              <input type="password" {...createForm.register('password', { required: true })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Account Role</label>
              <select {...createForm.register('user_type')} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="admin">Admin</option>
                <option value="supervisor">Center Chief</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="submit" disabled={isProcessing} className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{isProcessing ? 'Creating...' : 'Create Account'}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {editingAccount && (
        <ModalShell title="Edit Account" onClose={() => setEditingAccount(null)} maxWidth="max-w-xl">
          <form className="space-y-4" onSubmit={editForm.handleSubmit(handleUpdate)}>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Full Name</label>
              <input {...editForm.register('full_name', { required: true })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Sex</label>
              <select {...editForm.register('sex')} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">Select sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Position</label>
              <input {...editForm.register('position')} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Email</label>
              <input type="email" {...editForm.register('email', { required: true })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">New Password</label>
              <div className="relative mt-2">
                <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input type="password" {...editForm.register('password')} placeholder="Leave blank to keep current password" className="w-full rounded-2xl border border-slate-200 px-4 py-3 pl-11 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </div>
            </div>
            {user?.user_type === 'admin' && (
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" {...editForm.register('is_active')} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
                Account is active
              </label>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingAccount(null)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="submit" disabled={isProcessing} className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {isProcessing ? 'Updating...' : 'Update Account'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {accountToDelete && (
        <ModalShell title="Confirm Delete" onClose={() => setAccountToDelete(null)} maxWidth="max-w-lg">
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Delete {accountToDelete.full_name || accountToDelete.username}? This will permanently remove the account.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAccountToDelete(null)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="button" onClick={() => handleDelete(accountToDelete)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700">
                Delete
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
