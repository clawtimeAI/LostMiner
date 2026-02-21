import React, { useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import { offsetToPixel, pixelToHex, axialToOffset } from '../lib/hexMath'

// Helper to check if asset exists before loading
const checkImageExists = (url) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

const BIOMES = ['Desert', 'Green', 'Ice', 'Lost', 'Lunar', 'Red', 'Swamp', 'Volcanic']
const CATEGORY_RANGES = {
  ground: [1, 10],
  obstacle: [11, 20],
  mineral: [21, 30]
}

const CATEGORY_NAMES = {
    ground: 'Ground',
    obstacle: 'Obstacle',
    mineral: 'Mineral'
}

const TILE_SIZE = 30
const DEFAULT_COLS = 30
const DEFAULT_ROWS = 20

export default function Editor() {
  const appRef = useRef()
  const containerRef = useRef()
  const mapContainerRef = useRef(new PIXI.Container())
  const tilesLayerRef = useRef(null)
  const spriteMapRef = useRef({})
  
  // Use Ref for painting logic to avoid closure staleness
  const selectedTileRef = useRef({ type: 'ground', texture: '1.png' })
  const [selectedTile, setSelectedTile] = useState(selectedTileRef.current)
  const [biome, setBiome] = useState('Desert')
  const [assetsByCategory, setAssetsByCategory] = useState({
      ground: [],
      obstacle: [],
      mineral: []
  })
  
  const mapDataRef = useRef({})
  const mapRegionsRef = useRef({})
  const regionsLayerRef = useRef(null)
  
  const [isDragging, setIsDragging] = useState(false)
  const [loadingError, setLoadingError] = useState(null)
  
  // Region State
  const [mode, setMode] = useState('tile') // 'tile' | 'region'
  const [regions, setRegions] = useState([
      { id: 1, name: 'Main Hall', color: '#ef4444' }
  ])
  const [selectedRegionId, setSelectedRegionId] = useState(1)
  
  // Sync refs for event listeners
  const modeRef = useRef('tile')
  const selectedRegionIdRef = useRef(1)
  const regionsRef = useRef(regions)
  
  useEffect(() => {
      modeRef.current = mode
  }, [mode])
  
  useEffect(() => {
      selectedRegionIdRef.current = selectedRegionId
  }, [selectedRegionId])

  useEffect(() => {
      regionsRef.current = regions
      // Re-render regions when definitions change (e.g. color change)
      renderRegions()
  }, [regions])

  const updateSelectedTile = (tile) => {
      setSelectedTile(tile)
      selectedTileRef.current = tile
  }

  // Initialize Map Data
  useEffect(() => {
    const initialMap = {}
    for (let r = 0; r < DEFAULT_ROWS; r++) {
      for (let c = 0; c < DEFAULT_COLS; c++) {
        initialMap[`${c},${r}`] = { type: 'ground', texture: '1.png' }
      }
    }
    mapDataRef.current = initialMap
  }, [])

  useEffect(() => {
      let cancelled = false
      const loadAssetList = async () => {
          const next = { ground: [], obstacle: [], mineral: [] }
          for (const [category, range] of Object.entries(CATEGORY_RANGES)) {
              const [start, end] = range
              for (let i = start; i <= end; i++) {
                  const lower = `${i}.png`
                  const lowerUrl = `/assets/hex/${biome}/${category}/${lower}`
                  if (await checkImageExists(lowerUrl)) {
                      next[category].push(lower)
                      continue
                  }
                  const upper = `${i}.PNG`
                  const upperUrl = `/assets/hex/${biome}/${category}/${upper}`
                  if (await checkImageExists(upperUrl)) next[category].push(upper)
              }
          }
          if (!cancelled) setAssetsByCategory(next)
      }
      loadAssetList()
      return () => { cancelled = true }
  }, [biome])

  useEffect(() => {
      const files = assetsByCategory[selectedTile.type] || []
      if (files.length > 0 && !files.includes(selectedTile.texture)) {
          updateSelectedTile({ type: selectedTile.type, texture: files[0] })
      }
  }, [assetsByCategory, selectedTile.type, selectedTile.texture])

  // Fix for Event Listeners accessing State
  const isDraggingRef = useRef(false)
  useEffect(() => {
      isDraggingRef.current = isDragging
  }, [isDragging])

  // Pixi Effect
  useEffect(() => {
    if (!containerRef.current) return
    
    // Cleanup existing app if any (handling Strict Mode)
    if (appRef.current) {
        try {
            appRef.current.destroy(true, { children: true, texture: false, baseTexture: false })
        } catch (e) {
            console.warn("Error destroying previous app instance:", e)
        }
        appRef.current = null
    }

    const app = new PIXI.Application({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      backgroundColor: 0x0f172a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    })
    
    containerRef.current.appendChild(app.view)
    appRef.current = app
    
    // Create new container for each effect run to avoid reuse of destroyed object
    const mapLayer = new PIXI.Container()
    mapContainerRef.current = mapLayer
    
    const { width, height } = getMapPixelSize()
    mapLayer.x = (app.screen.width - width) / 2
    mapLayer.y = (app.screen.height - height) / 2
    app.stage.addChild(mapLayer)
    
    // Create tiles layer (background)
    const tilesLayer = new PIXI.Container()
    tilesLayerRef.current = tilesLayer
    mapLayer.addChild(tilesLayer)

    // Create regions layer (overlay)
    const regionsLayer = new PIXI.Container()
    regionsLayerRef.current = regionsLayer
    regionsLayer.alpha = 0.5 // Semi-transparent
    mapLayer.addChild(regionsLayer)

    // Create highlight graphic (foreground)
    const highlight = new PIXI.Graphics()
    mapLayer.addChild(highlight)

    // Interactive controls
    let isDraggingMap = false
    let lastMousePos = null
    const ZOOM_SPEED = 0.1
    const MIN_ZOOM = 0.5
    const MAX_ZOOM = 3.0

    const onWheel = (e) => {
        e.preventDefault()
        const mapLayer = mapContainerRef.current
        
        // Get mouse position relative to mapLayer
        const rect = app.view.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        
        const localPos = mapLayer.toLocal({x: mouseX, y: mouseY})
        
        const delta = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED
        let newScale = mapLayer.scale.x + delta
        newScale = Math.max(MIN_ZOOM, Math.min(newScale, MAX_ZOOM))
        
        // Apply scale
        mapLayer.scale.set(newScale)
        
        // Adjust position to zoom towards mouse
        // newGlobalPos = mousePos - localPos * newScale
        mapLayer.x = mouseX - localPos.x * newScale
        mapLayer.y = mouseY - localPos.y * newScale
    }

    const onPointerDown = (e) => {
        // Middle mouse button or Space key pressed (simulated via boolean flag if needed)
        if (e.button === 1 || e.button === 2) { 
             isDraggingMap = true
             lastMousePos = { x: e.clientX, y: e.clientY }
             e.preventDefault()
        } else if (e.button === 0) {
             isDraggingRef.current = true
             paintAtEvent(e)
             e.preventDefault()
        }
    }
    
    const onPointerUp = () => {
        isDraggingRef.current = false
        isDraggingMap = false
        lastMousePos = null
    }
    
    const onPointerMove = (e) => {
        const mapLayer = mapContainerRef.current
        const rect = app.view.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        
        // Handle Highlight
        const localPos = mapLayer.toLocal({x: mouseX, y: mouseY})
        const hex = pixelToHex(localPos.x, localPos.y, TILE_SIZE)
        const offset = axialToOffset(hex.q, hex.r)
        
        // Draw highlight
        highlight.clear()
        if (offset.col >= 0 && offset.col < DEFAULT_COLS && offset.row >= 0 && offset.row < DEFAULT_ROWS) {
            const { x, y } = offsetToPixel(offset.col, offset.row, TILE_SIZE)
            
            highlight.lineStyle(2, 0xFFFFFF, 0.8)
            highlight.beginFill(0xFFFFFF, 0.2)
            
            const pts = []
            for (let i = 0; i < 6; i++) {
                const ang = (Math.PI / 180) * (30 + i * 60)
                pts.push(x + Math.cos(ang) * TILE_SIZE, y + Math.sin(ang) * TILE_SIZE)
            }
            
            highlight.moveTo(pts[0], pts[1])
            for (let i = 2; i < 12; i+=2) {
                highlight.lineTo(pts[i], pts[i+1])
            }
            highlight.closePath()
            highlight.endFill()
        }

        // Handle Map Dragging
        if (isDraggingMap && lastMousePos) {
            const dx = e.clientX - lastMousePos.x
            const dy = e.clientY - lastMousePos.y
            mapLayer.x += dx
            mapLayer.y += dy
            lastMousePos = { x: e.clientX, y: e.clientY }
        }

        // Handle Painting
        if (isDraggingRef.current) {
            paintAtEvent(e)
        }
    }
    
    const paintAtEvent = (e) => {
        const rect = app.view.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        paintHex({ x, y })
    }

    // Attach listeners to canvas for wheel to prevent page scroll
    app.view.addEventListener('wheel', onWheel, { passive: false })
    app.view.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    app.view.addEventListener('pointermove', onPointerMove)
    // Prevent context menu on right click
    app.view.addEventListener('contextmenu', e => e.preventDefault())

    // Handle resize
    const onResize = () => {
        if (!containerRef.current || !appRef.current) return;
        const parent = containerRef.current;
        if (appRef.current.renderer) {
            appRef.current.renderer.resize(parent.clientWidth, parent.clientHeight);
            
            // Re-center map if needed, or just let user pan
            // const { width, height } = getMapPixelSize()
            // mapContainerRef.current.x = (appRef.current.screen.width - width) / 2
            // mapContainerRef.current.y = (appRef.current.screen.height - height) / 2
        }
    }
    window.addEventListener('resize', onResize)

    return () => {
      try {
        app.destroy(true, { children: true, texture: false, baseTexture: false })
      } catch (e) {
         // Ignore destroy errors
         console.warn("App destroy error:", e)
      }
      appRef.current = null
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', onResize)
    }
  }, [])


  const renderRegions = () => {
      const layer = regionsLayerRef.current
      if (!layer) return
      
      layer.removeChildren()
      
      const regionColors = {}
      regionsRef.current.forEach(r => {
          regionColors[r.id] = parseInt(r.color.replace('#', ''), 16)
      })
      
      for (const [key, regId] of Object.entries(mapRegionsRef.current)) {
          if (!regId) continue
          const [c, r] = key.split(',').map(Number)
          const { x, y } = offsetToPixel(c, r, TILE_SIZE)
          const color = regionColors[regId]
          if (color === undefined) continue
          
          const g = new PIXI.Graphics()
          g.beginFill(color)
          const pts = []
          for (let i = 0; i < 6; i++) {
              const ang = (Math.PI / 180) * (30 + i * 60)
              pts.push(Math.cos(ang) * TILE_SIZE, Math.sin(ang) * TILE_SIZE)
          }
          g.drawPolygon(pts)
          g.endFill()
          
          g.position.set(x, y)
          layer.addChild(g)
      }
  }

  const renderMap = () => {
    const tilesLayer = tilesLayerRef.current
    if (!tilesLayer) return
    
    tilesLayer.removeChildren()
    spriteMapRef.current = {}
    
    for (let r = 0; r < DEFAULT_ROWS; r++) {
      for (let c = 0; c < DEFAULT_COLS; c++) {
        const key = `${c},${r}`
        const tile = mapDataRef.current[key]
        
        const { x, y } = offsetToPixel(c, r, TILE_SIZE)
        
        try {
            const texture = PIXI.Assets.get(`${biome}/${tile.type}/${tile.texture}`)
            if (texture) {
                const sprite = new PIXI.Sprite(texture)
                sprite.anchor.set(0.5)
                sprite.position.set(x, y)
                sprite.width = TILE_SIZE * 2
                sprite.height = TILE_SIZE * 2
                tilesLayer.addChild(sprite)
                spriteMapRef.current[key] = sprite
            }
        } catch (e) {
            console.warn(`Texture missing for ${tile.type}/${tile.texture}`)
        }
      }
    }
  }

  const paintHex = (globalPos) => {
      if (!mapContainerRef.current || !tilesLayerRef.current) return
      
      const mapLayer = mapContainerRef.current
      const tilesLayer = tilesLayerRef.current
      const localPos = mapLayer.toLocal(new PIXI.Point(globalPos.x, globalPos.y))
      
      const hex = pixelToHex(localPos.x, localPos.y, TILE_SIZE)
      const offset = axialToOffset(hex.q, hex.r)
      
      if (offset.col >= 0 && offset.col < DEFAULT_COLS && offset.row >= 0 && offset.row < DEFAULT_ROWS) {
          const key = `${offset.col},${offset.row}`
          
          if (modeRef.current === 'region') {
               const currentReg = mapRegionsRef.current[key]
               const targetReg = selectedRegionIdRef.current
               if (currentReg !== targetReg) {
                   mapRegionsRef.current[key] = targetReg
                   renderRegions()
               }
               return
          }
          
          // Tile Mode
          const currentTile = mapDataRef.current[key]
          const targetTile = selectedTileRef.current
          
          if (!currentTile || currentTile.type !== targetTile.type || currentTile.texture !== targetTile.texture) {
              mapDataRef.current[key] = { ...targetTile }
              
          const texture = PIXI.Assets.get(`${biome}/${targetTile.type}/${targetTile.texture}`)
              if (texture) {
                  let sprite = spriteMapRef.current[key]
                  if (!sprite) {
                      sprite = new PIXI.Sprite(texture)
                      sprite.anchor.set(0.5)
                      const { x, y } = offsetToPixel(offset.col, offset.row, TILE_SIZE)
                      sprite.position.set(x, y)
                      sprite.width = TILE_SIZE * 2
                      sprite.height = TILE_SIZE * 2
                      tilesLayer.addChild(sprite)
                      spriteMapRef.current[key] = sprite
                  } else {
                      sprite.texture = texture
                  }
              }
          }
      }
  }

  const getMapPixelSize = () => {
      const width = TILE_SIZE * Math.sqrt(3) * (DEFAULT_COLS + 0.5)
      const height = TILE_SIZE * 1.5 * (DEFAULT_ROWS + 0.5)
      return { width, height }
  }

  useEffect(() => {
      if (!appRef.current) return
      let cancelled = false
      const loadAssets = async () => {
          try {
              const loadPromises = []
              for (const [category, files] of Object.entries(assetsByCategory)) {
                  for (const file of files) {
                      const key = `${biome}/${category}/${file}`
                      const url = `/assets/hex/${biome}/${category}/${file}`
                      if (!PIXI.Assets.cache.has(key)) {
                          PIXI.Assets.add(key, url)
                          loadPromises.push(PIXI.Assets.load(key))
                      } else {
                          loadPromises.push(Promise.resolve(PIXI.Assets.get(key)))
                      }
                  }
              }
              await Promise.all(loadPromises)
              if (!cancelled) renderMap()
          } catch (err) {
              console.error("Failed to load assets:", err)
              setLoadingError(err.message)
          }
      }
      loadAssets()
      return () => { cancelled = true }
  }, [assetsByCategory, biome])

  useEffect(() => {
      const filesByType = assetsByCategory
      let changed = false
      for (let r = 0; r < DEFAULT_ROWS; r++) {
          for (let c = 0; c < DEFAULT_COLS; c++) {
              const key = `${c},${r}`
              const tile = mapDataRef.current[key]
              if (!tile) continue
              const files = filesByType[tile.type] || []
              if (files.length > 0 && !files.includes(tile.texture)) {
                  mapDataRef.current[key] = { ...tile, texture: files[0] }
                  changed = true
              }
          }
      }
      if (changed) renderMap()
  }, [assetsByCategory, biome])

  const handleSaveJSON = () => {
      const cells = []
      for (let r = 0; r < DEFAULT_ROWS; r++) {
          const row = []
          for (let c = 0; c < DEFAULT_COLS; c++) {
              const tile = mapDataRef.current[`${c},${r}`]
              let val = 1
              
              // Map texture names to IDs
              // Extract ID from filename (e.g., "1.png" -> 1, "11.png" -> 11)
              const parsed = parseInt(tile.texture, 10)
              if (!isNaN(parsed)) {
                  val = parsed
              } else {
                  // Fallback if parsing fails (should not happen with new assets)
                  if (tile.type === 'ground') val = 1
                  else if (tile.type === 'obstacle') val = 11
                  else if (tile.type === 'mineral') val = 21
              }
              
              row.push(val)
          }
          cells.push(row)
      }
      
      const regionMap = []
      for (let r = 0; r < DEFAULT_ROWS; r++) {
          const row = []
          for (let c = 0; c < DEFAULT_COLS; c++) {
              row.push(mapRegionsRef.current[`${c},${r}`] || 0)
          }
          regionMap.push(row)
      }
      
      const json = {
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          tileSize: TILE_SIZE,
          biome: biome,
          legend: { 
            "1-10": "ground", 
            "11-20": "obstacle", 
            "21-30": "mineral"
          },
          cells,
          regions: regions,
          regionCells: regionMap
      }
      
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'map.json'
      a.click()
  }
  
  const handleSaveImage = async () => {
      if (!appRef.current || !mapContainerRef.current) return
      const app = appRef.current
      const image = await app.renderer.extract.image(mapContainerRef.current)
      const a = document.createElement('a')
      a.href = image.src
      a.download = 'map.png'
      a.click()
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 overflow-y-auto select-none shrink-0 z-10">
        <h2 className="text-lg font-bold mb-4 text-sky-400">工具箱</h2>

        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-400">地貌</label>
          <select
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-sky-500"
            value={biome}
            onChange={(e) => setBiome(e.target.value)}
          >
            {BIOMES.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        
        {/* Mode Switcher */}
        <div className="flex mb-4 bg-slate-800 p-1 rounded">
          <button 
            className={`flex-1 py-1 text-sm rounded ${mode === 'tile' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setMode('tile')}
          >
            Tiles
          </button>
          <button 
            className={`flex-1 py-1 text-sm rounded ${mode === 'region' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
            onClick={() => setMode('region')}
          >
            Regions
          </button>
        </div>
        
        {loadingError && (
            <div className="mb-4 p-2 bg-red-900/50 border border-red-700 rounded text-xs text-red-200">
                资源加载失败: {loadingError}
            </div>
        )}

        {mode === 'tile' && Object.entries(assetsByCategory).map(([category, files]) => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold uppercase text-slate-400 mb-2">
                {CATEGORY_NAMES[category] || category}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {files.map(file => (
                <div 
                  key={file}
                  className={`cursor-pointer p-1 rounded border-2 transition-all ${
                    selectedTile.type === category && selectedTile.texture === file 
                      ? 'border-sky-500 bg-slate-800' 
                      : 'border-transparent hover:border-slate-600'
                  }`}
                  onClick={() => updateSelectedTile({ type: category, texture: file })}
                >
                  <img 
                    src={`/assets/hex/${biome}/${category}/${file}`} 
                    alt={file}
                    className="w-full h-auto rendering-pixelated"
                    draggable={false}
                    onError={(e) => {
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCI+PHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGR5PSIuM2VtIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIiBmb250LXNpemU9IjEwIj5FUlI8L3RleHQ+PC9zdmc+'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {mode === 'region' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {regions.map(r => (
                  <div 
                    key={r.id} 
                    className={`p-2 rounded border cursor-pointer flex items-center justify-between ${
                      selectedRegionId === r.id ? 'border-sky-500 bg-slate-800' : 'border-slate-700 hover:border-slate-600'
                    }`}
                    onClick={() => setSelectedRegionId(r.id)}
                  >
                     <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{backgroundColor: r.color}}></div>
                        <span className="text-sm text-slate-200">{r.name}</span>
                     </div>
                     <button 
                       className="text-slate-500 hover:text-red-400 px-2"
                       onClick={(e) => {
                           e.stopPropagation()
                           if (regions.length > 1) {
                               const newRegions = regions.filter(reg => reg.id !== r.id)
                               setRegions(newRegions)
                               if (selectedRegionId === r.id) setSelectedRegionId(newRegions[0].id)
                           }
                       }}
                     >
                       ×
                     </button>
                  </div>
                ))}
              </div>
              
              <div className="pt-4 border-t border-slate-800">
                 <h3 className="text-xs font-semibold text-slate-400 mb-2">ADD REGION</h3>
                 <div className="flex gap-2 mb-2">
                     <input 
                       type="text" 
                       id="newRegionName"
                       placeholder="Name" 
                       className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white w-full outline-none focus:border-sky-500"
                     />
                     <input 
                       type="color" 
                       id="newRegionColor"
                       defaultValue="#ff0000"
                       className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" 
                     />
                 </div>
                 <button 
                   className="w-full py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded transition-colors"
                   onClick={() => {
                       const nameInput = document.getElementById('newRegionName')
                       const colorInput = document.getElementById('newRegionColor')
                       const name = nameInput.value || `Region ${regions.length + 1}`
                       const color = colorInput.value
                       const newId = Math.max(...regions.map(r => r.id), 0) + 1
                       setRegions([...regions, { id: newId, name, color }])
                       setSelectedRegionId(newId)
                       nameInput.value = ''
                   }}
                 >
                   Add Region
                 </button>
              </div>
            </div>
        )}
        
        <div className="mt-8 space-y-2">
          <button 
            onClick={handleSaveJSON}
            className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium transition-colors"
          >
            保存 JSON
          </button>
          <button 
            onClick={handleSaveImage}
            className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
          >
            保存图片
          </button>
          <div className="text-xs text-slate-500 mt-2">
             <p>左键点击或拖拽绘制地图。</p>
             <p>Ground: 可通行 (ID: 1-10)</p>
             <p>Obstacle: 不可通行 (ID: 11-20)</p>
             <p>Mineral: 矿物点 (ID: 21-30)</p>
          </div>
        </div>
      </div>
      
      {/* Canvas Area */}
      <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center z-0" ref={containerRef}>
        {/* Canvas will be appended here */}
      </div>
    </div>
  )
}
