import React from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, Clock3, FileText, LogOut, Menu, Settings, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const supervisorNavigation = [
  { name: 'Schedules', href: '/schedules', icon: CalendarDays },
  { name: 'Generate Report', href: '/generate-report', icon: FileText },
  { name: 'Statistics', href: '/statistics', icon: BarChart3 },
  { name: 'History', href: '/history', icon: Clock3 },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)

  const navigation = supervisorNavigation
  const portalName = 'Center Chief Portal'
  const roleLabel = 'Center Chief'

  const isActive = (href) => {
    const normalizedHref = href.split('?')[0]
    return location.pathname === normalizedHref
  }

  const renderNav = (onNavigate) => (
    <nav className="flex-1 space-y-2 px-4 py-6">
      {navigation.map((item) => (
        <Link
          key={item.name}
          to={item.href}
          onClick={onNavigate}
          className={`flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
            isActive(item.href)
              ? 'bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-900/25'
              : 'text-slate-200 hover:bg-white/10'
          }`}
        >
          <item.icon className="mr-3 h-5 w-5" />
          {item.name}
        </Link>
      ))}
    </nav>
  )

  return (
    <div className="relative flex min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 lg:gap-0">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 left-1/3 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl lg:h-96 lg:w-96" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl lg:h-96 lg:w-96" />
      </div>

      {/* Mobile Sidebar Overlay */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <button type="button" className="absolute inset-0 bg-slate-950/80" onClick={() => setSidebarOpen(false)} />
        <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-white/10 bg-slate-900/95 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200">TESDA RTC - NCR</p>
              <h2 className="mt-1 text-lg sm:text-xl font-bold text-white">{portalName}</h2>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-xl border border-white/10 p-2 text-slate-300">
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderNav(() => setSidebarOpen(false))}
          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col lg:border-r lg:border-white/10 lg:bg-slate-900/90 lg:backdrop-blur transition-all duration-300 ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-80'}`}>
        <div className={`border-b border-white/10 px-4 py-4 lg:px-6 lg:py-6 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {sidebarCollapsed ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-lg shadow-sky-900/25" />
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200">TESDA RTC - NCR</p>
              <h1 className="mt-2 text-2xl font-bold leading-tight text-white">{portalName}</h1>
              <p className="mt-2 text-sm text-slate-300">Trainer and teaching load management</p>
            </>
          )}
        </div>
        <nav className="flex-1 space-y-2 px-2 py-4 lg:px-4 lg:py-6">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`flex items-center rounded-xl px-3 py-2 lg:rounded-2xl lg:px-4 lg:py-3 text-sm font-semibold transition ${
                isActive(item.href)
                  ? 'bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-900/25'
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
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{roleLabel}</p>
              <p className="mt-2 text-sm lg:text-lg font-semibold text-white truncate">{user?.full_name || user?.username}</p>
              <p className="text-xs lg:text-sm text-slate-300 truncate">{user?.email}</p>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            className={`flex w-full items-center rounded-xl border border-white/10 px-3 py-2 lg:rounded-2xl lg:px-4 lg:py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 ${sidebarCollapsed ? 'justify-center' : ''}`}
          >
            <LogOut className={`${sidebarCollapsed ? '' : 'mr-3'} h-5 w-5 flex-shrink-0`} />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col transition-[margin-left] duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-80'}`}>
        <header className="flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-3 py-3 text-slate-900 backdrop-blur sm:px-4 sm:py-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl border border-slate-200 p-2 lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="hidden lg:flex rounded-xl border border-slate-200 p-2 hover:bg-slate-50">
              <Menu className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 text-center lg:text-left lg:ml-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700 hidden sm:block">TESDA RTC - NCR</p>
            <h2 className="text-sm font-bold truncate">{portalName}</h2>
          </div>
          <div className="w-2 sm:w-4" />
        </header>

        <main className="flex min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 via-sky-50 to-cyan-100/70 px-3 py-4 sm:px-4 sm:py-6 lg:px-6 lg:py-8 xl:px-10">
          <div className="w-full max-w-full overflow-x-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
