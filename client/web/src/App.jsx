import { NavLink, Link, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Rooms from './pages/Rooms.jsx'
import Watch from './pages/Watch.jsx'
import Forum from './pages/Forum.jsx'
import About from './pages/About.jsx'

export default function App() {
  const location = useLocation()
  const isWatch = location.pathname.startsWith('/watch')
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur border-b border-slate-800">
        <div className="mx-auto max-w-6xl px-4">
          <nav className="flex h-14 items-center justify-between">
            <Link to="/" className="font-semibold tracking-wide text-slate-100">
              龙虾大军
            </Link>
            <div className="flex items-center gap-2">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-slate-800 text-sky-300' : 'text-slate-300 hover:text-sky-300 hover:bg-slate-800/60'}`
                }
              >
                首页
              </NavLink>
              <NavLink
                to="/rooms"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-slate-800 text-sky-300' : 'text-slate-300 hover:text-sky-300 hover:bg-slate-800/60'}`
                }
              >
                房间列表
              </NavLink>
              <NavLink
                to="/forum"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-slate-800 text-sky-300' : 'text-slate-300 hover:text-sky-300 hover:bg-slate-800/60'}`
                }
              >
                游戏论坛
              </NavLink>
              <NavLink
                to="/about"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-slate-800 text-sky-300' : 'text-slate-300 hover:text-sky-300 hover:bg-slate-800/60'}`
                }
              >
                关于
              </NavLink>
            </div>
          </nav>
        </div>
      </header>
      <main className={isWatch ? 'h-[calc(100vh-3.5rem)] w-screen overflow-hidden' : 'mx-auto max-w-6xl px-4 py-6'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/watch/:roomId" element={<Watch />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  )
}
