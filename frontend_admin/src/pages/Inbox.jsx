import React, { useEffect, useState, useCallback } from 'react'
import { Mail, Send, AlertCircle, User, Clock, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')

export default function Inbox() {
  const { user, isAuthenticated } = useAuth()
  const [trainerUsers, setTrainerUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [sentMessages, setSentMessages] = useState([])
  const [receivedMessages, setReceivedMessages] = useState([])
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Ensure trainerUsers is always an array
  const safeTrainerUsers = Array.isArray(trainerUsers) ? trainerUsers : []

  // Load trainer users
  const loadTrainerUsers = useCallback(async () => {
    try {
      const cacheKey = cacheManager.generateKey('trainers_list', { search: null })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setTrainerUsers(cached)
        return
      }

      const response = await fetch(`${API_BASE}/api/trainers/?skip=0&limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      
      if (response.status === 404) {
        console.log('Trainers endpoint not available - using empty list')
        setTrainerUsers([])
        return
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      const trainerData = (data.data && Array.isArray(data.data)) ? data.data : []
      setTrainerUsers(trainerData)
      cacheManager.set(cacheKey, trainerData, 600000) // 10 minutes cache
    } catch (error) {
      console.error('Failed to load trainer users:', error)
      setTrainerUsers([])
    }
  }, [])

  // Load all messages
  const loadMessages = useCallback(async () => {
    const authUserId = String(user?.user_id || user?.id || '')
    if (!authUserId) {
      console.log('User not available, skipping message load')
      return
    }
    
    try {
      const cacheKey = cacheManager.generateKey('admin_messages', { user_id: authUserId })
      
      const response = await fetch(`${API_BASE}/api/messages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      
      if (response.status === 404) {
        console.log('Messaging system not yet set up - no messages')
        setSentMessages([])
        setReceivedMessages([])
        return
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      
      const allMessages = Array.isArray(data.data) ? data.data : []
      const userId = authUserId

      const adminMessages = allMessages.filter((msg) => String(msg.sender_id) === userId)
      const inboxMessages = allMessages.filter((msg) => String(msg.recipient_id) === userId)

      setSentMessages(adminMessages)
      setReceivedMessages(
        inboxMessages.sort((a, b) => {
          const aUnread = a.status === 'unread' ? 0 : 1
          const bUnread = b.status === 'unread' ? 0 : 1
          if (aUnread !== bUnread) return aUnread - bUnread
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        })
      )
      // Cache the messages
      cacheManager.set(cacheKey, { sent: adminMessages, received: inboxMessages })
    } catch (error) {
      console.error('Failed to load messages:', error)
      setSentMessages([])
      setReceivedMessages([])
    }
  }, [user?.id, user?.user_id])

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        console.log('User not loaded yet, waiting...')
        return
      }
      
      setLoading(true)
      setError(null)
      await Promise.all([
        loadTrainerUsers(),
        loadMessages()
      ])
      setLoading(false)
    }
    
    if (user) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [user, loadTrainerUsers, loadMessages, refreshKey])

  // Setup websocket for real-time messages
  useEffect(() => {
    if (!isAuthenticated || !user) return

    try {
      const socket = getSocket()
      if (socket) {
        registerUser(user.user_id || user.id)
        
        // Listen for new messages
        socket.on('new_message', (messageData) => {
          console.log('New message received via websocket:', messageData)
          // Refresh messages
          loadMessages()
          // Clear cache
          const cacheKey = cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id })
          cacheManager.delete(cacheKey)
        })

        return () => {
          socket.off('new_message')
        }
      }
    } catch (error) {
      console.error('Failed to setup websocket:', error)
    }
  }, [isAuthenticated, user, loadMessages])

  // Polling as fallback
  useEffect(() => {
    if (!isAuthenticated || !user) return

    const interval = setInterval(() => {
      loadMessages()
    }, 15000)

    return () => clearInterval(interval)
  }, [isAuthenticated, user, loadMessages])

  // Early return if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Authentication Required</h2>
          <p className="text-slate-600">Please log in to access inbox.</p>
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
        // Refresh messages and clear cache
        const cacheKey = cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id })
        cacheManager.delete(cacheKey)
        await loadMessages()
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

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading inbox...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Inbox</h2>
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
              Inbox
            </h1>
            <p className="mt-3 max-w-2xl text-cyan-50/90">
              Manage messages from trainers and staff.
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

      {/* Received Messages */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Messages from Trainers</h2>
        {loading ? (
          <div className="text-center text-slate-500 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600 mx-auto mb-2"></div>
            Loading messages...
          </div>
        ) : receivedMessages.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <Mail className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No messages received</h3>
            <p>Messages from trainers will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {receivedMessages.map((message) => (
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
                        <User className="h-3 w-3" />
                        <span>From: {message.sender_name || message.sender_username || 'Trainer'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Received: {formatDate(message.created_at)}</span>
                      </div>
                    </div>
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
            <p>Click "New Message" to send your first message to a trainer.</p>
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
                        <User className="h-3 w-3" />
                        <span>To: {message.recipient_name || message.recipient_username || 'Trainer'}</span>
                      </div>
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
          trainerUsers={safeTrainerUsers}
          currentAdmin={user}
        />
      )}
    </div>
  )
}

// Compose Message Modal for Admin
function ComposeMessageModal({ onClose, onSend, trainerUsers, currentAdmin }) {
  const [formData, setFormData] = useState({
    recipient_id: '',
    subject: '',
    content: '',
    message_type: 'response',
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
    <ModalShell title="Send Message to Trainer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            To Trainer
          </label>
          <select
            value={formData.recipient_id}
            onChange={(e) => setFormData({ ...formData, recipient_id: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            style={{ color: '#000000' }}
            required
          >
            <option value="" className="text-black">Select trainer...</option>
            {trainerUsers.map((trainer) => (
              <option key={trainer.id} value={trainer.id} className="text-black">
                {trainer.first_name} {trainer.last_name}
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
            placeholder="Brief subject of your message"
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
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
              style={{ color: '#000000' }}
            >
              <option value="response" className="text-black">Response</option>
              <option value="notification" className="text-black">Notification</option>
              <option value="update" className="text-black">Update</option>
              <option value="other" className="text-black">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
              style={{ color: '#000000' }}
            >
              <option value="low" className="text-black">Low</option>
              <option value="normal" className="text-black">Normal</option>
              <option value="high" className="text-black">High</option>
              <option value="urgent" className="text-black">Urgent</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Message
          </label>
          <textarea
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none resize-none"
            rows={6}
            required
            placeholder="Type your message here..."
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
