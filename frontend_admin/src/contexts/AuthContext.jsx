import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { jwtDecode } from 'jwt-decode'

const AuthContext = createContext()
const API_BASE = 'http://localhost:5000'
const PERSISTENT_TOKEN_KEY = 'management_token'
const SESSION_TOKEN_KEY = 'management_session_token'

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const getStoredToken = () => {
  return localStorage.getItem(PERSISTENT_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY)
}

const clearStoredToken = () => {
  localStorage.removeItem(PERSISTENT_TOKEN_KEY)
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
}

const storeToken = (token, rememberMe) => {
  clearStoredToken()
  if (rememberMe) {
    localStorage.setItem(PERSISTENT_TOKEN_KEY, token)
    return
  }
  sessionStorage.setItem(SESSION_TOKEN_KEY, token)
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/auth/me`)
      if (!['admin', 'supervisor'].includes(response.data.user_type)) {
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
    const token = getStoredToken()
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const decoded = jwtDecode(token)
      if (!decoded.exp || decoded.exp * 1000 <= Date.now()) {
        clearStoredToken()
        setLoading(false)
        return
      }
      axios.defaults.headers.common.Authorization = `Bearer ${token}`
      fetchUser()
    } catch (error) {
      clearStoredToken()
      delete axios.defaults.headers.common.Authorization
      setLoading(false)
    }
  }, [])

  const login = async (credentials, rememberMe) => {
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login`, { ...credentials, remember_me: rememberMe })
      const { access_token: accessToken, user: nextUser } = response.data

      if (!['admin', 'supervisor'].includes(nextUser?.user_type)) {
        toast.error('Use the trainer portal for trainer accounts.')
        return { success: false, error: 'Use the trainer portal for trainer accounts.' }
      }

      storeToken(accessToken, rememberMe)
      axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`
      setUser(nextUser)
      toast.success(`Welcome, ${nextUser.full_name || nextUser.username}`)
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.detail || 'Login failed'
      toast.error(message)
      return { success: false, error: message }
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
      const message = error.response?.data?.detail || 'Failed to send OTP'
      toast.error(message)
      return { success: false, error: message }
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
      const message = error.response?.data?.detail || 'Failed to reset password'
      toast.error(message)
      return { success: false, error: message }
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
