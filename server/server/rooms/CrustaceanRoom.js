const { Room } = require('colyseus');
const { State, Mineral } = require('../schema/State');
const hex = require('../map/hex');

class CrustaceanRoom extends Room {
  onCreate(options) {
    this.autoDispose = true; // Allow room to close when empty
    this.setPatchRate(50); // 20 FPS updates
    this.setState(new State());
    this.maxClients = 256;
    const mapPath = (options && options.mapPath) || '';
    this.setMetadata({ title: '龙虾乱斗', mode: 'standard', blue: 0, red: 0, mapPath });
    const cfg = {
      cols: (options && options.cols) || 30,
      rows: (options && options.rows) || 20,
      obstacleRatio: (options && options.obstacleRatio) || 0.15,
      mineralRatio: (options && options.mineralRatio) || 0.06,
      tileSize: (options && options.tileSize) || 30,
      biome: 'Desert',
    };
    let gen;
    try {
      const fs = require('fs');
      const path = require('path');
      if (mapPath && typeof mapPath === 'string') {
        const rel = mapPath.replace(/^\/maps\//, '');
        const file = path.join(__dirname, '..', 'maps', rel);
        console.log(`[CrustaceanRoom] Loading map from: ${file}`);
        
        if (fs.existsSync(file)) {
          const data = JSON.parse(fs.readFileSync(file));
          console.log(`[CrustaceanRoom] Loaded map data. TileSize: ${data.tileSize}`);
          gen = {
            cols: data.cols, rows: data.rows, tileSize: data.tileSize, biome: data.biome,
            blocked: new Set(),
            minerals: []
          };
          for (let r = 0; r < data.rows; r++) {
            for (let c = 0; c < data.cols; c++) {
              const v = data.cells[r][c];
              const { q, r: ar } = hex.offsetToAxial(c, r);
              
              if (v >= 11 && v <= 20) {
                  gen.blocked.add(`${q},${ar}`);
              } else if ((v >= 21 && v <= 30) || (v >= 31 && v <= 40)) {
                  gen.minerals.push({ q, r: ar, biome: data.biome });
              } else if (v === 2) {
                  gen.blocked.add(`${q},${ar}`);
              } 
              
              if (data.regionCells && data.regionCells[r] && data.regionCells[r][c]) {
                  const regId = data.regionCells[r][c];
                  if (regId > 0) {
                       if (!gen.regions) gen.regions = new Map();
                       gen.regions.set(`${q},${ar}`, regId);
                  }
              }
              
              if ((v >= 1 && v <= 10) || v === 1 || v === 3) {
                   if (v === 3) gen.minerals.push({ q, r: ar, biome: data.biome });
              }
            }
          }
          
          if (gen.minerals.length === 0) {
              const walkable = [];
              for (let r = 0; r < data.rows; r++) {
                  for (let c = 0; c < data.cols; c++) {
                      const v = data.cells[r][c];
                      if ((v >= 1 && v <= 10) || v === 1) {
                           const { q, r: ar } = hex.offsetToAxial(c, r);
                           walkable.push({ q, r: ar, biome: data.biome });
                      }
                  }
              }
              
              for (let i = walkable.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [walkable[i], walkable[j]] = [walkable[j], walkable[i]];
              }
              const mineralCount = Math.floor(walkable.length * 0.06);
              gen.minerals = walkable.slice(0, mineralCount);
          }
          if (data.regions) {
              gen.regionDefs = data.regions;
          }
        }
      }
    } catch (e) {
        console.error('[CrustaceanRoom] Map load error:', e);
    }
    if (!gen) {
        // Fallback to empty map if file load fails
        console.error("Map load failed, using empty map.");
        gen = { 
            cols: cfg.cols, rows: cfg.rows, tileSize: cfg.tileSize, biome: cfg.biome, 
            blocked: new Set(), minerals: [] 
        };
    }
    
    // Apply env override globally to ensure movement logic matches spawn logic
    if (process.env.GAME_SPAWN_TILE_SIZE) {
        const overrideSize = parseInt(process.env.GAME_SPAWN_TILE_SIZE);
        console.log(`[CrustaceanRoom] Overriding tileSize from ${gen.tileSize} to ${overrideSize}`);
        gen.tileSize = overrideSize;
    }
    
    this.hexConfig = gen;
    const width = Math.ceil(cfg.tileSize * Math.sqrt(3) * (cfg.cols + 1) + 120);
    const height = Math.ceil(cfg.tileSize * (1.5 * cfg.rows + 1) + 120);
    this.state.width = width;
    this.state.height = height;

    // Populate State Minerals from HexConfig
    if (this.hexConfig.minerals && this.hexConfig.minerals.length > 0) {
        const kinds = ['iron', 'gold', 'diamond', 'coal', 'emerald'];
        this.hexConfig.minerals.forEach((m, i) => {
            const min = new Mineral();
            min.id = `M${i + 1}`;
            min.type = kinds[i % kinds.length];
            min.difficulty = 1 + (i % 3);
            min.requiredWork = this.randomMiningDuration();
            min.work = 0;
            min.lockedBy = '';
            min.respawnAt = 0;
            min.q = m.q;
            min.r = m.r;
            
            // Calculate pixel position
            const pix = hex.toPixel(m.q, m.r, this.hexConfig.tileSize, 0, 0);
            min.x = pix.x;
            min.y = pix.y;
            
            this.state.minerals.push(min);
        });
        console.log(`[CrustaceanRoom] Populated ${this.state.minerals.length} minerals into state.`);
    }

    // Message Handlers
    this.onMessage("move", (client, message) => {
        const player = this.state.players.get(client.sessionId);
        if (player && player.alive && player.state !== 'dead') {
            if (player.state === 'mining') this.cancelMining(player, client.sessionId);
            let tq = message.q;
            let tr = message.r;
            if (tq === undefined && message.col !== undefined && message.row !== undefined) {
                 const ax = hex.offsetToAxial(message.col, message.row);
                 tq = ax.q;
                 tr = ax.r;
            }
            if (tq !== undefined && tr !== undefined) {
                 this.moveTo(player, tq, tr);
            }
        }
    });

    this.onMessage("stop", (client) => {
        const player = this.state.players.get(client.sessionId);
        if (player && player.alive) {
            if (player.state === 'mining') this.cancelMining(player, client.sessionId);
            player.path.clear();
            player.state = 'idle';
        }
    });

    this.onMessage("kill", (client, message) => {
        const player = this.state.players.get(client.sessionId);
        if (player && player.alive && player.identity === 'duck') {
             const targetId = message.targetId;
             const target = this.state.players.get(targetId);
             if (target && target.alive && target.identity !== 'duck') {
                 const dist = hex.heuristic({q: player.q, r: player.r}, {q: target.q, r: target.r});
                 if (dist <= 1.5) { 
                     if (!player.cooldowns.get('kill') || player.cooldowns.get('kill') <= 0) {
                         target.alive = false;
                         target.state = 'dead';
                         target.monsterType = 'tombstone';
                         player.cooldowns.set('kill', 25000);
                         console.log(`[Kill] ${player.monsterType} killed ${target.monsterType}`);
                     }
                 }
             }
        }
    });

    this.onMessage("getMinerals", (client) => {
        client.send("minerals", this.hexConfig.minerals);
    });

    this.onMessage("getRegions", (client) => {
        const regions = {};
        if (this.hexConfig.regions) {
            for (const [key, val] of this.hexConfig.regions) {
                regions[key] = val;
            }
        }
        client.send("regions", {
            defs: this.hexConfig.regionDefs || [],
            map: regions
        });
    });
    
    // Spawn AI Agents
    this.spawnAgents(8); // 8 Agents
    
    // Start Simulation
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 200); // 5Hz is enough for simple logic
  }

  spawnAgents(count) {
    const roles = ['duck', 'duck', 'goose', 'goose', 'goose', 'goose', 'goose', 'goose', 'goose', 'goose']; // 2 Ducks, 8 Geese
    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const monsterTypes = [
        "Monster_1_Salamander",
        "Monster_2_Skulled Salamander",
        "Monster_3_Charged Salamander",
        "Monster_4_Armored Salamander",
        "Monster_5_Yeti",
        "Monster_6_Beast Yeti",
        "Monster_7_Chained Yeti",
        "Monster_8_Slime",
        "Monster_9_Evil Slime",
        "Monster_10_Bird Slime"
    ];

    for (let i = 0; i < count; i++) {
        const id = `agent_${i}`;
        const role = roles[i % roles.length];
        const type = monsterTypes[i % monsterTypes.length];
        
        // Force spawn at first row (row=0), sequential columns (0 to 7)
        // For row 0:
        // q = col - (0 - 0)/2 = col
        // r = 0
        const q = i;
        const r = 0;
        
        this.state.addPlayer(id, role === 'duck' ? 'red' : 'blue', 'agent');
        const p = this.state.players.get(id);
        p.identity = role;
        p.monsterType = type;
        p.q = q;
        p.r = r;
        p.col = q + (r - (r&1))/2; // row is 0, so (r&1) is 0. col = q.
        p.row = r;
        p.targetQ = q;
        p.targetR = r;
        
        // Use env variables for spawn tweaks if provided
        const spawnTileSize = process.env.GAME_SPAWN_TILE_SIZE ? parseInt(process.env.GAME_SPAWN_TILE_SIZE) : this.hexConfig.tileSize;
        const ox = parseInt(process.env.GAME_SPAWN_OFFSET_X || 0);
        const oy = parseInt(process.env.GAME_SPAWN_OFFSET_Y || 0);

        const pix = hex.toPixel(p.q, p.r, spawnTileSize, ox, oy);
        p.x = pix.x;
        p.y = pix.y;
        
        console.log(`Spawned ${id} at Hex(${p.q},${p.r}) -> Pixel(${p.x},${p.y})`);
        
        // Initial cooldowns
        if (role === 'duck') {
            p.cooldowns.set('kill', 10000); // 10s initial kill cooldown
        }
        
        // Set initial state to idle to trigger animation
        p.state = 'idle';
        p.lastAction = 'idle'; // Also set lastAction for UI
    }
  }

  getRandomWalkable() {
      // Try to find a walkable spot not blocked
      // Use map data if available, otherwise random
      const cols = this.hexConfig.cols;
      const rows = this.hexConfig.rows;
      let q, r, key;
      let safety = 0;
      do {
          const col = Math.floor(Math.random() * cols);
          const row = Math.floor(Math.random() * rows);
          const ax = hex.offsetToAxial(col, row);
          q = ax.q;
          r = ax.r;
          key = `${q},${r}`;
          safety++;
      } while ((this.hexConfig.blocked.has(key) || !this.isWalkable(q, r)) && safety < 100);
      return { q, r };
  }

  isWalkable(q, r) {
      // Check bounds
      // Convert to offset to check cols/rows
      const col = q + (r - (r & 1)) / 2;
      const row = r;
      if (col < 0 || col >= this.hexConfig.cols || row < 0 || row >= this.hexConfig.rows) return false;
      return !this.hexConfig.blocked.has(`${q},${r}`);
  }

  update(deltaTime) {
      this.updateMineralRespawns(Date.now());
      // Process AI Logic
      this.state.players.forEach((player, id) => {
          if (!player.alive) return;
          
          // Cooldowns
          player.cooldowns.forEach((val, key) => {
              if (val > 0) player.cooldowns.set(key, Math.max(0, val - deltaTime));
          });

          // State Machine
          if (player.state === 'moving') {
              this.handleMovement(player, deltaTime, id);
          } else if (player.state === 'mining') {
              this.handleMining(player, deltaTime, id);
          } else {
              // IDLE - Decide what to do
              this.decideAction(player);
          }
      });
  }

  handleMovement(player, deltaTime, playerId) {
      // Simple movement: Move towards target pixel
      // If close enough, pop next path node
      
      const targetPix = hex.toPixel(player.targetQ, player.targetR, this.hexConfig.tileSize);
      const dx = targetPix.x - player.x;
      const dy = targetPix.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 0.1 * deltaTime; // pixels per ms? Adjust as needed.
      
      if (dist < speed) {
          player.x = targetPix.x;
          player.y = targetPix.y;
          player.q = player.targetQ;
          player.r = player.targetR;
          
          // Update offset coords
          const row = player.r;
          const col = player.q + (row - (row&1)) / 2;
          player.col = col;
          player.row = row;
          
          // Next step
          if (player.path.length > 0) {
              const nextKey = player.path.shift();
              const [nq, nr] = nextKey.split(',').map(Number);
              player.targetQ = nq;
              player.targetR = nr;
          } else {
              player.state = 'idle';
              
              const mineral = this.state.minerals.find(m => m.q === player.q && m.r === player.r);
              if (mineral && !mineral.done && !mineral.lockedBy) {
                  mineral.lockedBy = playerId;
                  mineral.work = 0;
                  mineral.requiredWork = this.randomMiningDuration();
                  player.state = 'mining';
                  player.assignedTaskId = mineral.id;
              }
          }
      } else {
          const angle = Math.atan2(dy, dx);
          player.x += Math.cos(angle) * speed;
          player.y += Math.sin(angle) * speed;
      }
  }

  handleMining(player, deltaTime, playerId) {
      if (!player.assignedTaskId) {
          player.state = 'idle';
          return;
      }
      const mineral = this.state.minerals.find(m => m.id === player.assignedTaskId);
      if (!mineral || mineral.done || mineral.lockedBy !== playerId) {
          this.cancelMining(player, playerId);
          return;
      }
      if (player.q !== mineral.q || player.r !== mineral.r) {
          this.cancelMining(player, playerId);
          return;
      }
      mineral.work = Math.min(mineral.requiredWork, mineral.work + deltaTime);
      if (mineral.work >= mineral.requiredWork) {
          mineral.done = true;
          mineral.doneBy = playerId;
          mineral.lockedBy = '';
          mineral.respawnAt = Date.now() + 30000;
          this.state.mineralsCollected += 1;
          player.assignedTaskId = '';
          player.state = 'idle';
          if (this.state.mineralsCollected >= 21) {
              this.state.phase = 'ended';
              this.state.winner = 'blue';
              this.broadcast('game_over', { winner: 'blue', reason: 'minerals_collected' });
          }
      }
  }

  cancelMining(player, playerId) {
      if (!player.assignedTaskId) return;
      const mineral = this.state.minerals.find(m => m.id === player.assignedTaskId);
      if (mineral && mineral.lockedBy === playerId && !mineral.done) {
          mineral.lockedBy = '';
          mineral.work = 0;
      }
      player.assignedTaskId = '';
      if (player.state === 'mining') player.state = 'idle';
  }

  updateMineralRespawns(now) {
      this.state.minerals.forEach(m => {
          if (m.done && m.respawnAt > 0 && now >= m.respawnAt) {
              m.done = false;
              m.doneBy = '';
              m.work = 0;
              m.requiredWork = this.randomMiningDuration();
              m.lockedBy = '';
              m.respawnAt = 0;
          }
      });
  }

  randomMiningDuration() {
      return 2000 + Math.floor(Math.random() * 4001);
  }

  decideAction(player) {
      // Client-driven AI. Do nothing here.
  }

  findKillTarget(duck) {
      // 1. Find victims in range (1 hex = neighbors)
      const neighbors = hex.neighbors({ q: duck.q, r: duck.r });
      const victims = [];
      
      this.state.players.forEach((p, id) => {
          if (p !== duck && p.alive && p.identity === 'goose') {
              // Check if p is in neighbors OR at same spot
              if ((p.q === duck.q && p.r === duck.r) || neighbors.some(n => n.q === p.q && n.r === p.r)) {
                  victims.push(p);
              }
          }
      });

      if (victims.length === 0) return null;

      // 2. Check Vision (Witnesses)
      // Vision Radius ~ 6 hexes (approx 10x6 box)
      const witnesses = [];
      this.state.players.forEach((p, id) => {
          if (p !== duck && p.alive && !victims.includes(p)) {
              // Check distance
              const dist = hex.heuristic({q: duck.q, r: duck.r}, {q: p.q, r: p.r});
              if (dist <= 6) { // 6 hex radius approx
                  witnesses.push(p);
              }
          }
      });

      // If witnesses exist, don't kill (simple AI)
      if (witnesses.length > 0) return null;

      // Pick random victim
      return victims[Math.floor(Math.random() * victims.length)];
  }

  moveTo(player, tq, tr) {
      // Pathfinding
      const path = hex.axialAStar({q: player.q, r: player.r}, {q: tq, r: tr}, this.hexConfig.blocked, {cols: this.hexConfig.cols, rows: this.hexConfig.rows});
      
      if (path && path.length > 0) {
          player.path.clear();
          // Skip first (current pos)
          for (let i = 1; i < path.length; i++) {
              player.path.push(`${path[i].q},${path[i].r}`);
          }
          if (player.path.length > 0) {
              const first = player.path.shift();
              const [q, r] = first.split(',').map(Number);
              player.targetQ = q;
              player.targetR = r;
              player.state = 'moving';
          }
      }
  }

  onJoin(client, options) {
      console.log("Client joined:", client.sessionId, "Role: Observer");
      // Add observer to state but don't give them a body/role yet
      // They are just watching.
      // We can use a specific 'observer' role or just not add them to players map?
      // If we don't add them to players map, they can still receive state updates.
      // But if we want to show them in a list or chat, we might need them in state.
      // Let's add them as 'observer' role.
      
      this.state.addPlayer(client.sessionId, 'spectator', 'observer');
      const p = this.state.players.get(client.sessionId);
      if (p) {
          p.alive = false; // Observers are not alive
          p.x = -1000; // Off-screen
          p.y = -1000;
      }
  }

  onLeave(client, consented) {
    this.state.removePlayer(client.sessionId);
    this.setMetadata({
      ...this.metadata,
      blue: this.state.countByTeam('blue'),
      red: this.state.countByTeam('red'),
    });
  }

  onDispose() {
    // noop
  }

  countAgents() {
    let n = 0;
    this.state.players.forEach(p => { if (p.role === 'agent') n++; });
    return n;
  }

  startGame() {
    const ids = [];
    this.state.players.forEach((p, id) => { if (p.role === 'agent') ids.push(id); });
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
    }
    const redIds = new Set(ids.slice(0, 2));
    this.state.players.forEach((p, id) => {
      if (p.role !== 'agent') return;
      p.team = redIds.has(id) ? 'red' : 'blue';
      p.alive = true;
      p.assignedTaskId = '';
    });
    this.state.mineralsCollected = 0;
    if (!this.state.minerals || this.state.minerals.length === 0) {
      const cfg = this.hexConfig || { tileSize: 30 };
      this.state.minerals.length = 0;
      let mid = 1;
      const pick = [];
      const seen = new Set();
      for (let i = 0; i < (this.hexConfig.minerals || []).length; i++) pick.push(this.hexConfig.minerals[i]);
      for (let i = 0; i < pick.length; i++) {
        const c = pick[i];
        const k = `${c.q},${c.r}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const m = new (require('../schema/State').Mineral)();
        m.id = `M${mid++}`;
        const pos = hex.toPixel(c.q, c.r, cfg.tileSize);
        m.x = Math.floor(pos.x);
        m.y = Math.floor(pos.y);
        m.q = c.q;
        m.r = c.r;
        m.type = 'ore';
        m.difficulty = 1 + (Math.floor(Math.random() * 3));
        m.requiredWork = this.randomMiningDuration();
        m.work = 0;
        m.lockedBy = '';
        m.respawnAt = 0;
        m.done = false;
        this.state.minerals.push(m);
        if (this.state.minerals.length >= 21) break;
      }
    }
    this.state.phase = 'active';
  }

  simTick() {
    this.state.tick++;
    if (this.state.phase !== 'active') return;
    if (this.state.mineralsCollected >= 21) {
      this.state.phase = 'ended';
      this.state.winner = 'blue';
      return;
    }
    const blueAlive = [];
    this.state.players.forEach((p, id) => {
      if (p.role === 'agent' && p.team === 'blue' && p.alive) blueAlive.push({ id, p });
    });
    if (blueAlive.length === 0) {
      this.state.phase = 'ended';
      this.state.winner = 'red';
      return;
    }
    const step = 1;
    this.state.players.forEach((p, id) => {
      if (p.role !== 'agent') return;
      if (!p.alive) return;
      if (p.team === 'blue') {
        if (!p.assignedTaskId) {
          let best = null, bestD = Infinity;
          this.state.minerals.forEach(m => {
            if (m.done) return;
            const dx = (p.x - m.x), dy = (p.y - m.y);
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD) { bestD = d2; best = m; }
          });
          if (best) p.assignedTaskId = best.id;
        }
        let target = null;
        if (p.assignedTaskId) {
          for (let i = 0; i < this.state.minerals.length; i++) {
            const m = this.state.minerals[i];
            if (m.id === p.assignedTaskId && !m.done) { target = m; break; }
          }
        }
        if (!target) {
          p.assignedTaskId = '';
        } else {
          const cfg = this.hexConfig;
          const startAx = hex.fromPixel(p.x, p.y, cfg.tileSize);
          const goalCell = this.mineralCells.get(p.assignedTaskId);
          const goalAx = { q: goalCell.q, r: goalCell.r };
          const blocked = cfg.blocked;
          const bounds = { cols: cfg.cols, rows: cfg.rows };
          const path = hex.axialAStar({ q: startAx.q, r: startAx.r }, goalAx, blocked, bounds);
          if (path && path.length > 1) {
            const next = path[1];
            const pos = hex.toPixel(next.q, next.r, cfg.tileSize);
            p.x = pos.x;
            p.y = pos.y;
          }
          this.state.clampPlayer(id);
          this.state.tryCompleteNearby(id, 30);
        }
      } else if (p.team === 'red') {
        let best = null, bestD = Infinity;
        for (let i = 0; i < blueAlive.length; i++) {
          const b = blueAlive[i].p;
          const dx = (p.x - b.x), dy = (p.y - b.y);
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = blueAlive[i]; }
        }
        if (best) {
          const cfg = this.hexConfig;
          const startAx = hex.fromPixel(p.x, p.y, cfg.tileSize);
          const goalAx = hex.fromPixel(best.p.x, best.p.y, cfg.tileSize);
          const path = hex.axialAStar({ q: startAx.q, r: startAx.r }, { q: goalAx.q, r: goalAx.r }, cfg.blocked, { cols: cfg.cols, rows: cfg.rows });
          if (path && path.length > 1) {
            const next = path[1];
            const pos = hex.toPixel(next.q, next.r, cfg.tileSize);
            p.x = pos.x;
            p.y = pos.y;
          }
          this.state.clampPlayer(id);
          const kdx = p.x - best.p.x, kdy = p.y - best.p.y;
          if ((kdx * kdx + kdy * kdy) <= 25 * 25) {
            best.p.alive = false;
          }
        }
      }
    });
    this.setMetadata({
      ...this.metadata,
      blue: this.state.countByTeam('blue'),
      red: this.state.countByTeam('red'),
    });
  }
}

module.exports = { CrustaceanRoom };
