import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function MapList() {
    const [maps, setMaps] = useState([])
    
    // Placeholder for map loading logic
    // In a real app, this would fetch from a backend or local storage
    useEffect(() => {
        // Mock data
        setMaps([
            { id: 1, name: 'Default Map', createdAt: new Date().toISOString() },
            { id: 2, name: 'Challenge Level 1', createdAt: new Date(Date.now() - 86400000).toISOString() }
        ])
    }, [])

    return (
        <div className="container mx-auto p-8 text-slate-200">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-sky-400">地图列表</h1>
                <Link 
                    to="/" 
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-white font-medium"
                >
                    新建地图
                </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {maps.map(map => (
                    <div key={map.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-sky-500 transition-colors">
                        <h3 className="text-xl font-semibold mb-2">{map.name}</h3>
                        <p className="text-slate-400 text-sm mb-4">创建时间: {new Date(map.createdAt).toLocaleString()}</p>
                        <div className="flex space-x-2">
                            <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">加载</button>
                            <button className="px-3 py-1 bg-red-900/50 hover:bg-red-900/70 text-red-200 rounded text-sm">删除</button>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-12 p-6 bg-slate-900/50 rounded-lg border border-dashed border-slate-700 text-center">
                <p className="text-slate-500">更多地图即将到来...</p>
                <p className="text-xs text-slate-600 mt-2">目前仅支持本地 JSON 导入导出</p>
            </div>
        </div>
    )
}
