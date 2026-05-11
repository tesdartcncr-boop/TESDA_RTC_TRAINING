import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, MailCheck, Plus, Search, Trash2 } from 'lucide-react'

const AuthorizedEmails = () => {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const fetchAuthorizedEmails = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('admin_token')
      const res = await fetch('http://localhost:5000/api/admin/authorized-emails', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to fetch authorized emails')
      }

      const data = await res.json()
      setEmails(data || [])
    } catch (e) {
      setError(e.message || 'Failed to fetch authorized emails')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuthorizedEmails()
  }, [])

  const filteredEmails = useMemo(() => {
    if (!searchTerm.trim()) return emails
    const query = searchTerm.toLowerCase()
    return emails.filter((item) => (item.email || '').toLowerCase().includes(query))
  }, [emails, searchTerm])

  const handleAddEmail = async (e) => {
    e.preventDefault()
    const value = newEmail.trim().toLowerCase()
    if (!value) return

    try {
      setIsSubmitting(true)
      setError(null)

      const token = localStorage.getItem('admin_token')
      const res = await fetch('http://localhost:5000/api/admin/authorized-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: value }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to add authorized email')
      }

      setNewEmail('')
      await fetchAuthorizedEmails()
    } catch (e2) {
      setError(e2.message || 'Failed to add authorized email')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveEmail = async (emailRow) => {
    if (!window.confirm(`Remove ${emailRow.email} from authorized admin emails?`)) return

    try {
      setDeletingId(emailRow.id)
      setError(null)
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`http://localhost:5000/api/admin/authorized-emails/${emailRow.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to remove authorized email')
      }

      setEmails((prev) => prev.filter((item) => item.id !== emailRow.id))
    } catch (e3) {
      setError(e3.message || 'Failed to remove authorized email')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Authorized Emails</h1>
          <p className="text-slate-600 text-lg">Manage emails allowed to receive admin OTP login access</p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
            <div className="flex items-start">
              <AlertCircle className="text-red-500 mr-3 mt-0.5 flex-shrink-0" size={20} />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 mb-6">
          <form onSubmit={handleAddEmail} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <div className="relative">
              <MailCheck size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Add authorized email (e.g. admin@example.com)"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={16} />
              {isSubmitting ? 'Adding...' : 'Add Email'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 mb-6">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search authorized email..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-slate-600 mt-4">Loading authorized emails...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-12 text-slate-600">No authorized emails found.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredEmails.map((emailRow) => (
                <div key={emailRow.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{emailRow.email}</p>
                    <p className="text-xs text-slate-500">ID: {emailRow.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(emailRow)}
                    disabled={deletingId === emailRow.id}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    {deletingId === emailRow.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthorizedEmails
