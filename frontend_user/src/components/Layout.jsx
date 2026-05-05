import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  User, 
  Home, 
  LogOut, 
  Menu,
  X
} from 'lucide-react'

const Layout = () => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Profile', href: '/profile', icon: User },
  ]

  const isActive = (href) => location.pathname === href

  return (
    <div className="relative h-screen flex overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
      </div>
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <button
          type="button"
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-white/10 bg-slate-900/95 text-slate-100 backdrop-blur-md">
          <div className="flex items-center justify-between h-16 px-6 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Trainer Portal</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-blue-900/30'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4">
            <button
              onClick={logout}
              className="flex items-center w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col h-full border-r border-white/10 bg-slate-900/95 text-slate-100 backdrop-blur-md">
            <div className="flex items-center h-16 px-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">Trainer Portal</h2>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive(item.href)
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-blue-900/30'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              ))}
            </nav>
            <div className="border-t border-white/10 p-4">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user?.trainer_name?.charAt(0) || 'U'}
                    </span>
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-white">{user?.trainer_name}</p>
                  <p className="text-xs text-slate-300">Trainer</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
      </div>

      {/* Main content */}
      <div className="relative z-0 flex flex-col flex-1 min-w-0 lg:pl-64">
        <div className="lg:hidden">
          <div className="flex items-center justify-between h-16 px-4 bg-white/80 backdrop-blur-md">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-slate-600 hover:text-slate-900"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Trainer Portal</h1>
            <div className="w-6" />
          </div>
        </div>
        <main className="flex-1 relative overflow-y-auto bg-gradient-to-br from-slate-100 via-cyan-50 to-blue-100/70 focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
