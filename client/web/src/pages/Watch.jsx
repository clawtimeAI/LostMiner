import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as PIXI from 'pixi.js'
import { composeHexMapSprite, preloadCategory } from '../lib/composeHexMap.js'
import { Client } from 'colyseus.js'
import { offsetToPixel, axialToOffset, pixelToHex, axialRound, toPixel } from '../lib/hexMath.js'
import { HexPathfinder } from '../lib/HexPathfinder.js'
import { MonsterFactory } from '../lib/MonsterFactory.js'
import { Monster } from '../game/Monster.js'

export default function Watch() {
  const { roomId } = useParams()
  const canvasRef = useRef()
  const appRef = useRef()
  
  // Configurable zoom limits
  const [minZoom, setMinZoom] = useState(parseFloat(import.meta.env.VITE_MIN_ZOOM || 0.5))
  const [maxZoom, setMaxZoom] = useState(parseFloat(import.meta.env.VITE_MAX_ZOOM || 6))
  const [defaultZoom, setDefaultZoom] = useState(parseFloat(import.meta.env.VITE_DEFAULT_ZOOM || 1)) // Default zoom level
  
  // Highlighting
  const highlightRef = useRef(null)
  const mapDataRef = useRef(null) // To store map data for coordinate checks
  
  const [blueAgents, setBlueAgents] = useState([])
  const [redAgents, setRedAgents] = useState([])
  const [messages, setMessages] = useState([])
  const [connError, setConnError] = useState('')
  const roomRef = useRef(null)
  const mineralsLayerRef = useRef(null)
  const playersLayerRef = useRef(null)
  const obstaclesLayerRef = useRef(null)
  const monstersLayerRef = useRef(null)
  const mineralGRef = useRef(new Map())
  const playerGRef = useRef(new Map())
  const obstacleGRef = useRef(new Map())
  const [simulate, setSimulate] = useState(false)
  const simTimerRef = useRef(null)

  useEffect(() => {
    let destroyed = false
    const app = new PIXI.Application({
      resizeTo: window,
      backgroundColor: 0x0f172a,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    })
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen

    if (destroyed) return
    appRef.current = app
    const view = app.canvas || app.view || (app.renderer && app.renderer.view)
    if (canvasRef.current && view) {
      try {
        canvasRef.current.innerHTML = ''
        canvasRef.current.appendChild(view)
      } catch (e) {
        console.error('append canvas error', e)
      }
    }

    // Container for all game elements to support zoom/pan
    const worldLayer = new PIXI.Container()
    worldLayer.sortableChildren = true
    app.stage.addChild(worldLayer)

    const bgLayer = new PIXI.Container()
    const mineralsLayer = new PIXI.Container()
    const playersLayer = new PIXI.Container()
    const obstaclesLayer = new PIXI.Container()
    const monstersLayer = new PIXI.Container()
    
    // Add layers to worldLayer
    worldLayer.addChild(bgLayer)
    mineralsLayerRef.current = mineralsLayer
    playersLayerRef.current = playersLayer
    obstaclesLayerRef.current = obstaclesLayer
    monstersLayerRef.current = monstersLayer
    // Add layers individually to avoid issues
    try {
      console.log('Debug worldLayer:', worldLayer, typeof worldLayer.addChild);
      if (typeof worldLayer.addChild !== 'function') {
        console.error('CRITICAL: worldLayer.addChild is not a function!');
      }
      worldLayer.addChild(obstaclesLayer)
      worldLayer.addChild(mineralsLayer)
      worldLayer.addChild(monstersLayer)
      worldLayer.addChild(playersLayer)
    } catch (e) {
      console.error('Error adding layers to worldLayer:', e);
    }

    // Layers added to worldLayer
    
    // Zoom/Pan Logic
    let isDragging = false
    let lastPos = null

    const onWheel = (e) => {
      e.preventDefault()
      if (!worldLayer || !worldLayer.scale) return
      
      const scaleFactor = 1.1
      const direction = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor
      let newScale = worldLayer.scale.x * direction
      newScale = Math.max(minZoom, Math.min(newScale, maxZoom))
      
      const rect = view.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const worldPos = {
        x: (mouseX - worldLayer.x) / worldLayer.scale.x,
        y: (mouseY - worldLayer.y) / worldLayer.scale.y
      }
      
      worldLayer.scale.set(newScale)
      worldLayer.x = mouseX - worldPos.x * newScale
      worldLayer.y = mouseY - worldPos.y * newScale
    }

    const onMouseDown = (e) => {
      isDragging = true
      lastPos = { x: e.clientX, y: e.clientY }
    }

    // Highlight graphics
    const highlight = new PIXI.Graphics()
    worldLayer.addChild(highlight)
    highlightRef.current = highlight

  const onMouseMove = (e) => {
    // Handle highlighting
    const mapContainer = bgLayer.children[0]
    if (mapDataRef.current && highlightRef.current && mapContainer) {
      // Use PixiJS toLocal to handle all transforms (including pivot and scale)
      const rect = view.getBoundingClientRect()
      const localPos = mapContainer.toLocal({x: e.clientX - rect.left, y: e.clientY - rect.top})
      
      // Convert to hex coordinates
      const tileSize = mapDataRef.current.tileSize || 30
      const ox = 0
      const oy = 0
      
      const { q, r } = pixelToHex(localPos.x, localPos.y, tileSize, ox, oy)
      const { col, row } = axialToOffset(q, r)
      
      // Check bounds
      if (col >= 0 && col < mapDataRef.current.cols && row >= 0 && row < mapDataRef.current.rows) {
          const h = highlightRef.current
          // Ensure highlight is in the correct container (mapContainer)
          if (h.parent !== mapContainer) {
            h.parent?.removeChild(h)
            mapContainer.addChild(h)
          }

          h.clear()
          h.lineStyle(2, 0xFFFFFF, 0.8)
          h.beginFill(0xFFFFFF, 0.2)
          
          // Draw hex path
          // Center of hex in pixels (local to mapContainer)
          const { x: cx, y: cy } = offsetToPixel(col, row, tileSize)
          
          const pts = []
          for (let i = 0; i < 6; i++) {
              const ang = (Math.PI / 180) * (30 + i * 60);
              pts.push({ x: cx + Math.cos(ang) * tileSize, y: cy + Math.sin(ang) * tileSize });
          }
          
          h.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < 6; i++) {
              h.lineTo(pts[i].x, pts[i].y)
          }
          h.closePath()
          h.endFill()
      } else {
          highlightRef.current.clear()
      }
    }

    if (!isDragging || !lastPos) return
    const dx = e.clientX - lastPos.x
    const dy = e.clientY - lastPos.y
    // Check if worldLayer is valid
    if (worldLayer && typeof worldLayer.x === 'number') {
        worldLayer.x += dx
        worldLayer.y += dy
        
        // Clamp dragging to keep map within view
        const screenW = app.screen.width
        const screenH = app.screen.height
        
        const clampX = screenW * 0.8
        const clampY = screenH * 0.8
        
        worldLayer.x = Math.max(-clampX, Math.min(worldLayer.x, screenW + clampX))
        worldLayer.y = Math.max(-clampY, Math.min(worldLayer.y, screenH + clampY))
    }
    
    lastPos = { x: e.clientX, y: e.clientY }
  }

  // Helper for axial rounding
  // NOTE: This function is now imported from hexMath.js, removing local definition
  // function axialRound(x, y) { ... }

    const onMouseUp = () => {
      isDragging = false
      lastPos = null
    }

    if (canvasRef.current) {
      canvasRef.current.addEventListener('wheel', onWheel, { passive: false })
      canvasRef.current.addEventListener('mousedown', onMouseDown)
      canvasRef.current.addEventListener('contextmenu', (e) => e.preventDefault())
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    const title = new PIXI.Text({ text: `观战房间 ${roomId}`, style: { fill: '#e2e8f0', fontSize: 18 } })
    title.position.set(20, 20)
    // app.stage.addChild(title) // Title moved to UI overlay

    const ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:2567'
    const HTTP = import.meta.env.VITE_API_BASE || 'http://localhost:2567'
    // Load Map (Moved out and enhanced)
    fetch(`${HTTP}/rooms`).then(r => r.json()).then(async data => {
      if (destroyed) return
      const found = Array.isArray(data.rooms) ? data.rooms.find(x => x.roomId === roomId) : null
      const mapPath = found && found.metadata && found.metadata.mapPath
      
      if (mapPath) {
        console.log('Loading map from:', mapPath)
        const mapRes = await fetch(`${HTTP}${mapPath}`)
        const map = await mapRes.json()
        mapDataRef.current = map // Store map data for highlighting
        const mapContainer = await composeHexMapSprite(map)
        
        // Add Regions Layer
        if (map.regions && map.regionCells) {
             const regionsG = new PIXI.Graphics();
             regionsG.alpha = 0.3; // Semi-transparent overlay
             
             // Build a map of regionId -> color
             const regionColors = new Map();
             if (Array.isArray(map.regions)) {
                 map.regions.forEach(r => regionColors.set(r.id, r.color));
             }
             
             for (let r = 0; r < map.rows; r++) {
                 for (let c = 0; c < map.cols; c++) {
                     const regId = map.regionCells[r] && map.regionCells[r][c];
                     if (regId && regionColors.has(regId)) {
                         const colorStr = regionColors.get(regId);
                         const color = parseInt(colorStr.replace('#', ''), 16);
                         
                         const { x, y } = offsetToPixel(c, r, map.tileSize);
                         
                         regionsG.beginFill(color);
                         const pts = [];
                         for (let i = 0; i < 6; i++) {
                             const ang = (Math.PI / 180) * (30 + i * 60);
                             pts.push(x + Math.cos(ang) * map.tileSize, y + Math.sin(ang) * map.tileSize);
                         }
                         regionsG.drawPolygon(pts);
                         regionsG.endFill();
                     }
                 }
             }
             mapContainer.addChild(regionsG);
        }
        
        // Initialize pathfinder
        const pathfinder = new HexPathfinder(map);
        
        // Create background grid
        const gridG = new PIXI.Graphics()
        gridG.lineStyle(2, 0x1e293b, 1) // Slightly thicker and visible dark slate
        
        const extend = parseInt(import.meta.env.VITE_MAP_EXTEND || 50) 
        const cols = map.cols
        const rows = map.rows
        // Use map.tileSize directly
        const tileSize = map.tileSize || 30
        
        // Optimize drawing: use drawPolygon instead of lineTo loop for speed?
        // Or just loop. 
        // Note: offsetToPixel requires tileSize.
        
        for (let r = -extend; r < rows + extend; r++) {
          for (let c = -extend; c < cols + extend; c++) {
            // Optimization: Don't draw if inside map area to avoid z-fighting or redundancy
            if (c >= 0 && c < cols && r >= 0 && r < rows) continue;
            
            const { x, y } = offsetToPixel(c, r, tileSize)
            
            // Draw hex
            const pts = []
            for (let i = 0; i < 6; i++) {
                const ang = (Math.PI / 180) * (30 + i * 60);
                pts.push(x + Math.cos(ang) * tileSize, y + Math.sin(ang) * tileSize);
            }
            gridG.drawPolygon(pts)
          }
        }
        // Add grid to mapContainer at bottom
        mapContainer.addChildAt(gridG, 0)
        
        // Center the map logic
        const bounds = mapContainer.getLocalBounds()
        mapContainer.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        bgLayer.addChild(mapContainer)
        mapContainer.position.set(0, 0)
        
        // CRITICAL: Align other layers with map pivot
        // Map is pivoted by (cx, cy) and positioned at (0,0) of bgLayer.
        // bgLayer is at (0,0) of worldLayer.
        // monstersLayer is at (0,0) of worldLayer.
        // To align, monstersLayer must also be pivoted by the same amount and positioned at (0,0).
        // OR simply shift monstersLayer position to (-cx, -cy).
        // BUT mapContainer.pivot works relative to mapContainer's content origin.
        // Map's content origin (0,0) is at bounds.x, bounds.y.
        // Wait, map bounds might not start at 0,0 if there's an offset.
        // The safest way is to make monstersLayer a child of mapContainer?
        // No, mapContainer has sprites.
        // Let's just apply the same pivot and position to the other layers.
        
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        
        [mineralsLayerRef.current, playersLayerRef.current, obstaclesLayerRef.current, monstersLayerRef.current].forEach(layer => {
            if (layer) {
                layer.pivot.set(cx, cy);
                layer.position.set(0, 0);
            }
        });
        
        // Center worldLayer on screen and scale
        const screenW = app.screen.width
        const screenH = app.screen.height
        // Assuming worldLayer is defined in previous block scope
        // We access it here (it's in the same useEffect scope)
        // NOTE: If worldLayer was defined with 'const' inside useEffect above, it is available here.
        // But wait, React useEffect scope is one big function. Yes.
        const worldLayer = app.stage.children.find(c => c.sortableChildren === true) || app.stage.children[0] // Fallback or direct ref if variable is in scope
        // Actually 'worldLayer' variable IS in scope from the previous block replacement.
        
        if (typeof worldLayer !== 'undefined') {
            worldLayer.position.set(screenW / 2, screenH / 2)
            // Use default zoom level, but ensure it respects min/max
            const initialZoom = Math.max(minZoom, Math.min(defaultZoom, maxZoom))
            worldLayer.scale.set(initialZoom)
        }
      }
    }).catch(err => {
      console.error('Failed to load map:', err)
    })

    const client = new Client(ENDPOINT)
    client.joinById(roomId, { spectator: true })
      .then((room) => {
        if (destroyed) {
          try { room.leave() } catch {}
          return
        }
        roomRef.current = room
        
        // UI State Management
        const updateFromState = (state) => {
          try {
            const blues = []
            const reds = []
            if (state && state.players && typeof state.players.forEach === 'function') {
              state.players.forEach((p, id) => {
                if (!p) return
                if (p.role === 'agent') {
                  const item = { id, team: p.team, lastAt: p.lastAt, lastAction: p.lastAction, alive: p.alive }
                  if (p.team === 'blue') blues.push(item)
                  else if (p.team === 'red') reds.push(item)
                }
              })
            }
            setBlueAgents(blues)
            setRedAgents(reds)
            
            const msgs = []
            if (state && state.messages && typeof state.messages.forEach === 'function') {
              state.messages.forEach((m) => {
                if (m) msgs.push({ senderId: m.senderId, team: m.team, text: m.text, at: m.at })
              })
            }
            setMessages(msgs)
          } catch (e) {
            console.error('updateFromState error', e)
          }
        }
        updateFromState(room.state)
        room.onStateChange((state) => updateFromState(state))

        // Preload mineral textures
        const mineralTextures = new Map();
        if (mapDataRef.current) {
            preloadCategory(mapDataRef.current.biome, 'mineral').then(textures => {
                textures.forEach((tex, id) => mineralTextures.set(id, tex));
            });
        }

        // Mineral Management
        const updateMinerals = (minerals) => {
             const layer = mineralsLayerRef.current;
             if (!layer) return;
             
             // We'll iterate through state minerals and update/create sprites
             // state.minerals is an ArraySchema
             if (!minerals) return;
             
             // Mark all current sprites as potentially removable
             const currentSprites = new Set(mineralGRef.current.keys());
             
            const tileSize = (mapDataRef.current && mapDataRef.current.tileSize) || 30
            const barWidth = Math.max(18, tileSize * 0.9)
            const barHeight = Math.max(4, Math.floor(tileSize * 0.18))

            minerals.forEach((m) => {
                 currentSprites.delete(m.id);
                 
                let entry = mineralGRef.current.get(m.id);
                if (!entry) {
                     // Create new sprite
                     // We need a texture. For now, use a default or based on type/id?
                    // Minerals in map data have IDs 21-30.
                     // The state mineral doesn't have the 'cell value' directly, but it has type.
                     // But wait, the map generation assigned IDs 31-40 to minerals.
                     // We can map type to ID or just pick a random one if not consistent.
                     // Or just use ID 31 as default.
                     
                    let tex = mineralTextures.get(21); 
                     // Try to match type to ID if possible, or random
                     // types: 'iron', 'gold', 'diamond', 'coal', 'emerald'
                    // IDs: 21-30
                     // Let's just pick one based on hash of ID
                     const hash = m.id.split('').reduce((a,b)=>a+b.charCodeAt(0),0);
                    const texId = 21 + (hash % 10);
                     if (mineralTextures.has(texId)) tex = mineralTextures.get(texId);
                     
                    let sprite
                    if (tex) {
                       sprite = new PIXI.Sprite(tex);
                       sprite.anchor.set(0.5);
                    } else {
                       sprite = new PIXI.Graphics();
                       sprite.beginFill(0xFFD700);
                       sprite.drawCircle(0, 0, 10);
                       sprite.endFill();
                    }
                    const bar = new PIXI.Graphics()
                    const holder = new PIXI.Container()
                    holder.addChild(sprite)
                    holder.addChild(bar)
                    layer.addChild(holder)
                    entry = { holder, sprite, bar }
                    mineralGRef.current.set(m.id, entry);
                 }
                 
                const { holder, sprite, bar } = entry
                holder.position.set(m.x, m.y);
                 
                 // Visual status
                 if (m.done) {
                     sprite.alpha = 0.3; // Dim if collected
                     sprite.tint = 0x555555;
                    bar.clear()
                 } else {
                     sprite.alpha = 1.0;
                     sprite.tint = 0xFFFFFF;
                    const locked = m.lockedBy && m.lockedBy.length > 0
                    const ratio = m.requiredWork > 0 ? Math.max(0, Math.min(1, m.work / m.requiredWork)) : 0
                    bar.clear()
                    if (locked) {
                        const y = tileSize * 0.55
                        bar.beginFill(0x0f172a, 0.7)
                        bar.drawRoundedRect(-barWidth / 2, y, barWidth, barHeight, 2)
                        bar.endFill()
                        bar.beginFill(0x22c55e, 0.9)
                        bar.drawRoundedRect(-barWidth / 2, y, barWidth * ratio, barHeight, 2)
                        bar.endFill()
                    }
                 }
             });
             
             // Remove stale sprites
             currentSprites.forEach(id => {
                const entry = mineralGRef.current.get(id);
                if (entry && entry.holder) layer.removeChild(entry.holder);
                 mineralGRef.current.delete(id);
             });
        };
        
        // Initial load
        if (room.state.minerals) {
            updateMinerals(room.state.minerals);
            // Listen for changes
            room.state.minerals.onAdd = (m) => {
                updateMinerals(room.state.minerals);
                m.onChange = () => updateMinerals(room.state.minerals);
            };
            room.state.minerals.onRemove = () => updateMinerals(room.state.minerals);
            room.state.minerals.onChange = () => updateMinerals(room.state.minerals);
        }

        // Monster Management (PixiJS)
        const monsters = new Map(); // id -> Monster instance

        // Helper to spawn monster
        const spawnMonster = (player, sessionId) => {
             // console.log("Player added:", sessionId, player.monsterType);
             if (player.role !== 'agent') return;
             
             // Check if already exists
             if (monsters.has(sessionId)) return;

             const type = player.monsterType || 'Monster_1_Salamander';
             // Default to 30 if map not loaded yet, but try to use mapData
             // If map is not loaded, we might be spawning monsters at wrong scale
             // But we can update them later? Or wait?
             // Let's assume 30 is a safe default or we need to wait for map.
             const tileSize = (mapDataRef.current && mapDataRef.current.tileSize) || 30;
             
             console.log(`[Spawn] ${sessionId} Type:${type} TileSize:${tileSize} Pos:(${player.x},${player.y}) Hex:(${player.col},${player.row})`);

             const monster = new Monster(sessionId, type, tileSize);
             
             // If map isn't loaded, these coords might be raw or offset?
             // Server sends pixel coordinates (x, y). So we can use them directly.
             // Wait, server sends x,y which are PIXELS.
             // So we just need to place them.
             
             monster.x = player.x;
             monster.y = player.y;
             monster.init();
             
             monstersLayer.addChild(monster);
             monsters.set(sessionId, monster);
             
             // Initial sync
             monster.syncFromServer({
                 x: player.x,
                 y: player.y,
                 state: player.state,
                 alive: player.alive
             });
             
             // Listen for changes on this player object
             // Use .onChange for general updates
             player.onChange = (changes) => {
                 // console.log(`[Watch] Player ${sessionId} changed`, changes);
                 monster.syncFromServer({
                     x: player.x,
                     y: player.y,
                     state: player.state,
                     alive: player.alive
                 });
             };
             
             // Redundant listener to ensure we catch position updates
             // Sometimes onChange behaves differently depending on Colyseus version
             player.listen("x", (newX) => {
                 // console.log(`[Watch] Player ${sessionId} x changed to ${newX}`);
                 monster.syncFromServer({ x: newX, y: player.y });
             });
             player.listen("y", (newY) => {
                  monster.syncFromServer({ x: player.x, y: newY });
              });
              
              // Ensure state changes (idle <-> moving) are synced for animation
              player.listen("state", (newState) => {
                  monster.syncFromServer({ 
                      x: player.x, 
                      y: player.y, 
                      state: newState 
                  });
              });
         };

        // Retry mechanism for map data
        const attemptSpawn = () => {
             if (destroyed) return;
             
             // We can spawn even if map not fully loaded, as long as we have pixel coords
             // But maybe layer order matters?
             // monstersLayer is already added to worldLayer.
             
             room.state.players.forEach((player, sessionId) => {
                  spawnMonster(player, sessionId);
             });
        };

        // Try immediately
        attemptSpawn();
        
        // Also retry after a short delay to ensure map might be ready (optional but safer)
        setTimeout(attemptSpawn, 500);
        setTimeout(attemptSpawn, 2000);

        // Player Added
        room.state.players.onAdd = (player, sessionId) => {
             // Only spawn monsters for 'agent' role players
             // Human observers (role !== 'agent') do not have a monster body
             if (player.role === 'agent') {
                spawnMonster(player, sessionId);
             }
        };

        // Player Removed
        room.state.players.onRemove = (player, sessionId) => {
            const m = monsters.get(sessionId);
            if (m) {
                monstersLayer.removeChild(m);
                monsters.delete(sessionId);
            }
        };

        // Ticker for smooth animation
        const updateTicker = (delta) => {
            monsters.forEach(m => m.update(delta));
        };
        app.ticker.add(updateTicker);

      })
      .catch((e) => {
        console.error('Join error', e)
        setConnError('Failed to join room: ' + String(e))
      })

    return () => {
      destroyed = true
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current)
        simTimerRef.current = null
      }
      if (roomRef.current) {
        try { roomRef.current.leave() } catch {}
        roomRef.current = null
      }
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('wheel', onWheel)
        canvasRef.current.removeEventListener('mousedown', onMouseDown)
      }
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      app.destroy(true, { children: true })
    }
  }, [roomId])

  useEffect(() => {
    if (!simulate) {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current)
        simTimerRef.current = null
      }
      return
    }
    if (!roomRef.current) return
    const tick = () => {
      const room = roomRef.current
      const state = room.state
      const me = state && state.players && state.players.get ? state.players.get(room.sessionId) : null
      if (!me) return
      const w = state.width || 1600
      const h = state.height || 900
      const nx = Math.max(0, Math.min(w, (me.x || 0) + Math.round(Math.random() * 200 - 100)))
      const ny = Math.max(0, Math.min(h, (me.y || 0) + Math.round(Math.random() * 200 - 100)))
      try { room.send('move', { x: nx, y: ny }) } catch {}
    }
    simTimerRef.current = setInterval(tick, 900)
    return () => {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current)
        simTimerRef.current = null
      }
    }
  }, [simulate])

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-slate-900">
      <div ref={canvasRef} className="absolute inset-0 z-0" />
      
      {/* 浮动 UI：房间标题 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-slate-200 text-xl font-bold drop-shadow-md">
        观战房间 {roomId}
      </div>

      {/* 浮动 UI：玩家阵营列表 (左侧) */}
      <div className="absolute top-16 left-4 bottom-4 w-64 flex flex-col gap-4 z-10 pointer-events-none">
        {/* 蓝队 */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-blue-900/50 shadow-lg flex-1 overflow-hidden flex flex-col">
          <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            Blue Team ({blueAgents.filter(a => a.alive !== false).length})
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pointer-events-auto pr-2 custom-scrollbar">
            {blueAgents.map(a => (
              <div key={a.id} className={`text-xs p-2 rounded ${a.alive === false ? 'bg-slate-700/50 text-slate-500' : 'bg-slate-700/80 text-slate-200'}`}>
                <div className="flex justify-between">
                  <span className="font-mono">{a.id.slice(0, 8)}</span>
                  <span>{a.alive === false ? 'DEAD' : 'ALIVE'}</span>
                </div>
                <div className="mt-1 opacity-70 truncate">{a.lastAction || 'idle'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 红队 */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-red-900/50 shadow-lg flex-1 overflow-hidden flex flex-col">
          <h3 className="text-red-400 font-bold mb-2 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            Red Team ({redAgents.filter(a => a.alive !== false).length})
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pointer-events-auto pr-2 custom-scrollbar">
            {redAgents.map(a => (
              <div key={a.id} className={`text-xs p-2 rounded ${a.alive === false ? 'bg-slate-700/50 text-slate-500' : 'bg-slate-700/80 text-slate-200'}`}>
                <div className="flex justify-between">
                  <span className="font-mono">{a.id.slice(0, 8)}</span>
                  <span>{a.alive === false ? 'DEAD' : 'ALIVE'}</span>
                </div>
                <div className="mt-1 opacity-70 truncate">{a.lastAction || 'idle'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 浮动 UI：辩论记录 (右侧/底部) */}
      <div className="absolute bottom-4 right-4 w-96 h-64 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-xl z-10 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-slate-200 font-bold text-sm">辩论记录</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar pointer-events-auto font-mono text-xs">
          {messages.length === 0 && <div className="text-slate-500 italic">暂无消息...</div>}
          {messages.map((m, i) => (
            <div key={i} className="flex gap-2">
              <span className={m.team === 'blue' ? 'text-blue-400' : (m.team === 'red' ? 'text-red-400' : 'text-slate-400')}>
                [{m.team?.toUpperCase() || 'SYS'}]
              </span>
              <span className="text-slate-300 break-all">{m.text}</span>
            </div>
          ))}
        </div>
      </div>

      {connError && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
          <div className="bg-red-900/80 p-6 rounded-xl border border-red-500 text-white max-w-md text-center">
            <h3 className="text-xl font-bold mb-2">Connection Error</h3>
            <p>{connError}</p>
          </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  )
}
