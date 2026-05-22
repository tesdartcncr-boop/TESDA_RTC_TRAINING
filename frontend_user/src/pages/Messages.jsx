import React, { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Mail, Reply, Send, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const FALLBACK_ADMINS = [
  { id: 1, full_name: 'System Administrator', user_type: 'admin', email: 'admin@rtc.local' },
  { id: 2, full_name: 'Supervisor', user_type: 'supervisor', email: 'supervisor@rtc.local' },
]
const getToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')

const sortMessages = (messages, prioritizeUnread = false) => {
  return [...messages].sort((a, b) => {
    if (prioritizeUnread) {
      const aUnread = a.status === 'unread' ? 0 : 1
      const bUnread = b.status === 'unread' ? 0 : 1
      if (aUnread !== bUnread) return aUnread - bUnread
    }

    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })
}

const dedupeMessages = (messages) => Array.from(new Map(messages.map((message) => [message.id, message])).values())

const getThreadRootId = (message, messageMap) => {
  if (!message) return null

  let currentMessage = message
  const seenIds = new Set()

  while (currentMessage?.reply_to_id && !seenIds.has(currentMessage.id)) {
    seenIds.add(currentMessage.id)
    const parentMessage = messageMap.get(currentMessage.reply_to_id)
    if (!parentMessage) break
    currentMessage = parentMessage
  }

  return currentMessage?.id ?? message.id
}

const buildThreadMessages = (selectedMessage, messages) => {
  if (!selectedMessage) return []

  const uniqueMessages = dedupeMessages(messages)
  const messageMap = new Map(uniqueMessages.map((message) => [message.id, message]))
  const threadRootId = getThreadRootId(selectedMessage, messageMap)

  const threadMessages = uniqueMessages
    .filter((message) => getThreadRootId(message, messageMap) === threadRootId)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())

  return threadMessages.length > 0 ? threadMessages : [selectedMessage]
}

export default function Messages() {
  const { user, isAuthenticated } = useAuth()
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [sentMessages, setSentMessages] = useState([])
  const [receivedMessages, setReceivedMessages] = useState([])
  const [activeMailbox, setActiveMailbox] = useState('received')
  const [selectedMessageId, setSelectedMessageId] = useState(null)
  const [replyContent, setReplyContent] = useState('')
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [replyError, setReplyError] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const safeAdminUsers = Array.isArray(adminUsers) ? adminUsers : []
  const currentUserId = String(user?.user_id || user?.id || '')
  const mailboxMessages = activeMailbox === 'received' ? receivedMessages : sentMessages
  const selectedMessage = mailboxMessages.find((message) => message.id === selectedMessageId) || null
  const allMessages = dedupeMessages([...receivedMessages, ...sentMessages])
  const threadMessages = buildThreadMessages(selectedMessage, allMessages)

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

      if (response.status === 404) {
        setAdminUsers(FALLBACK_ADMINS)
        setNotice('Messaging is using fallback administrators while the directory endpoint is unavailable.')
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const nextAdminUsers = Array.isArray(data) ? data : []
      setAdminUsers(nextAdminUsers)
      setNotice(null)
      cacheManager.set(cacheKey, nextAdminUsers, 600000)
    } catch (loadError) {
      console.error('Failed to load admin users:', loadError)
      setAdminUsers(FALLBACK_ADMINS)
      setNotice('Messaging is using fallback administrators right now.')
    }
  }, [])

  const loadMessages = useCallback(async () => {
    if (!currentUserId) return

    try {
      const cacheKey = cacheManager.generateKey('trainer_messages', { user_id: currentUserId })
      const response = await fetch(`${API_BASE}/api/messages?limit=100&status=all`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (response.status === 404) {
        setSentMessages([])
        setReceivedMessages([])
        setError(null)
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const allLoadedMessages = Array.isArray(data.data) ? data.data : []

      const nextSentMessages = sortMessages(
        allLoadedMessages.filter((message) => String(message.sender_id) === currentUserId)
      )
      const nextReceivedMessages = sortMessages(
        allLoadedMessages.filter((message) => String(message.recipient_id) === currentUserId),
        true
      )

      setSentMessages(nextSentMessages)
      setReceivedMessages(nextReceivedMessages)
      setError(null)
      cacheManager.set(cacheKey, { sent: nextSentMessages, received: nextReceivedMessages })
    } catch (loadError) {
      console.error('Failed to load messages:', loadError)
      setSentMessages([])
      setReceivedMessages([])
      setError('Failed to load messages.')
    }
  }, [currentUserId])

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      await Promise.all([loadAdminUsers(), loadMessages()])
      setLoading(false)
    }

    loadData()
  }, [user, loadAdminUsers, loadMessages])

  useEffect(() => {
    if (mailboxMessages.length === 0) {
      setSelectedMessageId(null)
      return
    }

    const selectedStillVisible = mailboxMessages.some((message) => message.id === selectedMessageId)
    if (selectedStillVisible) return

    const firstUnreadMessage = activeMailbox === 'received'
      ? mailboxMessages.find((message) => message.status === 'unread')
      : null

    setSelectedMessageId((firstUnreadMessage || mailboxMessages[0]).id)
  }, [activeMailbox, mailboxMessages, selectedMessageId])

  useEffect(() => {
    setReplyContent('')
    setReplyError(null)
  }, [activeMailbox, selectedMessageId])

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined

    const interval = setInterval(() => {
      if (!document.hidden) {
        loadMessages()
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [isAuthenticated, loadMessages, user])

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined

    try {
      const socket = getSocket()
      if (!socket) return undefined

      registerUser(user.user_id || user.id)

      const handleMessageEvent = () => {
        const cacheKey = cacheManager.generateKey('trainer_messages', { user_id: user.user_id || user.id })
        cacheManager.delete(cacheKey)
        loadMessages()
      }

      socket.on('new_message', handleMessageEvent)
      socket.on('message_update', handleMessageEvent)

      return () => {
        socket.off('new_message', handleMessageEvent)
        socket.off('message_update', handleMessageEvent)
      }
    } catch (socketError) {
      console.error('Failed to setup websocket:', socketError)
      return undefined
    }
  }, [isAuthenticated, loadMessages, user])

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

      if (!response.ok) {
        const responseData = await response.json().catch(() => ({}))
        throw new Error(responseData.detail || 'Failed to send message')
      }

      setShowComposeModal(false)
      cacheManager.delete(cacheManager.generateKey('trainer_messages', { user_id: user.user_id || user.id }))
      await loadMessages()
      setActiveMailbox('sent')
    } catch (sendError) {
      console.error('Failed to send message:', sendError)
      throw sendError
    }
  }

  const handleMessageSelect = async (message) => {
    setSelectedMessageId(message.id)
    setReplyError(null)

    if (activeMailbox !== 'received' || message.status !== 'unread') return

    try {
      const response = await fetch(`${API_BASE}/api/messages/${message.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ status: 'read' }),
      })

      if (!response.ok) {
        throw new Error(`Failed to mark message as read: ${response.status}`)
      }

      setReceivedMessages((previousMessages) =>
        sortMessages(
          previousMessages.map((item) => (
            item.id === message.id
              ? { ...item, status: 'read', read_at: item.read_at || new Date().toISOString() }
              : item
          )),
          true
        )
      )
    } catch (markReadError) {
      console.error('Failed to mark message as read:', markReadError)
    }
  }

  const handleReplySubmit = async () => {
    if (!selectedMessage || !replyContent.trim()) return

    setReplySubmitting(true)
    setReplyError(null)

    try {
      const response = await fetch(`${API_BASE}/api/messages/${selectedMessage.id}/reply`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          content: replyContent.trim(),
          priority: selectedMessage.priority || 'normal',
        }),
      })

      if (!response.ok) {
        const responseData = await response.json().catch(() => ({}))
        throw new Error(responseData.detail || 'Failed to send reply')
      }

      setReplyContent('')
      cacheManager.delete(cacheManager.generateKey('trainer_messages', { user_id: user.user_id || user.id }))
      await loadMessages()
    } catch (replyRequestError) {
      console.error('Failed to send reply:', replyRequestError)
      setReplyError(replyRequestError.message || 'Failed to send reply.')
    } finally {
      setReplySubmitting(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''

    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-100'
      case 'high':
        return 'text-orange-600 bg-orange-100'
      case 'normal':
        return 'text-blue-600 bg-blue-100'
      case 'low':
        return 'text-gray-600 bg-gray-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Authentication Required</h2>
          <p className="text-slate-600">Please log in to access messages.</p>
        </div>
      </div>
    )
  }

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600" />
          <p className="text-slate-600">Loading messages...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Error Loading Messages</h2>
          <p className="mb-4 text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-800 to-blue-700 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.25)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100">TESDA RTC - NCR</p>
            <h1 className="mt-4 flex items-center gap-3 text-4xl font-black">
              <Mail className="h-8 w-8" />
              Messages
            </h1>
            <p className="mt-3 max-w-2xl text-cyan-50/90">
              Send messages to administrators and keep replies in the same conversation thread.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowComposeModal(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-cyan-600 transition hover:bg-cyan-50"
          >
            <Send className="h-4 w-4" />
            New Message
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-cyan-600" />
          <div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900">How to Use Messages</h3>
            <ul className="space-y-1 text-sm text-slate-600">
              <li>• Use the toggle buttons to move between Inbox and Sent on one screen.</li>
              <li>• Open a message to read the full email-style conversation thread.</li>
              <li>• Reply directly from received admin messages to keep the discussion together.</li>
            </ul>
          </div>
        </div>
      </section>

      {notice ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900 shadow-sm">
          {notice}
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Available Administrators</h2>
        {loading && safeAdminUsers.length === 0 ? (
          <div className="py-4 text-center text-slate-500">
            <div className="mx-auto mb-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600" />
            Loading administrators...
          </div>
        ) : safeAdminUsers.length === 0 ? (
          <div className="py-4 text-center text-slate-500">No administrators available</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {safeAdminUsers.map((admin) => (
              <div key={admin.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100">
                    <User className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{admin.full_name || admin.username || 'Administrator'}</h4>
                    <p className="text-sm capitalize text-slate-600">{admin.user_type}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mailbox</h2>
              <p className="mt-1 text-sm text-slate-500">Inbox and Sent are now in one tab with toggle buttons.</p>
            </div>

            <div className="inline-flex rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveMailbox('received')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeMailbox === 'received'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Inbox ({receivedMessages.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveMailbox('sent')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeMailbox === 'sent'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Sent ({sentMessages.length})
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-slate-500">Loading messages...</div>
        ) : mailboxMessages.length === 0 ? (
          <div className="py-14 text-center text-slate-500">
            <Mail className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              {activeMailbox === 'received' ? 'No incoming messages' : 'No sent messages yet'}
            </h3>
            <p>
              {activeMailbox === 'received'
                ? 'Administrator replies will appear here.'
                : 'Use "New Message" to contact management.'}
            </p>
          </div>
        ) : (
          <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[360px_1fr]">
            <div className="max-h-[680px] space-y-3 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-3">
              {mailboxMessages.map((message) => {
                const unread = activeMailbox === 'received' && message.status === 'unread'
                const selected = message.id === selectedMessageId
                const listLabel = activeMailbox === 'received'
                  ? (message.sender_name || message.sender_username || 'Administrator')
                  : (message.recipient_name || message.recipient_username || 'Administrator')

                return (
                  <button
                    type="button"
                    key={message.id}
                    onClick={() => handleMessageSelect(message)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      unread
                        ? 'border-cyan-200 bg-white shadow-sm hover:border-cyan-300'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } ${selected ? 'ring-2 ring-cyan-300 border-cyan-300' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{listLabel}</p>
                        <p className="truncate text-sm font-semibold text-slate-800">{message.subject || '(No subject)'}</p>
                      </div>
                      {unread ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-600" /> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">{message.content}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getPriorityColor(message.priority)}`}>
                        {message.priority || 'normal'}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">{formatDate(message.created_at)}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="p-6">
              {selectedMessage ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{selectedMessage.subject || '(No subject)'}</h3>
                        <p className="mt-2 text-sm text-slate-600">
                          {activeMailbox === 'received' ? 'From' : 'To'}:{' '}
                          <span className="font-semibold text-slate-800">
                            {activeMailbox === 'received'
                              ? (selectedMessage.sender_name || selectedMessage.sender_username || 'Administrator')
                              : (selectedMessage.recipient_name || selectedMessage.recipient_username || 'Administrator')}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs ${getPriorityColor(selectedMessage.priority)}`}>
                          {selectedMessage.priority || 'normal'}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {selectedMessage.status || 'sent'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      {threadMessages.map((message) => {
                        const isOwnMessage = String(message.sender_id) === currentUserId
                        const messageLabel = isOwnMessage
                          ? (user?.trainer_name || user?.full_name || user?.username || 'You')
                          : (message.sender_name || message.sender_username || 'Administrator')

                        return (
                          <div key={message.id} className={isOwnMessage ? 'pl-8' : 'pr-8'}>
                            <article
                              className={`rounded-2xl border p-4 ${
                                isOwnMessage
                                  ? 'border-cyan-100 bg-cyan-50'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">{messageLabel}</p>
                                <span className="text-xs text-slate-500">{formatDate(message.created_at)}</span>
                              </div>
                              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-black">
                                {message.content || 'No content available.'}
                              </p>
                            </article>
                          </div>
                        )
                      })}
                    </div>

                    {activeMailbox === 'received' ? (
                      <div className="mt-6 border-t border-slate-200 pt-5">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Reply className="h-4 w-4" />
                          Reply
                        </div>

                        <textarea
                          value={replyContent}
                          onChange={(event) => setReplyContent(event.target.value)}
                          rows={5}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-black focus:border-cyan-400 focus:outline-none"
                          placeholder="Write your reply here..."
                        />

                        {replyError ? <p className="mt-2 text-sm text-red-600">{replyError}</p> : null}

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">Your reply will stay in the same message thread.</p>
                          <button
                            type="button"
                            onClick={handleReplySubmit}
                            disabled={replySubmitting || !replyContent.trim()}
                            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {replySubmitting ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
                  <div>
                    <Mail className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                    <p>Select a message to read the conversation.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {showComposeModal ? (
        <ComposeMessageModal
          onClose={() => setShowComposeModal(false)}
          onSend={handleSendMessage}
          adminUsers={safeAdminUsers}
          currentTrainer={user}
        />
      ) : null}
    </div>
  )
}

function ComposeMessageModal({ onClose, onSend, adminUsers, currentTrainer }) {
  const [formData, setFormData] = useState({
    recipient_id: '',
    subject: '',
    content: '',
    message_type: 'issue',
    priority: 'normal',
  })
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setSubmitError(null)

    try {
      await onSend(formData)
      onClose()
    } catch (sendError) {
      setSubmitError(sendError.message || 'Failed to send message.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Send Message to Administrator" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            To Administrator
          </label>
          <select
            value={formData.recipient_id}
            onChange={(event) => setFormData({ ...formData, recipient_id: event.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            required
          >
            <option value="">Select administrator...</option>
            {adminUsers.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {(admin.full_name || admin.username || 'Administrator')} ({admin.user_type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Subject
          </label>
          <input
            type="text"
            value={formData.subject}
            onChange={(event) => setFormData({ ...formData, subject: event.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            required
            placeholder="Brief description of your issue or inquiry"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Message Type
            </label>
            <select
              value={formData.message_type}
              onChange={(event) => setFormData({ ...formData, message_type: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            >
              <option value="issue">Issue</option>
              <option value="inquiry">Inquiry</option>
              <option value="report">Report</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Priority Level
            </label>
            <select
              value={formData.priority}
              onChange={(event) => setFormData({ ...formData, priority: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            >
              <option value="low">Low - General inquiry</option>
              <option value="normal">Normal - Standard issue</option>
              <option value="high">High - Important issue</option>
              <option value="urgent">Urgent - Emergency</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Message Details
          </label>
          <textarea
            value={formData.content}
            onChange={(event) => setFormData({ ...formData, content: event.target.value })}
            rows={6}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            required
            placeholder="Please provide detailed information about your issue or inquiry."
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            <strong>From:</strong> {currentTrainer?.trainer_name || currentTrainer?.full_name || currentTrainer?.username}
            {currentTrainer?.email ? ` (${currentTrainer.email})` : ''}
          </p>
        </div>

        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

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
            className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : (
              <>
                <Send className="h-4 w-4" />
                Send Message
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
