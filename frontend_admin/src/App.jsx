import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Trainers from './pages/Trainers'
import Programs from './pages/Programs'
import Schedules from './pages/Schedules'
import Layout from './components/Layout'

function App() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} 
      />
      <Route
        path="/"
        element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
      >
        <Route index element={<Navigate to="dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="trainers" element={<Trainers />} />
        <Route path="programs" element={<Programs />} />
        <Route path="schedules" element={<Schedules />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} />} />
    </Routes>
  )
}

export default App
