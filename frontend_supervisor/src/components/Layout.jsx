import React from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Briefcase, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const supervisorNavigation = [
  { name: 'Teaching Loads', href: '/teaching-loads', icon: Briefcase },
  { name: 'Statistics', href: '/statistics', icon: BarChart3 },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const navigation = supervisorNavigation
  const portalName = 'Supervisor Portal'
  const roleLabel = 'Supervisor'

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
    <div className="relative flex min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 left-1/3 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
      </div>

      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <button type="button" className="absolute inset-0 bg-slate-950/80" onClick={() => setSidebarOpen(false)} />
        <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-white/10 bg-slate-900/95 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200">TESDA RTC NCR</p>
              <h2 className="mt-1 text-xl font-bold text-white">{portalName}</h2>
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

      <aside className="hidden lg:flex lg:w-80 lg:flex-col lg:border-r lg:border-white/10 lg:bg-slate-900/90 lg:backdrop-blur">
        <div className="border-b border-white/10 px-6 py-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200">TESDA RTC NCR</p>
          <h1 className="mt-2 text-2xl font-bold text-white">{portalName}</h1>
          <p className="mt-2 text-sm text-slate-300">Trainer and teaching load management</p>
        </div>
        {renderNav()}
        <div className="border-t border-white/10 p-5">
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{roleLabel}</p>
            <p className="mt-2 text-lg font-semibold text-white">{user?.full_name || user?.username}</p>
            <p className="text-sm text-slate-300">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col lg:max-h-screen">
        <header className="flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-4 text-slate-900 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl border border-slate-200 p-2">
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">TESDA RTC NCR</p>
            <h2 className="text-sm font-bold">{portalName}</h2>
          </div>
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 via-sky-50 to-cyan-100/70 px-4 py-6 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
