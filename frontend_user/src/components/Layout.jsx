import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { User, Home, LogOut, Menu, X, Mail } from 'lucide-react'

const Layout = () => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Messages', href: '/messages', icon: Mail },
    { name: 'Profile', href: '/profile', icon: User },
  ]

  const isActive = (href) => location.pathname === href

  return (
    <div className="relative flex min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 lg:gap-0">
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
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
            <h2 className="text-xl font-semibold text-white">Trainer Portal</h2>
            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-2 px-4 py-6">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all ${
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
              className="flex w-full items-center rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col lg:border-r lg:border-white/10 lg:bg-slate-900/95 lg:backdrop-blur-md transition-all duration-300 ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <div className={`border-b border-white/10 px-4 py-4 lg:px-6 lg:py-6 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {sidebarCollapsed ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-blue-900/30" />
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white">Trainer Portal</h2>
            </>
          )}
        </div>
        <nav className="flex-1 space-y-2 px-2 py-4 lg:px-4 lg:py-6">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-blue-900/30'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              <item.icon className={`${sidebarCollapsed ? 'mx-auto' : 'mr-3'} h-5 w-5 flex-shrink-0`} />
              {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 lg:p-5">
          {!sidebarCollapsed && (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3 lg:p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Trainer</p>
              <p className="mt-2 truncate text-sm font-semibold text-white lg:text-lg">{user?.trainer_name}</p>
              <p className="truncate text-xs text-slate-300 lg:text-sm">{user?.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className={`flex w-full items-center rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 ${sidebarCollapsed ? 'justify-center' : ''}`}
          >
            <LogOut className={`${sidebarCollapsed ? '' : 'mr-3'} h-5 w-5 flex-shrink-0`} />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`relative z-0 flex min-w-0 flex-1 flex-col ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <div className="flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600 hover:text-slate-900 lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:flex"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-slate-900 lg:ml-4 lg:text-left">Trainer Portal</h1>
          <div className="w-6 lg:hidden" />
        </div>
        <main className="relative flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 via-cyan-50 to-blue-100/70 focus:outline-none">
          <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout
