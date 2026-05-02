import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
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
  AuthProvider.propTypes = {
    children: PropTypes.node.isRequired
  }
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
      // First get basic user info
      const userResponse = await axios.get('http://localhost:5000/api/auth/me')
      let userData = userResponse.data
      console.log('User data fetched:', userData)
      
      // If it's a trainer, also fetch trainer-specific info
      if (userData.user_type === 'trainer') {
        try {
          console.log('Fetching trainer info from background...')
          const trainerResponse = await axios.get('http://localhost:5000/api/auth/trainer/me')
          console.log('Trainer data fetched:', trainerResponse.data)
          userData = { ...userData, ...trainerResponse.data }
          console.log('Merged user data:', userData)
        } catch (error) {
          console.error('Failed to fetch trainer info:', error)
        }
      }
      
      setUser(userData)
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
      const { access_token } = response.data
      
      localStorage.setItem('token', access_token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
      
      // Fetch full user info including trainer data
      const userResponse = await axios.get('http://localhost:5000/api/auth/me')
      let userData = userResponse.data
      
      // If it's a trainer, also fetch trainer-specific info
      if (userData.user_type === 'trainer') {
        try {
          console.log('Fetching trainer info...')
          const trainerResponse = await axios.get('http://localhost:5000/api/auth/trainer/me')
          console.log('Trainer data received:', trainerResponse.data)
          userData = { ...userData, ...trainerResponse.data }
          console.log('Merged user data:', userData)
        } catch (error) {
          console.error('Failed to fetch trainer info:', error)
        }
      }
      
      setUser(userData)
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

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    updateProfile,
    fetchUser
  }), [user, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
