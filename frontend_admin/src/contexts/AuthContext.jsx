import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { jwtDecode } from 'jwt-decode'

const AuthContext = createContext()

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

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      try {
        // Decode token directly to restore session immediately
        const decoded = jwtDecode(token)
        // Check if token is still valid
        if (decoded.exp && decoded.exp * 1000 > Date.now()) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
          // Set user object with correct shape - map 'sub' to 'username'
          setUser({
            username: decoded.sub,
            user_type: decoded.user_type
          })
          // Try to fetch full user info in background (optional, doesn't remove token on failure)
          fetchUser()
        } else {
          // Token expired
          localStorage.removeItem('admin_token')
          delete axios.defaults.headers.common['Authorization']
        }
      } catch (error) {
        console.error('Failed to decode token:', error)
        localStorage.removeItem('admin_token')
        delete axios.defaults.headers.common['Authorization']
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  const fetchUser = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/auth/me')
      // Update with full user data if backend call succeeds
      setUser(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch user:', error)
      // DON'T remove token - it might just be a temporary backend issue
      setLoading(false)
    }
  }

  const login = async (credentials) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', credentials)
      const { access_token, user } = response.data
      
      localStorage.setItem('admin_token', access_token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
      setUser(user || null)
      
      toast.success('Login successful')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.detail || 'Login failed'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
    toast.success('Logged out successfully')
  }

  const sendOTP = async (email) => {
    try {
      await axios.post('http://localhost:5000/api/auth/send-otp', { email })
      toast.success('OTP sent to your email')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to send OTP'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const verifyOTP = async (email, otpCode) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/verify-otp', { email, otp_code: otpCode })
      const { access_token, user } = response.data
      
      localStorage.setItem('admin_token', access_token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
      setUser(user)
      
      toast.success('Login successful')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.detail || 'OTP verification failed'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    sendOTP,
    verifyOTP,
    fetchUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
