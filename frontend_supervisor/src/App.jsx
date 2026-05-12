import React from 'react'
import PropTypes from 'prop-types'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Schedules from './pages/Schedules'
import TeachingLoads from './pages/TeachingLoads'
import Statistics from './pages/Statistics'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-400" />
      </div>
    )
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function App() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-400" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />

      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        )}
      >
        <Route index element={<Navigate to="/teaching-loads" replace />} />
        <Route path="teaching-loads" element={<TeachingLoads />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="statistics" element={<Statistics />} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? '/teaching-loads' : '/login'} replace />} />
    </Routes>
  )
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
}

export default App
