import React, { useEffect, useState } from 'react'
import { Bell, Mail, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')

export default function MessageNotifications() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const [recentMessages, setRecentMessages] = useState([])
  const [loading, setLoading] = useState(false)

  // Load unread count
  const loadUnreadCount = async () => {
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
  }

  // Load recent messages
  const loadRecentMessages = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/messages?limit=5&status=unread`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await response.json()
      const inboxMessages = (data.data || []).filter((message) => {
        const senderType = String(message.sender_user_type || '').toLowerCase()
        return senderType !== 'admin' && senderType !== 'supervisor'
      })
      setRecentMessages(inboxMessages)
    } catch (error) {
      console.error('Failed to load recent messages:', error)
      setRecentMessages([])
    } finally {
      setLoading(false)
    }
  }

  // Handle message click
  const handleMessageClick = async (messageId) => {
    try {
      // Mark as read
      await fetch(`${API_BASE}/api/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ status: 'read' }),
      })
      
      // Update counts
      setUnreadCount(prev => Math.max(0, prev - 1))
      setRecentMessages(prev => prev.filter(msg => msg.id !== messageId))
      
      // Navigate to inbox
      window.location.href = '/inbox'
    } catch (error) {
      console.error('Failed to mark message as read:', error)
    }
  }

  // Toggle dropdown
  const toggleDropdown = () => {
    if (!showDropdown) {
      loadRecentMessages()
    }
    setShowDropdown(!showDropdown)
  }

  // Auto-refresh unread count every 30 seconds
  useEffect(() => {
    loadUnreadCount()
    const interval = setInterval(loadUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.message-notifications')) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDropdown])

  return (
    <div className="message-notifications relative">
      <button
        type="button"
        onClick={toggleDropdown}
        className="relative rounded-xl p-2 text-slate-200 hover:bg-white/10 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Messages</h3>
              <button
                type="button"
                onClick={() => setShowDropdown(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-slate-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 mx-auto mb-2" />
                Loading...
              </div>
            ) : recentMessages.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                <Mail className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm">No new messages</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentMessages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => handleMessageClick(message.id)}
                    className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-4 w-4 text-cyan-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {message.sender_name}
                          </p>
                          <span className="text-xs text-slate-500">
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-900 truncate mb-1">
                          {message.subject}
                        </p>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200">
            <a
              href="/inbox"
              className="block w-full text-center rounded-lg bg-cyan-600 text-white px-3 py-2 text-sm font-semibold hover:bg-cyan-700 transition-colors"
              onClick={() => setShowDropdown(false)}
            >
              View All Messages
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
