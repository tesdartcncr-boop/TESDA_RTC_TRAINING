import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import axios from 'axios'
import toast from 'react-hot-toast'
import jwtDecode from 'jwt-decode'
import { normalizeApiError } from '../utils/apiErrors'

const AuthContext = createContext()
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const PERSISTENT_TOKEN_KEY = 'trainer_token'
const SESSION_TOKEN_KEY = 'trainer_session_token'
const REQUEST_TIMEOUT_MS = 15000

axios.defaults.timeout = REQUEST_TIMEOUT_MS

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

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = async () => {
    try {
      const userResponse = await axios.get(`${API_BASE}/api/auth/me`)
      if (userResponse.data.user_type !== 'trainer') {
        clearStoredToken()
        delete axios.defaults.headers.common.Authorization
        setUser(null)
        return
      }

      const trainerResponse = await axios.get(`${API_BASE}/api/auth/trainer/me`)
      setUser({ ...userResponse.data, ...trainerResponse.data, trainer_id: trainerResponse.data.id })
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
      const { data } = await axios.post(`${API_BASE}/api/auth/login`, { ...credentials, remember_me: rememberMe })
      if (data.user?.user_type !== 'trainer') {
        toast.error('Use the management portal for admin or supervisor accounts.')
        return { success: false, error: 'Use the management portal for admin or supervisor accounts.' }
      }

      storeToken(data.access_token, rememberMe)
      axios.defaults.headers.common.Authorization = `Bearer ${data.access_token}`

      const trainerResponse = await axios.get(`${API_BASE}/api/auth/trainer/me`)
      setUser({ ...data.user, ...trainerResponse.data, trainer_id: trainerResponse.data.id })
      toast.success('Login successful')
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
      await axios.post(`${API_BASE}/api/auth/password-reset/request`, { email })
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
      toast.success('Password reset successful')
      return { success: true }
    } catch (error) {
      const apiError = normalizeApiError(error, 'Failed to reset password')
      if (apiError.shouldToast) {
        toast.error(apiError.message)
      }
      return { success: false, error: apiError.message, kind: apiError.kind }
    }
  }

  const updateProfile = async (profileData) => {
    try {
      await axios.put(`${API_BASE}/api/trainers/me/profile`, profileData)
      await fetchUser()
      toast.success('Profile updated successfully')
      return { success: true }
    } catch (error) {
      const apiError = normalizeApiError(error, 'Failed to update profile')
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
    updateProfile,
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
