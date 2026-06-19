import React, { useCallback, useEffect, useState } from 'react'
import { Activity, AlertCircle, Mail, Reply, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ModalShell from '../components/ModalShell'
import { cacheManager } from '../utils/cacheManager'
import { getSocket, registerUser } from '../utils/socket'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const MANAGEMENT_TYPES = new Set(['admin', 'supervisor'])
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')

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

export default function Inbox() {
  const { user, isAuthenticated } = useAuth()
  const [trainerUsers, setTrainerUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [sentMessages, setSentMessages] = useState([])
  const [receivedMessages, setReceivedMessages] = useState([])
  const [activityUpdates, setActivityUpdates] = useState([])
  const [activeMailbox, setActiveMailbox] = useState('received')
  const [selectedMessageId, setSelectedMessageId] = useState(null)
  const [replyContent, setReplyContent] = useState('')
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [replyError, setReplyError] = useState(null)
  const [error, setError] = useState(null)

  const safeTrainerUsers = Array.isArray(trainerUsers) ? trainerUsers : []
  const currentUserId = String(user?.user_id || user?.id || '')
  const mailboxMessages = activeMailbox === 'received' ? receivedMessages : activeMailbox === 'sent' ? sentMessages : []
  const selectedMessage = activeMailbox === 'updates' ? null : mailboxMessages.find((message) => message.id === selectedMessageId) || null
  const allMessages = dedupeMessages([...receivedMessages, ...sentMessages])
  const threadMessages = buildThreadMessages(selectedMessage, allMessages)

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
        setTrainerUsers([])
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const trainerData = Array.isArray(data.data) ? data.data : []
      setTrainerUsers(trainerData)
      cacheManager.set(cacheKey, trainerData, 600000)
    } catch (loadError) {
      console.error('Failed to load trainer users:', loadError)
      setTrainerUsers([])
    }
  }, [])

  const loadMessages = useCallback(async ({ useCache = true } = {}) => {
    if (!currentUserId) return

    try {
      const cacheKey = cacheManager.generateKey('admin_messages', { user_id: currentUserId })
      if (useCache) {
        const cached = cacheManager.get(cacheKey)
        if (cached !== null) {
          setSentMessages(cached.sent || [])
          setReceivedMessages(cached.received || [])
          setError(null)
          return
        }
      }

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
        allLoadedMessages.filter((message) => {
          const senderType = String(message.sender_user_type || '').toLowerCase()
          if (senderType) {
            return !MANAGEMENT_TYPES.has(senderType)
          }

          return String(message.sender_id) !== currentUserId
        }),
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

  const loadActivityUpdates = useCallback(async ({ useCache = true } = {}) => {
    if (!currentUserId) return

    try {
      const cacheKey = cacheManager.generateKey('admin_activity_updates', { user_id: currentUserId })
      if (useCache) {
        const cached = cacheManager.get(cacheKey)
        if (cached !== null) {
          setActivityUpdates(cached)
          return
        }
      }

      const response = await fetch(`${API_BASE}/api/messages/updates?limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (response.status === 404) {
        setActivityUpdates([])
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const updates = Array.isArray(data.data) ? data.data : []
      const sortedUpdates = [...updates].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      setActivityUpdates(sortedUpdates)
      cacheManager.set(cacheKey, sortedUpdates, 60000)
    } catch (loadError) {
      console.error('Failed to load activity updates:', loadError)
      setActivityUpdates([])
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
      await Promise.all([loadTrainerUsers(), loadMessages(), loadActivityUpdates()])
      setLoading(false)
    }

    loadData()
  }, [user, loadActivityUpdates, loadMessages, loadTrainerUsers])

  useEffect(() => {
    if (activeMailbox === 'updates') {
      setSelectedMessageId(null)
      return
    }

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

    try {
      const socket = getSocket()
      if (!socket) return undefined

      registerUser(user.user_id || user.id)

      const handleMessageEvent = () => {
        loadMessages({ useCache: false })
        loadActivityUpdates({ useCache: false })
        const cacheKey = cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id })
        cacheManager.delete(cacheKey)
      }
      const handleActivityEvent = () => {
        loadActivityUpdates({ useCache: false })
        cacheManager.delete(cacheManager.generateKey('admin_activity_updates', { user_id: user.user_id || user.id }))
      }

      socket.on('new_message', handleMessageEvent)
      socket.on('message_update', handleMessageEvent)
      socket.on('activity_update', handleActivityEvent)

      return () => {
        socket.off('new_message', handleMessageEvent)
        socket.off('message_update', handleMessageEvent)
        socket.off('activity_update', handleActivityEvent)
      }
    } catch (socketError) {
      console.error('Failed to setup websocket:', socketError)
      return undefined
    }
  }, [isAuthenticated, loadActivityUpdates, loadMessages, user])

  useEffect(() => {
    if (!isAuthenticated || !user) return undefined

    const interval = setInterval(() => {
      if (!document.hidden) {
        loadMessages({ useCache: false })
        loadActivityUpdates({ useCache: false })
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [isAuthenticated, loadActivityUpdates, loadMessages, user])

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
      cacheManager.delete(cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id }))
      await loadMessages()
      setActiveMailbox('sent')
    } catch (sendError) {
      console.error('Failed to send message:', sendError)
      throw sendError
    }
  }

  const getUpdateTone = (update) => {
    if (update?.action_type === 'message_sent') {
      return 'border-cyan-100 bg-cyan-50 text-cyan-700'
    }

    return 'border-slate-200 bg-white text-slate-700'
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
      cacheManager.delete(cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id }))
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
      cacheManager.delete(cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id }))
      await loadMessages({ useCache: false })
    } catch (replyRequestError) {
      console.error('Failed to send reply:', replyRequestError)
      setReplyError(replyRequestError.message || 'Failed to send reply.')
    } finally {
      setReplySubmitting(false)
    }
  }

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message conversation? This action only hides it for you unless the other party has also deleted it.')) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete message')
      }

      // Remove from state
      setSentMessages((prev) => prev.filter((msg) => msg.id !== messageId))
      setReceivedMessages((prev) => prev.filter((msg) => msg.id !== messageId))
      
      // Clear selection
      setSelectedMessageId(null)

      // Clear cache
      cacheManager.delete(cacheManager.generateKey('admin_messages', { user_id: user.user_id || user.id }))
    } catch (err) {
      console.error('Failed to delete message:', err)
      alert(err.message || 'Failed to delete message.')
    }
  }

  const handleDeleteActivityUpdate = async (updateId) => {
    if (!window.confirm('Are you sure you want to delete this activity update?')) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/messages/updates/${updateId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete activity update')
      }

      // Remove from state
      setActivityUpdates((prev) => prev.filter((upd) => upd.id !== updateId))

      // Clear cache
      cacheManager.delete(cacheManager.generateKey('admin_activity_updates', { user_id: user.user_id || user.id }))
    } catch (err) {
      console.error('Failed to delete activity update:', err)
      alert(err.message || 'Failed to delete activity update.')
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
          <p className="text-slate-600">Please log in to access inbox.</p>
        </div>
      </div>
    )
  }

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600" />
          <p className="text-slate-600">Loading inbox...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Error Loading Inbox</h2>
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
              Manage messages from trainers and reply in a single mailbox view.
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
              <li>• Toggle between Inbox and Sent without leaving the page.</li>
              <li>• Open any message to read the full thread like an email conversation.</li>
              <li>• Reply directly from received messages so trainers get the response in the same thread.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mailbox</h2>
              <p className="mt-1 text-sm text-slate-500">One tab with toggle buttons for received and sent messages.</p>
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
              <button
                type="button"
                onClick={() => setActiveMailbox('updates')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeMailbox === 'updates'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Updates ({activityUpdates.length})
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-slate-500">Loading messages...</div>
        ) : activeMailbox === 'updates' ? (
          activityUpdates.length === 0 ? (
            <div className="py-14 text-center text-slate-500">
              <Activity className="mx-auto mb-4 h-12 w-12 text-slate-400" />
              <h3 className="mb-2 text-lg font-semibold text-slate-900">No trainer updates yet</h3>
              <p>Trainer schedule actions and messages will appear here.</p>
            </div>
          ) : (
            <div className="max-h-[34rem] space-y-3 overflow-y-auto bg-slate-50/60 p-4">
              {activityUpdates.map((update) => (
                <article key={update.id} className={`rounded-2xl border p-4 shadow-sm ${getUpdateTone(update)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{update.action_label}</p>
                      <p className="mt-1 text-sm text-slate-700">{update.details}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {formatDate(update.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteActivityUpdate(update.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                        title="Delete update"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {update.trainer_name ? <span className="rounded-full bg-white px-2 py-1">Trainer: {update.trainer_name}</span> : null}
                    {update.program_name ? <span className="rounded-full bg-white px-2 py-1">Program: {update.program_name}</span> : null}
                    {update.metadata?.day_number ? <span className="rounded-full bg-white px-2 py-1">Day {update.metadata.day_number}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : mailboxMessages.length === 0 ? (
          <div className="py-14 text-center text-slate-500">
            <Mail className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              {activeMailbox === 'received' ? 'No incoming messages' : 'No sent messages yet'}
            </h3>
            <p>
              {activeMailbox === 'received'
                ? 'Trainers will appear here when they contact management.'
                : 'Use "New Message" to start a message to a trainer.'}
            </p>
          </div>
        ) : (
          <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[360px_1fr]">
            <div className="max-h-[24rem] space-y-3 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-3 lg:max-h-[34rem]">
              {mailboxMessages.map((message) => {
                const unread = activeMailbox === 'received' && message.status === 'unread'
                const selected = message.id === selectedMessageId
                const listLabel = activeMailbox === 'received'
                  ? (message.sender_name || message.sender_username || 'Trainer')
                  : (message.recipient_name || message.recipient_username || 'Trainer')

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
                              ? (selectedMessage.sender_name || selectedMessage.sender_username || 'Trainer')
                              : (selectedMessage.recipient_name || selectedMessage.recipient_username || 'Trainer')}
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
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(selectedMessage.id)}
                          className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="Delete message thread"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 max-h-[22rem] space-y-4 overflow-y-auto pr-1">
                      {threadMessages.map((message) => {
                        const isOwnMessage = String(message.sender_id) === currentUserId
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
                                <p className="text-sm font-semibold text-slate-900">
                                  {isOwnMessage
                                    ? (message.sender_name || message.sender_username || 'You')
                                    : (message.sender_name || message.sender_username || 'Trainer')}
                                </p>
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
                          <p className="text-xs text-slate-500">This reply will be sent in the same conversation thread.</p>
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
          trainerUsers={safeTrainerUsers}
        />
      ) : null}
    </div>
  )
}

function ComposeMessageModal({ onClose, onSend, trainerUsers }) {
  const [formData, setFormData] = useState({
    recipient_id: '',
    subject: '',
    content: '',
    message_type: 'other',
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
    <ModalShell title="Send Message to Trainer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            To Trainer
          </label>
          <select
            value={formData.recipient_id}
            onChange={(event) => setFormData({ ...formData, recipient_id: event.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            required
          >
            <option value="">Select trainer...</option>
            {trainerUsers.map((trainer) => (
              <option key={trainer.id} value={trainer.user_id}>
                {trainer.trainer_name || trainer.full_name || trainer.username}
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
            placeholder="Brief subject of your message"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Category
            </label>
            <select
              value={formData.message_type}
              onChange={(event) => setFormData({ ...formData, message_type: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            >
              <option value="other">Other</option>
              <option value="inquiry">Inquiry</option>
              <option value="report">Report</option>
              <option value="issue">Issue</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(event) => setFormData({ ...formData, priority: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Message
          </label>
          <textarea
            value={formData.content}
            onChange={(event) => setFormData({ ...formData, content: event.target.value })}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-black focus:border-cyan-400 focus:outline-none"
            rows={6}
            required
            placeholder="Type your message here..."
          />
        </div>

        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

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
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
