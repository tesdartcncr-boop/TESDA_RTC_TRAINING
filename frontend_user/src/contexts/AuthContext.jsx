import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import axios from 'axios'
import toast from 'react-hot-toast'
import { jwtDecode } from 'jwt-decode'

const AuthContext = createContext()
const API_BASE = 'http://localhost:5000'
const PERSISTENT_TOKEN_KEY = 'trainer_token'
const SESSION_TOKEN_KEY = 'trainer_session_token'

const getStoredToken = () => localStorage.getItem(PERSISTENT_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY)

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
      toast.success('Password reset successful')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to reset password'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const updateProfile = async (profileData) => {
    try {
      await axios.put(`${API_BASE}/api/trainers/me/profile`, profileData)
      await fetchUser()
      toast.success('Profile updated successfully')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to update profile'
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
    updateProfile,
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
