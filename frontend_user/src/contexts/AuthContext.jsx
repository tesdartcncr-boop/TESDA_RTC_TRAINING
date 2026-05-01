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
    const token = localStorage.getItem('token')
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
          localStorage.removeItem('token')
          delete axios.defaults.headers.common['Authorization']
        }
      } catch (error) {
        console.error('Failed to decode token:', error)
        localStorage.removeItem('token')
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
      const { token, user } = response.data
      
      localStorage.setItem('token', token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      
      toast.success('Login successful')
      return { success: true }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed')
      return { success: false, error: error.response?.data?.message }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
    toast.success('Logged out successfully')
  }

  const updateProfile = async (profileData) => {
    try {
      const response = await axios.put('http://localhost:5000/api/trainers/profile', profileData)
      setUser(response.data)
      toast.success('Profile updated successfully')
      return { success: true }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile')
      return { success: false, error: error.response?.data?.message }
    }
  }

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    updateProfile,
    fetchUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
