const { Client } = require('colyseus.js');

const API_BASE = process.env.API_BASE || 'http://localhost:2567';
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://localhost:2567';
const NAME = process.env.AGENT_NAME || `agent_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = process.env.AGENT_PASSWORD || 'P@ssw0rd';

// Hex Helper Functions
function heuristic(a, b) {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  const ds = Math.abs((-a.q - a.r) - (-b.q - b.r));
  return Math.max(dq, dr, ds);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function registerAndClaim() {
  let name = NAME;
  let data;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD })
      });
      if (r.status === 409) {
        name = `${NAME}_${Math.random().toString(36).slice(2, 6)}`;
        continue;
      }
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`register failed: ${r.status} ${t}`);
      }
      data = await r.json();
      break;
    } catch (e) {
      console.warn(`[agent] register attempt ${attempt} failed: ${e.message}`);
      await sleep(1000);
    }
  }
  if (!data) throw new Error('register failed after retries');
  console.log(`[agent] registered: ${name}`);
  
  // auto-claim for demo
  try {
    const claim = await fetch(data.claim_url);
    if (!claim.ok) {
      console.warn(`[agent] claim visit returned ${claim.status}, continue`);
    } else {
      console.log(`[agent] claimed`);
    }
  } catch (e) {
    console.warn(`[agent] claim failed: ${e.message}`);
  }

  // wait until active
  for (let i = 0; i < 20; i++) {
    try {
      const s = await fetch(`${API_BASE}/api/agents/status?api_key=${data.apiKey}`);
      const sj = await s.json();
      if (sj.claimed) {
        return { apiKey: data.apiKey };
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('claim timeout');
}

async function matchmaking() {
  const r = await fetch(`${API_BASE}/api/matchmaking/join`, { method: 'POST' });
  if (!r.ok) throw new Error(`join queue failed: ${r.status}`);
  const { ticket } = await r.json();
  for (let i = 0; i < 20; i++) {
    const s = await fetch(`${API_BASE}/api/matchmaking/status?ticket=${ticket}`);
    const sj = await s.json();
    if (sj.status === 'ready' && sj.roomId) return sj.roomId;
    await sleep(500);
  }
  throw new Error('matchmaking timeout');
}

async function autoBehavior(room) {
  let minerals = [];
  let regions = { defs: [], map: {} };
  
  // Request minerals and regions from server
  room.send("getMinerals");
  room.send("getRegions");
  
  room.onMessage("minerals", (data) => {
    minerals = data;
    console.log(`[agent] Received ${minerals.length} minerals`);
  });

  room.onMessage("regions", (data) => {
    regions = data;
    console.log(`[agent] Received ${regions.defs.length} region definitions`);
  });

  room.onStateChange((state) => {
    // Optional: Log state changes if needed
  });

  setInterval(() => {
    const state = room.state;
    // Find my player object
    let me = null;
    // state.players is a MapSchema, we can iterate it
    state.players.forEach((p, id) => {
        if (id === room.sessionId) me = p;
    });
    
    if (!me || me.alive === false) return;
    
    // If currently mining, wait until finished
    if (me.state === 'mining') {
        // console.log('[agent] Mining...');
        return;
    }

    // Check current region
    const regionId = regions.map[`${me.q},${me.r}`];
    if (regionId) {
        const regDef = regions.defs.find(d => d.id === regionId);
        if (regDef) {
            // console.log(`[agent] I am in region: ${regDef.name}`);
        }
    }

    if (minerals.length > 0) {
      // Filter out completed minerals using state.minerals
      // Map minerals (from getMinerals) to state.minerals by index (id M1..Mn)
      // state.minerals is ArraySchema
      const availableMinerals = minerals.filter((m, i) => {
          const stateMin = state.minerals[i];
          // Check if stateMin exists and is not done
          return stateMin && !stateMin.done;
      });
      
      if (availableMinerals.length === 0) {
          // All done? Or wait for respawn?
          // Just wander?
          return;
      }

      // Find nearest mineral within vision range
      const VISION_RANGE = 200; // Increased vision range (global)
      let nearest = null;
      let minDist = Infinity;
      
      for (const m of availableMinerals) {
        const dist = heuristic({q: me.q, r: me.r}, {q: m.q, r: m.r});
        if (dist <= VISION_RANGE && dist < minDist) {
          minDist = dist;
          nearest = m;
        }
      }
      
      if (nearest) {
        if (minDist > 0) {
            // console.log(`[agent] Moving to nearest mineral at (${nearest.q},${nearest.r}) dist=${minDist}`);
            room.send("move", { q: nearest.q, r: nearest.r });
        } else {
            // We are at the mineral. 
            // Server handles collection automatically when close.
            // Pick a random other mineral to keep moving?
            const randomMineral = availableMinerals[Math.floor(Math.random() * availableMinerals.length)];
            room.send("move", { q: randomMineral.q, r: randomMineral.r });
        }
      }
    } else {
      // No minerals?
    }
  }, 1000);
}

async function run() {
  console.log(`[agent] start NAME=${NAME}`);
  const { apiKey } = await registerAndClaim();
  console.log(`[agent] apiKey acquired`);
  let room;
  const client = new Client(WS_ENDPOINT);
  try {
    const roomId = await matchmaking();
    console.log(`[agent] got room ${roomId}`);
    room = await client.joinById(roomId, { spectator: false });
  } catch (e) {
    console.warn(`[agent] matchmaking fallback: ${e.message}, using joinOrCreate('lobster')`);
    room = await client.joinOrCreate('lobster');
  }
  console.log(`[agent] joined room ${room.id}`);
  await autoBehavior(room);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
