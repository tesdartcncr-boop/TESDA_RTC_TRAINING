import React, { useEffect, useState, useCallback } from 'react'
import { Mail, Send, Reply, Trash2, Search, Filter, Bell, User, Clock, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = 'http://localhost:5000'
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')
const PAGE_SIZE = 20

export default function Inbox() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [showReplyModal, setShowReplyModal] = useState(false)
  const [replyToMessage, setReplyToMessage] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])

  // Load messages
  const loadMessages = useCallback(async (page = 1, status = 'all') => {
    try {
      const cacheKey = cacheManager.generateKey('admin_messages', { page, status })
      const cached = cacheManager.get(cacheKey)
      if (cached !== null) {
        setMessages(cached.data)
        setTotalPages(cached.totalPages)
        setCurrentPage(cached.currentPage)
        return
      }

      const response = await fetch(`${API_BASE}/api/messages?page=${page}&limit=${PAGE_SIZE}&status=${status}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      setMessages(data.data || [])
      setTotalPages(data.totalPages || 0)
      setCurrentPage(data.currentPage || 1)
      cacheManager.set(cacheKey, { data: data.data || [], totalPages: data.totalPages || 0, currentPage: data.currentPage || 1 }, 300000)
    } catch (error) {
      console.error('Failed to load messages:', error)
      setMessages([])
    }
  }, [])

  // Load unread count
  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/messages/unread-count`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      setUnreadCount(data.count || 0)
    } catch (error) {
      console.error('Failed to load unread count:', error)
      setUnreadCount(0)
    }
  }, [])

  // Load admin users
  const loadAdminUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin-users`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      setAdminUsers(data || [])
    } catch (error) {
      console.error('Failed to load admin users:', error)
      setAdminUsers([])
    }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        loadMessages(1, statusFilter),
        loadUnreadCount(),
        loadAdminUsers()
      ])
      setLoading(false)
    }
    loadData()
  }, [loadMessages, loadUnreadCount, loadAdminUsers, statusFilter])

  // Handle message selection
  const handleMessageSelect = async (message) => {
    try {
      const response = await fetch(`${API_BASE}/api/messages/${message.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      setSelectedMessage(data)
      
      // Update unread count
      if (message.status === 'unread') {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Failed to load message:', error)
    }
  }

  // Handle reply
  const handleReply = (message) => {
    setReplyToMessage(message)
    setShowReplyModal(true)
  }

  // Handle delete
  const handleDelete = async (messageId) => {
    try {
      const response = await fetch(`${API_BASE}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (response.ok) {
        await loadMessages(currentPage, statusFilter)
        await loadUnreadCount()
        if (selectedMessage?.id === messageId) {
          setSelectedMessage(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete message:', error)
    }
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
        await loadMessages(currentPage, statusFilter)
        await loadUnreadCount()
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  // Handle reply
  const handleSendReply = async (replyData) => {
    try {
      const response = await fetch(`${API_BASE}/api/messages/${replyToMessage.id}/reply`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(replyData),
      })
      if (response.ok) {
        setShowReplyModal(false)
        setReplyToMessage(null)
        await loadMessages(currentPage, statusFilter)
        if (selectedMessage?.id === replyToMessage.id) {
          setSelectedMessage(null)
        }
      }
    } catch (error) {
      console.error('Failed to send reply:', error)
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
      case 'replied': return <Reply className="h-4 w-4 text-green-600" />
      default: return <Mail className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <section className="rounded-[1.5rem] sm:rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-800 to-blue-700 p-4 sm:p-6 lg:p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC NCR</p>
            <h1 className="mt-2 sm:mt-4 text-2xl sm:text-3xl lg:text-4xl font-black flex items-center gap-2 sm:gap-3 flex-wrap">
              <Mail className="h-6 w-6 sm:h-8 sm:w-8" />
              Inbox
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs sm:text-sm px-2 py-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-cyan-50/90 max-w-2xl">
              Manage messages from trainers regarding issues and inquiries.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowComposeModal(true)}
            className="rounded-xl bg-white text-cyan-600 px-3 py-2 sm:px-4 sm:py-2 text-sm font-semibold hover:bg-cyan-50 transition flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            <Send className="h-4 w-4" />
            Compose
          </button>
        </div>
      </section>

      {/* Controls */}
      <section className="rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
                loadMessages(1, e.target.value)
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="all">All Messages</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="replied">Replied</option>
            </select>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm focus:border-cyan-400 focus:outline-none lg:w-80"
            />
          </div>
        </div>
      </section>

      {/* Messages List */}
      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            <Mail className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No messages</h3>
            <p>Your inbox is empty.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            {/* Message List */}
            <div className="border-r border-slate-200 p-4 space-y-2 max-h-[600px] overflow-y-auto">
              {messages
                .filter(msg => 
                  !searchTerm || 
                  msg.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  msg.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  msg.sender_name.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((message) => (
                  <div
                    key={message.id}
                    onClick={() => handleMessageSelect(message)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      selectedMessage?.id === message.id
                        ? 'border-cyan-400 bg-cyan-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    } ${message.status === 'unread' ? 'font-semibold' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(message.status)}
                          <span className="text-sm text-slate-900 truncate">
                            {message.sender_name}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(message.priority)}`}>
                            {message.priority}
                          </span>
                        </div>
                        <h4 className="text-sm text-slate-900 truncate mb-1">
                          {message.subject}
                        </h4>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {message.content}
                        </p>
                      </div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(message.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Message Detail */}
            <div className="p-6">
              {selectedMessage ? (
                <div className="space-y-6">
                  <div className="border-b border-slate-200 pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-slate-900">
                        {selectedMessage.subject}
                      </h2>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(selectedMessage.priority)}`}>
                          {selectedMessage.priority}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleReply(selectedMessage)}
                          className="rounded-xl bg-cyan-600 text-white px-3 py-1 text-sm font-semibold hover:bg-cyan-700 transition flex items-center gap-1"
                        >
                          <Reply className="h-3 w-3" />
                          Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(selectedMessage.id)}
                          className="rounded-xl bg-red-600 text-white px-3 py-1 text-sm font-semibold hover:bg-red-700 transition flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>From: {selectedMessage.sender_name} ({selectedMessage.sender_username})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{formatDate(selectedMessage.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="prose prose-slate max-w-none">
                    <p className="whitespace-pre-wrap text-slate-700">
                      {selectedMessage.content}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 py-12">
                  <Mail className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Select a message</h3>
                  <p>Choose a message from the list to view its contents.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              const newPage = currentPage - 1
              setCurrentPage(newPage)
              loadMessages(newPage, statusFilter)
            }}
            disabled={currentPage === 1}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="flex items-center px-3 py-2 text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => {
              const newPage = currentPage + 1
              setCurrentPage(newPage)
              loadMessages(newPage, statusFilter)
            }}
            disabled={currentPage === totalPages}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Compose Modal */}
      {showComposeModal && (
        <ComposeMessageModal
          onClose={() => setShowComposeModal(false)}
          onSend={handleSendMessage}
          adminUsers={adminUsers}
        />
      )}

      {/* Reply Modal */}
      {showReplyModal && replyToMessage && (
        <ReplyMessageModal
          onClose={() => {
            setShowReplyModal(false)
            setReplyToMessage(null)
          }}
          onReply={handleSendReply}
          originalMessage={replyToMessage}
        />
      )}
    </div>
  )
}

// Compose Message Modal
function ComposeMessageModal({ onClose, onSend, adminUsers }) {
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
    <ModalShell title="Compose Message" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Recipient
          </label>
          <select
            value={formData.recipient_id}
            onChange={(e) => setFormData({ ...formData, recipient_id: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            required
          >
            <option value="">Select recipient...</option>
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
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Type
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
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
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
            rows={6}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none resize-none"
            required
          />
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
            Send
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// Reply Message Modal
function ReplyMessageModal({ onClose, onReply, originalMessage }) {
  const [replyData, setReplyData] = useState({
    content: ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onReply(replyData)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title={`Reply to: ${originalMessage.subject}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-600 mb-2">
            <strong>From:</strong> {originalMessage.sender_name}
          </div>
          <div className="text-sm text-slate-600">
            <strong>Original Message:</strong>
          </div>
          <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
            {originalMessage.content}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Your Reply
          </label>
          <textarea
            value={replyData.content}
            onChange={(e) => setReplyData({ ...replyData, content: e.target.value })}
            rows={6}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none resize-none"
            required
            placeholder="Type your reply here..."
          />
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
            Send Reply
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
