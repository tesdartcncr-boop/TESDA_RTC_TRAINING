import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Trainers from './pages/Trainers'
import Programs from './pages/Programs'
import Schedules from './pages/Schedules'
import AdminAccounts from './pages/AdminAccounts'
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

function RoleGate({ allow, children }) {
  const { user } = useAuth()
  return allow.includes(user?.user_type) ? children : <Navigate to="/dashboard" replace />
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="teaching-loads" element={<Schedules />} />
        <Route
          path="trainers"
          element={(
            <RoleGate allow={['admin']}>
              <Trainers />
            </RoleGate>
          )}
        />
        <Route
          path="programs"
          element={(
            <RoleGate allow={['admin']}>
              <Programs />
            </RoleGate>
          )}
        />
        <Route
          path="admin-accounts"
          element={(
            <RoleGate allow={['admin', 'supervisor']}>
              <AdminAccounts />
            </RoleGate>
          )}
        />
        <Route path="statistics" element={<Statistics />} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

export default App
