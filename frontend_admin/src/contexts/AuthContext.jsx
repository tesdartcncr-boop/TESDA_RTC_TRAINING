import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { jwtDecode } from 'jwt-decode'
import { normalizeApiError } from '../utils/apiErrors'
import { disconnectSocket } from '../utils/socket'

const AuthContext = createContext()
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const PERSISTENT_TOKEN_KEY = 'management_token'
const SESSION_TOKEN_KEY = 'management_session_token'
const REQUEST_TIMEOUT_MS = 15000

axios.defaults.timeout = REQUEST_TIMEOUT_MS

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const getStoredToken = () => {
  // Try localStorage first (remember me)
  const localToken = localStorage.getItem(PERSISTENT_TOKEN_KEY)
  if (localToken) {
    console.log('Using localStorage token (remember me)')
    return localToken
  }
  
  // Try sessionStorage (session only)
  const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY)
  if (sessionToken) {
    console.log('Using sessionStorage token (session only)')
    return sessionToken
  }
  
  console.log('No token found')
  return null
}

const clearStoredToken = () => {
  disconnectSocket()
  localStorage.removeItem(PERSISTENT_TOKEN_KEY)
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  // Clear any cookies as backup
  document.cookie = `${PERSISTENT_TOKEN_KEY}=; max-age=0; path=/`
  document.cookie = `${SESSION_TOKEN_KEY}=; max-age=0; path=/`
}

const storeToken = (token, rememberMe) => {
  clearStoredToken()
  console.log('Storing token - rememberMe:', rememberMe)
  
  if (rememberMe) {
    // Store in localStorage for persistence
    localStorage.setItem(PERSISTENT_TOKEN_KEY, token)
    console.log('Token stored in localStorage (remember me)')
  } else {
    // Store in sessionStorage for session only
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    console.log('Token stored in sessionStorage (session only)')
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/auth/me`)
      if (response.data.user_type !== 'admin') {
        clearStoredToken()
        delete axios.defaults.headers.common.Authorization
        setUser(null)
        return
      }
      setUser(response.data)
    } catch (error) {
      clearStoredToken()
      delete axios.defaults.headers.common.Authorization
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      const token = getStoredToken()
      if (!token) {
        console.log('No token found during initialization')
        setLoading(false)
        return
      }

      try {
        const decoded = jwtDecode(token)
        const now = Date.now()
        const exp = decoded.exp * 1000
        console.log('Token validation - exp:', new Date(exp), 'now:', new Date(now), 'valid:', exp > now)
        
        if (!decoded.exp || exp <= now) {
          console.log('Token expired or invalid, clearing stored tokens')
          clearStoredToken()
          setLoading(false)
          return
        }
        
        console.log('Token valid, setting up authorization and fetching user')
        axios.defaults.headers.common.Authorization = `Bearer ${token}`
        await fetchUser()
      } catch (error) {
        console.error('Token validation error:', error)
        clearStoredToken()
        delete axios.defaults.headers.common.Authorization
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const login = async (credentials, rememberMe) => {
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login`, { ...credentials, remember_me: rememberMe })
      const { access_token: accessToken, user: nextUser } = response.data

      if (nextUser?.user_type !== 'admin') {
        toast.error('Only admin accounts can log in here. Center Chiefs should use the Center Chief portal.')
        return { success: false, error: 'Only admin accounts can log in here. Center Chiefs should use the Center Chief portal.' }
      }

      storeToken(accessToken, rememberMe)
      axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`
      setUser(nextUser)
      toast.success(`Welcome, ${nextUser.full_name || nextUser.username}`)
      return { success: true }
    } catch (error) {
      const apiError = normalizeApiError(error, 'Login failed')
      if (apiError.shouldToast) {
        toast.error(apiError.message)
      }
      return { success: false, error: apiError.message, kind: apiError.kind }
    }
  }

  const logout = () => {
    clearStoredToken()
    delete axios.defaults.headers.common.Authorization
    setUser(null)
    toast.success('Logged out successfully')
  }

  const requestPasswordReset = async (email) => {
    try {
      await axios.post(
        `${API_BASE}/api/auth/password-reset/request`,
        { email },
        { timeout: 30000 }
      )
      toast.success('OTP sent to your email')
      return { success: true }
    } catch (error) {
      const apiError = normalizeApiError(error, 'Failed to send OTP')
      if (apiError.shouldToast) {
        toast.error(apiError.message)
      }
      return { success: false, error: apiError.message, kind: apiError.kind }
    }
  }

  const confirmPasswordReset = async (email, otpCode, newPassword) => {
    try {
      await axios.post(`${API_BASE}/api/auth/password-reset/confirm`, {
        email,
        otp_code: otpCode,
        new_password: newPassword,
      })
      toast.success('Password updated successfully')
      return { success: true }
    } catch (error) {
      const apiError = normalizeApiError(error, 'Failed to reset password')
      if (apiError.shouldToast) {
        toast.error(apiError.message)
      }
      return { success: false, error: apiError.message, kind: apiError.kind }
    }
  }

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    fetchUser,
    requestPasswordReset,
    confirmPasswordReset,
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
