import React from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const location = useLocation()
  
  const isActive = (path) => {
    return location.pathname === path ? 'text-sky-400 font-bold border-b-2 border-sky-400' : 'text-slate-400 hover:text-slate-200'
  }

  return (
    <nav className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-6 sticky top-0 z-50">
      <div className="flex items-center space-x-8">
        <h1 className="text-xl font-bold text-sky-500 mr-4">
            <span className="text-white">Hex</span>Editor
        </h1>
        
        <div className="flex space-x-6 text-sm">
            <Link to="/" className={`py-4 transition-colors ${isActive('/')}`}>
                绘制地图
            </Link>
            <Link to="/maps" className={`py-4 transition-colors ${isActive('/maps')}`}>
                地图记录
            </Link>
        </div>
      </div>
      
      <div className="ml-auto flex items-center space-x-4">
         <span className="text-xs text-slate-500">v0.1.0</span>
      </div>
    </nav>
  )
}
