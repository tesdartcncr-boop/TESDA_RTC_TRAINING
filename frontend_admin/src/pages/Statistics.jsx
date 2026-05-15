import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { BarChart3, CheckCircle2, Clock3, Users, Calendar, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import { cacheManager } from '../utils/cacheManager'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const getToken = () => localStorage.getItem('management_token') || sessionStorage.getItem('management_session_token')

function StatBar({ label, value, total, color }) {
  const minWidth = value > 0 ? 8 : 0
  const width = total > 0 ? `${Math.max((value / total) * 100, minWidth)}%` : '0%'
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100">
        <div className={`h-3 rounded-full ${color}`} style={{ width }} />
      </div>
    </div>
  )
}

export default function Statistics() {
  const [dashboardStats, setDashboardStats] = useState(null)
  const [overviewStats, setOverviewStats] = useState(null)
  const [teachingLoadsByYear, setTeachingLoadsByYear] = useState(null)
  const [selectedYear, setSelectedYear] = useState('')
  const [loadingYearStats, setLoadingYearStats] = useState(false)

  const loadTeachingLoadsByYear = async (year = null) => {
    setLoadingYearStats(true)
    try {
      const cacheKey = cacheManager.generateKey('stats_teaching_loads_by_year', { year: year || null })
      const cached = cacheManager.get(cacheKey)
      
      if (cached !== null) {
        setTeachingLoadsByYear(cached)
        setLoadingYearStats(false)
        return
      }

      const url = year ? `${API_BASE}/api/admin/statistics/teaching-loads-by-year?year=${year}` : `${API_BASE}/api/admin/statistics/teaching-loads-by-year`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      
      const data = await response.json()
      setTeachingLoadsByYear(data)
      cacheManager.set(cacheKey, data)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load teaching loads statistics')
    } finally {
      setLoadingYearStats(false)
    }
  }

  useEffect(() => {
    const loadStats = async () => {
      try {
        const dashboardCacheKey = cacheManager.generateKey('stats_dashboard')
        const overviewCacheKey = cacheManager.generateKey('stats_overview')
        const cachedDashboard = cacheManager.get(dashboardCacheKey)
        const cachedOverview = cacheManager.get(overviewCacheKey)

        if (cachedDashboard !== null) {
          setDashboardStats(cachedDashboard)
        }
        if (cachedOverview !== null) {
          setOverviewStats(cachedOverview)
        }
        if (cachedDashboard !== null && cachedOverview !== null) {
          return
        }

        const [dashboardResponse, overviewResponse] = await Promise.all([
          fetch(`${API_BASE}/api/admin/dashboard/stats`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
          fetch(`${API_BASE}/api/admin/statistics/overview`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
        ])

        const dashboardData = await dashboardResponse.json()
        const overviewData = await overviewResponse.json()

        setDashboardStats(dashboardData)
        setOverviewStats(overviewData)
        cacheManager.set(dashboardCacheKey, dashboardData)
        cacheManager.set(overviewCacheKey, overviewData)
      } catch (error) {
        console.error(error)
        toast.error('Failed to load statistics')
      }
    }
    loadStats()
    loadTeachingLoadsByYear()
  }, [])

StatBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
}

  const totalProgramTypes = overviewStats
    ? Object.values(overviewStats.program_types || {}).reduce((sum, value) => sum + value, 0)
    : 0
  const totalTeachingLoads = overviewStats
    ? Object.values(overviewStats.teaching_loads || {}).reduce((sum, value) => sum + value, 0)
    : 0

  const handleYearChange = (year) => {
    setSelectedYear(year)
    loadTeachingLoadsByYear(year || null)
  }

  const currentYearStats = teachingLoadsByYear?.current_year_stats || {}
  const loadsByBatch = teachingLoadsByYear?.loads_by_batch || {}
  const loadsByYear = teachingLoadsByYear?.loads_by_year || {}
  const availableYears = teachingLoadsByYear?.available_years || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Statistics</h1>
        <p className="mt-2 text-sm text-slate-600">Portal-wide summaries for programs, teaching loads, and trainer account coverage.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Admin Accounts', value: dashboardStats?.total_admin_accounts ?? 0, icon: Users },
          { label: 'Supervisor Accounts', value: dashboardStats?.total_supervisor_accounts ?? 0, icon: Users },
          { label: 'Pending Loads', value: dashboardStats?.pending_loads ?? 0, icon: Clock3 },
          { label: 'Approved Loads', value: dashboardStats?.approved_loads ?? 0, icon: CheckCircle2 },
        ].map((card) => (
          <div key={card.label} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <card.icon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-sky-600" />
            <h2 className="text-xl font-bold text-slate-900">Program Types</h2>
          </div>
          <div className="space-y-4">
            <StatBar label="Institution-Based" value={overviewStats?.program_types?.institution_based || 0} total={totalProgramTypes} color="bg-sky-500" />
            <StatBar label="Community-Based" value={overviewStats?.program_types?.community_based || 0} total={totalProgramTypes} color="bg-emerald-500" />
            <StatBar label="Microcredential" value={overviewStats?.program_types?.microcredential || 0} total={totalProgramTypes} color="bg-orange-500" />
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-sky-600" />
            <h2 className="text-xl font-bold text-slate-900">Teaching Load Status</h2>
          </div>
          <div className="space-y-4">
            <StatBar label="For Approval" value={overviewStats?.teaching_loads?.for_approval || 0} total={totalTeachingLoads} color="bg-amber-500" />
            <StatBar label="Approved" value={overviewStats?.teaching_loads?.approved || 0} total={totalTeachingLoads} color="bg-emerald-500" />
            <StatBar label="Rejected" value={overviewStats?.teaching_loads?.rejected || 0} total={totalTeachingLoads} color="bg-rose-500" />
          </div>
        </div>
      </div>

      {/* Teaching Loads by Year Section */}
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-sky-600" />
            <h2 className="text-xl font-bold text-slate-900">Teaching Loads by Year</h2>
          </div>
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-slate-500" />
            <select 
              value={selectedYear} 
              onChange={(e) => handleYearChange(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All Years</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {loadingYearStats ? (
          <div className="text-center py-8 text-slate-500">Loading teaching loads statistics...</div>
        ) : (
          <div className="space-y-6">
            {/* Current Year/Filtered Stats */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                {selectedYear ? `${selectedYear} Statistics` : 'All Time Statistics'}
              </h3>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-600">Total Loads</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{currentYearStats.total || 0}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-700">For Approval</p>
                  <p className="mt-1 text-2xl font-bold text-amber-900">{currentYearStats.for_approval || 0}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-700">Approved</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-900">{currentYearStats.approved || 0}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-medium text-rose-700">Rejected</p>
                  <p className="mt-1 text-2xl font-bold text-rose-900">{currentYearStats.rejected || 0}</p>
                </div>
              </div>
            </div>

            {/* Loads by Batch */}
            {Object.keys(loadsByBatch).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Loads by Batch</h3>
                <div className="space-y-3">
                  {Object.entries(loadsByBatch).map(([batch, stats]) => (
                    <div key={batch} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-900">{batch}</span>
                        <span className="text-sm text-slate-600">{stats.total} loads</span>
                      </div>
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-amber-600">For Approval:</span>
                          <span className="font-medium">{stats.for_approval}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-emerald-600">Approved:</span>
                          <span className="font-medium">{stats.approved}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-rose-600">Rejected:</span>
                          <span className="font-medium">{stats.rejected}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Year Overview */}
            {!selectedYear && Object.keys(loadsByYear).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Year Overview</h3>
                <div className="space-y-3">
                  {Object.entries(loadsByYear)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([year, stats]) => (
                      <div key={year} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-900">{year}</span>
                          <span className="text-sm text-slate-600">{stats.total} loads</span>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-amber-600">{stats.for_approval} pending</span>
                          <span className="text-emerald-600">{stats.approved} approved</span>
                          <span className="text-rose-600">{stats.rejected} rejected</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
