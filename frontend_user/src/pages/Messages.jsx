import React, { useEffect, useState, useCallback } from 'react'
import { Mail, Send, Search, AlertCircle, User, Clock, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')

export default function Messages() {
  const { user, isAuthenticated } = useAuth()
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [sentMessages, setSentMessages] = useState([])
  const [error, setError] = useState(null)

  // Ensure adminUsers is always an array
  const safeAdminUsers = Array.isArray(adminUsers) ? adminUsers : []

  // Load admin users
  const loadAdminUsers = useCallback(async () => {
    try {
      const cacheKey = cacheManager.generateKey('admin_users')
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setAdminUsers(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/admin-users`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      
      // Handle 404 (messaging tables not created yet)
      if (response.status === 404) {
        console.log('Messaging system not yet set up - using fallback data')
        const fallbackData = [
          { id: 1, full_name: 'System Administrator', user_type: 'admin', email: 'admin@rtc.local' },
          { id: 2, full_name: 'Supervisor', user_type: 'supervisor', email: 'supervisor@rtc.local' }
        ]
        setAdminUsers(fallbackData)
        setError('Messaging system is being set up. You can send messages, but they may not be saved until the database is configured.')
        return
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      const adminData = Array.isArray(data) ? data : []
      setAdminUsers(adminData)
      cacheManager.set(cacheKey, adminData, 600000) // 10 minutes cache
    } catch (error) {
      console.error('Failed to load admin users:', error)
      // Fallback data when API fails
      const fallbackData = [
        { id: 1, full_name: 'System Administrator', user_type: 'admin', email: 'admin@rtc.local' },
        { id: 2, full_name: 'Supervisor', user_type: 'supervisor', email: 'supervisor@rtc.local' }
      ]
      setAdminUsers(fallbackData)
      setError('Messaging system is being configured. Basic functionality is available.')
    }
  }, [])

  // Load sent messages
  const loadSentMessages = useCallback(async () => {
    if (!user?.id) {
      console.log('User not available, skipping message load')
      return
    }
    
    try {
      const cacheKey = cacheManager.generateKey('trainer_sent_messages', { trainer_id: user.id })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setSentMessages(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/messages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      
      // Handle 404 (messaging tables not created yet)
      if (response.status === 404) {
        console.log('Messaging system not yet set up - no sent messages')
        setSentMessages([])
        return
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      
      // Filter messages sent by this trainer
      const trainerMessages = (data.data || []).filter(msg => msg.sender_id === user.id)
      setSentMessages(trainerMessages)
      cacheManager.set(cacheKey, trainerMessages, 300000) // 5 minutes cache
    } catch (error) {
      console.error('Failed to load sent messages:', error)
      setSentMessages([])
      // Don't set error for sent messages, just use empty state
    }
  }, [user?.id])

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        console.log('User not loaded yet, waiting...')
        return
      }
      
      setLoading(true)
      setError(null)
      await Promise.all([
        loadAdminUsers(),
        loadSentMessages()
      ])
      setLoading(false)
    }
    
    if (user) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [user, loadAdminUsers, loadSentMessages])

  // Early return if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Authentication Required</h2>
          <p className="text-slate-600">Please log in to access messages.</p>
        </div>
      </div>
    )
  }

  // Handle send message
  const handleSendMessage = async (messageData) => {
    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(messageData),
      })
      if (response.ok) {
        setShowComposeModal(false)
        await loadSentMessages()
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100'
      case 'high': return 'text-orange-600 bg-orange-100'
      case 'normal': return 'text-blue-600 bg-blue-100'
      case 'low': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'unread': return <Mail className="h-4 w-4" />
      case 'read': return <Mail className="h-4 w-4 text-gray-400" />
      case 'replied': return <Check className="h-4 w-4 text-green-600" />
      default: return <Mail className="h-4 w-4" />
    }
  }

  // Add loading and error states at the beginning of the return
  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading messages...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Messages</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-semibold hover:bg-cyan-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-800 to-blue-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC NCR</p>
            <h1 className="mt-4 text-4xl font-black flex items-center gap-3">
              <Mail className="h-8 w-8" />
              Messages
            </h1>
            <p className="mt-3 max-w-2xl text-cyan-50/90">
              Send messages to administrators regarding issues and inquiries.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowComposeModal(true)}
            className="rounded-xl bg-white text-cyan-600 px-4 py-2 text-sm font-semibold hover:bg-cyan-50 transition flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            New Message
          </button>
        </div>
      </section>

      {/* Instructions */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-cyan-600 mt-1 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">How to Use Messages</h3>
            <ul className="space-y-1 text-sm text-slate-600">
              <li>• Send messages to administrators about training issues, schedule problems, or other concerns</li>
              <li>• Choose the appropriate priority level (Normal, High, or Urgent)</li>
              <li>• Provide clear and detailed information in your message</li>
              <li>• Track your sent messages and their status (unread, read, or replied)</li>
              <li>• Administrators will respond to your messages through the same system</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Available Administrators */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Available Administrators</h2>
        {loading && safeAdminUsers.length === 0 ? (
          <div className="text-center text-slate-500 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600 mx-auto mb-2"></div>
            Loading administrators...
          </div>
        ) : safeAdminUsers.length === 0 ? (
          <div className="text-center text-slate-500 py-4">No administrators available</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {safeAdminUsers.map((admin) => (
              <div key={admin.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{admin.full_name}</h4>
                    <p className="text-sm text-slate-600 capitalize">{admin.user_type}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sent Messages */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Your Sent Messages</h2>
        {loading ? (
          <div className="text-center text-slate-500 py-4">Loading messages...</div>
        ) : sentMessages.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <Mail className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No messages sent yet</h3>
            <p>Click "New Message" to send your first message to administrators.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sentMessages.map((message) => (
              <div key={message.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-900">{message.subject}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(message.priority)}`}>
                        {message.priority}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        {getStatusIcon(message.status)}
                        <span className="capitalize">{message.status}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-2 whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Sent: {formatDate(message.created_at)}</span>
                      </div>
                      {message.read_at && (
                        <div className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>Read: {formatDate(message.read_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Compose Modal */}
      {showComposeModal && (
        <ComposeMessageModal
          onClose={() => setShowComposeModal(false)}
          onSend={handleSendMessage}
          adminUsers={safeAdminUsers}
          currentTrainer={user}
        />
      )}
    </div>
  )
}

// Compose Message Modal for Trainers
function ComposeMessageModal({ onClose, onSend, adminUsers, currentTrainer }) {
  const [formData, setFormData] = useState({
    recipient_id: '',
    subject: '',
    content: '',
    message_type: 'issue',
    priority: 'normal'
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSend(formData)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Send Message to Administrator" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            To Administrator
          </label>
          <select
            value={formData.recipient_id}
            onChange={(e) => setFormData({ ...formData, recipient_id: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            required
          >
            <option value="">Select administrator...</option>
            {adminUsers.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.full_name} ({admin.user_type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Subject
          </label>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            required
            placeholder="Brief description of your issue or inquiry"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Message Type
            </label>
            <select
              value={formData.message_type}
              onChange={(e) => setFormData({ ...formData, message_type: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="issue">Issue</option>
              <option value="inquiry">Inquiry</option>
              <option value="report">Report</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Priority Level
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="low">Low - General inquiry</option>
              <option value="normal">Normal - Standard issue</option>
              <option value="high">High - Important issue</option>
              <option value="urgent">Urgent - Emergency</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Message Details
          </label>
          <textarea
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            rows={6}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none resize-none"
            required
            placeholder="Please provide detailed information about your issue or inquiry. Include relevant dates, program names, and any specific details that will help us assist you better."
          />
        </div>

        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-600">
            <strong>From:</strong> {currentTrainer?.trainer_name || currentTrainer?.full_name || currentTrainer?.username}
            {currentTrainer?.email && ` (${currentTrainer.email})`}
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Message
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
