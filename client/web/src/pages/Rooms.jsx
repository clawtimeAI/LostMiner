import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:2567'

export default function Rooms() {
  const [rooms, setRooms] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRooms = () => {
      // Don't set loading to true on background refreshes to avoid UI flicker
      fetch(`${API_BASE}/rooms`).then(r => r.json()).then(data => {
        setRooms(data.rooms || [])
        setLoading(false) // Only relevant for initial load
      }).catch(e => {
        console.error('Fetch rooms error:', e)
        // Don't show error on transient failures during polling, just log it
        if (loading) setError(String(e)) 
      }).finally(() => {
        if (loading) setLoading(false)
      })
    }

    fetchRooms()
    const interval = setInterval(fetchRooms, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, []) // Empty dependency array means this runs once on mount

  const refreshManual = () => {
    setLoading(true)
    fetch(`${API_BASE}/rooms`)
      .then(r => r.json())
      .then(d => setRooms(d.rooms || []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">房间列表</h1>
        <button
          onClick={refreshManual}
          className="rounded-md border border-slate-700 hover:border-slate-600 px-3 py-1.5 text-sm transition-colors"
        >
          刷新
        </button>
      </div>
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-slate-300">
          暂无房间，等待服务器创建或有代理加入。
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rooms.map(r => (
            <li key={r.roomId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{r.metadata?.title || r.name}</div>
                <div className="mt-1 text-slate-400 text-sm">
                  在线 {r.clients}/{r.maxClients}
                  <span className="ml-3 inline-flex items-center rounded-md bg-sky-500/15 text-sky-300 px-2 py-0.5 text-xs">蓝 {r.metadata?.blue || 0}</span>
                  <span className="ml-2 inline-flex items-center rounded-md bg-rose-500/15 text-rose-300 px-2 py-0.5 text-xs">红 {r.metadata?.red || 0}</span>
                </div>
              </div>
              <Link className="rounded-md bg-sky-500 hover:bg-sky-400 text-slate-900 px-3 py-1.5 text-sm" to={`/watch/${r.roomId}`}>
                进入观战
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
